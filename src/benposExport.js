import * as XLSX from 'xlsx-js-style';
import api from './api/axios';
import { deriveCategoryDescription } from './deriveCategoryDescription';
import { getCategoryMap, loadCategoryMapping, normCategoryDesc } from './categoryMappingCache';
import { mapOccupation, mapGender, flushUnmappedCodes } from './occupationGenderMapping';
import { mapBankAccountType, flushUnmappedBankAccountTypes } from './bankAccountTypeMapping';
import { mapPanType, flushUnmappedPanTypes } from './panTypeMapping';
import { buildXlsxBlob } from './xlsxStream';
import { Zip, ZipPassThrough } from 'fflate';

// ── Pagination helper ─────────────────────────────────────────────────────────
// Fetches all pages from an endpoint that uses the standard { data: { items, totalCount } }
// envelope. Falls back gracefully if the response is a plain array.

const EXPORT_PAGE_SIZE = 500;

function sourceLabel(url) {
  if (url.includes('benpos-cdsl'))            return 'CDSL';
  if (url.includes('benpos-nsdl'))            return 'NSDL';
  if (url.includes('physical-shareholder'))   return 'Physical Shareholder';
  if (url.includes('physical-shareholding'))  return 'Physical Shareholding';
  return url;
}

async function fetchPageWithRetry(url, params, maxRetries = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await api.get(url, { params });
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const isRetryable = !err.response || [502, 503, 504].includes(status);
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000); // 1s, 2s, 4s, 8s, 8s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

async function fetchAllPages(url, params, onProgress) {
  const res = await fetchPageWithRetry(url, { ...params, pageSize: EXPORT_PAGE_SIZE, page: 1 });
  const envelope = res.data?.data;

  if (Array.isArray(res.data)) return res.data;
  if (!envelope) return [];

  const items      = envelope.items ?? [];
  const totalCount = envelope.totalCount ?? items.length;
  if (totalCount <= items.length) return items;

  const totalPages = Math.ceil(totalCount / EXPORT_PAGE_SIZE);
  const all = [...items];
  for (let page = 2; page <= totalPages; page++) {
    const r = await fetchPageWithRetry(url, { ...params, pageSize: EXPORT_PAGE_SIZE, page });
    all.push(...(r.data?.data?.items ?? []));
    onProgress?.(page, totalPages);
  }
  return all;
}

async function fetchAllPagesFiltered(url, params, keepRow, onProgress) {
  const kept = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetchPageWithRetry(url, { ...params, page, pageSize: EXPORT_PAGE_SIZE });
    const envelope = res.data?.data;
    if (!envelope) break;
    const items = envelope.items ?? [];
    totalPages = Math.ceil((envelope.totalCount ?? items.length) / EXPORT_PAGE_SIZE) || 1;
    for (const row of items) {
      if (keepRow(row)) kept.push(row);
    }
    onProgress?.(page, totalPages);
    page++;
  } while (page <= totalPages);
  return kept;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

export async function fetchBenposExportData(isins) {
  const isinParam = isins.join(',');

  // CDSL + NSDL: single multi-ISIN request each
  const [cdslRows, nsdlRows] = await Promise.all([
    fetchAllPages('/admin/v1/benpos-cdsl',  { isin: isinParam }),
    fetchAllPages('/admin/v1/benpos-nsdl',  { isin: isinParam }),
  ]);

  // Physical Shareholder: one partial-match call per ISIN (backend only supports
  // folioIsinIncorpDate as a composite field, not a standalone isin param).
  const physShArrays = await Promise.all(
    isins.map(isin =>
      fetchAllPages('/admin/v1/benpos-physical-shareholder', { folioIsinIncorpDate: isin })
    )
  );

  // Flatten + deduplicate by folioIsinIncorpDate (the natural primary key)
  const physShMap = new Map();
  for (const rows of physShArrays) {
    for (const row of rows) {
      const key = row.folioIsinIncorpDate || row.folioNo;
      if (key && !physShMap.has(key)) physShMap.set(key, row);
    }
  }
  const physShareholders = [...physShMap.values()];

  // Physical Shareholding: exact-match on folioNo values collected above
  const folioNos = [...new Set(physShareholders.map(r => r.folioNo).filter(Boolean))];
  const physShareholdings = folioNos.length > 0
    ? await fetchAllPages('/admin/v1/benpos-physical-shareholding', { folioNo: folioNos.join(',') })
    : [];

  return { cdslRows, nsdlRows, physShareholders, physShareholdings };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// <input type="date"> produces YYYY-MM-DD. API dates may be full ISO strings.
// Slice both to 10 chars and compare.

function dateSlice(val) {
  return val ? String(val).trim().slice(0, 10) : null;
}

function matchesDate(fieldVal, selectedDate) {
  if (!selectedDate) return false;
  return dateSlice(fieldVal) === selectedDate;
}

// ── NSDL aggregate field lists ────────────────────────────────────────────────

const NSDL_HOLDING_FIELDS = [
  'beneficiaryFreePositions', 'beneficiaryLockInPositions', 'beneficiaryBlockPositions',
  'beneficiaryPledgedPositions', 'beneficiaryPledgedWithLockInPositions',
  'beneficiaryPledgedUnconfirmedPositions', 'beneficiaryUnconfirmedPledgedWithLockInPositions',
  'beneficiaryRematPositions', 'beneficiaryRematLockInPositions',
  'beneficiaryCmIddPositions', 'cmPoolPositions', 'ccSettlementPositions',
];

const NSDL_NDU_FIELDS = [
  'beneficiaryFreePositionsHoldNdu', 'beneficiaryLockInPositionsHoldNdu',
  'beneficiaryUnconfirmedFreePositionsHoldNdu', 'beneficiaryUnconfirmedLockInPositionsHoldNdu',
];

function sumFields(row, fields) {
  return fields.reduce((acc, f) => acc + (Number(row[f]) || 0), 0);
}

// ── Category extra lookup helpers ────────────────────────────────────────────
// Returns the full mapped info object for a CDSL/NSDL exact key, or null.
// No unambiguousByType fallback — fields like regulation31TypePublic vary by
// subtype so a type-only fallback isn't safe.

const _missingCategoryKeys = new Set();

function getCategoryExtra(source, catType, catSubtype) {
  if (catType == null || catSubtype == null) return null;
  const key = `${source}|${catType}|${catSubtype}`;
  return getCategoryMap().exact[key] || null;
}

// Returns the full mapped info object for Physical rows, keyed by the
// already-human-readable category/subCategory text.
function getPhysicalCategoryExtra(categoryTypeDesc, categorySubTypeDesc) {
  if (!categoryTypeDesc || !categorySubTypeDesc) return null;
  const key = normCategoryDesc(categoryTypeDesc) + '|' + normCategoryDesc(categorySubTypeDesc);
  return getCategoryMap().physicalByDescription?.[key] || null;
}

// ── Physical Lock-In aggregation ──────────────────────────────────────────────
// Build a map from folioIsinIncorpDate → total locked quantity.

function buildPhysLockInMap(shareholdings) {
  const map = new Map();
  for (const row of shareholdings) {
    const key = row.folioIsinIncorpDate || row.folioNo;
    if (!key) continue;
    if (String(row.lockInStatus ?? '').trim().toLowerCase() === 'locked') {
      map.set(key, (map.get(key) ?? 0) + (Number(row.quantity) || 0));
    }
  }
  return map;
}

// ── PAN type extraction ───────────────────────────────────────────────────────
// The 4th character (index 3) of a valid 10-character PAN is the type code.
// Returns null when the PAN is absent or not exactly 10 characters.
function panTypeCharFromPan(pan) {
  if (!pan) return null;
  const s = String(pan).trim();
  return s.length === 10 ? s[3] : null;
}

// ── Date / quantity cell helpers ──────────────────────────────────────────────

// String-only conversion: takes the first 10 chars (YYYY-MM-DD) and returns
// DD-MM-YYYY. No Date() / timezone involved. Returns null for blank/null input;
// returns the original trimmed string for any value that does not match the
// expected pattern (so nothing is silently dropped).
function formatDateDDMMYYYY(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const prefix = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return s;
  return `${prefix.slice(8, 10)}-${prefix.slice(5, 7)}-${prefix.slice(0, 4)}`;
}

// Safe numeric conversion for quantity columns. Returns the number (including 0)
// if parseable, null for null/undefined/empty, or the raw string if not a number
// (so the cell stays as text rather than being silently dropped).
function toQty(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const s = String(val).replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : val;
}

// ── Output column order ───────────────────────────────────────────────────────

export const EXPORT_COLUMNS = [
  'Holding Rpt Date', 'ISIN', 'Beneficial Owner ID', 'DP ID', 'Client ID',
  'First_Holder_Name', 'Second_Holder_Name', 'Third_Holder_Name',
  'Holding (Total Qty)', 'Holding Type',
  '1st Holder PAN', 'Lock In Qty', 'Pledged Qty', 'NDU Qty',
  'PAN type', 'Resident Status', 'Gender', 'Date of Birth', 'Occupation',
  'Phone Number', 'Email ID', 'Father_Husband_name', 'Nominee_Guardian_Name',
  'Address Line-1', 'Address Line-2', 'Address Line-3', 'Address Line-4', 'PIN Code',
  'Bank_Name_and_Branch', 'Bank_Account_Number', 'Bank_Account_Type', 'MICR_Code', 'IFSC',
  'Category type description', 'Category sub type description', 'Category',
  'Source',
];

// ── Per-source row mappers ────────────────────────────────────────────────────

function mapCdslRow(row) {
  const { description: catTypeDesc, subDescription: catSubDesc } =
    deriveCategoryDescription('CDSL', row.customerType, row.boSubStatus);
  const cdslExtra = getCategoryExtra('CDSL', row.customerType, row.boSubStatus);
  if (!cdslExtra) _missingCategoryKeys.add(`CDSL|${row.customerType}|${row.boSubStatus}`);
  const acNo = String(row.beneficiaryOwnerAcNo ?? '');
  return {
    'Holding Rpt Date':              formatDateDDMMYYYY(row.dateOfBenpos),
    'ISIN':                          row.isin ?? null,
    'Beneficial Owner ID':           row.beneficiaryOwnerAcNo ?? null,
    'DP ID':                         acNo.length >= 8 ? acNo.slice(0, 8) : null,
    'Client ID':                     acNo.length > 8 ? acNo.slice(8) : null,
    'First_Holder_Name':             row.firstHolderName ?? null,
    'Second_Holder_Name':            row.secondHolderName ?? null,
    'Third_Holder_Name':             row.thirdHolderName ?? null,
    'Holding (Total Qty)':           toQty(row.totalHolding),
    'Holding Type':                  'DEMAT CDSL',
    '1st Holder PAN':                row.panOfFirstHolder ?? null,
    'Lock In Qty':                   toQty(row.totalLockIn),
    'Pledged Qty':                   toQty(row.pledgeBalance),
    'NDU Qty':                       toQty(row.nduBalance),
    'PAN type':                      mapPanType(panTypeCharFromPan(row.panOfFirstHolder), 'CDSL') ?? null,
    'Resident Status':               cdslExtra?.investorType || null,
    'Gender':                        mapGender(row.sexOfFirstHolder) ?? null,
    'Date of Birth':                 formatDateDDMMYYYY(row.birthDate),
    'Occupation':                    mapOccupation('CDSL', row.occupation) ?? null,
    'Phone Number':                  row.primaryMobileNumber ?? null,
    'Email ID':                      row.primaryEmail ? String(row.primaryEmail).trim().toLowerCase() || null : null,
    'Father_Husband_name':           row.fatherHusbandName ?? null,
    // TODO (client/Sunil): confirm whether nomineeName or guardianName should be used here
    'Nominee_Guardian_Name':         row.nomineeName ?? null,
    'Address Line-1':                row.boPermanentAddress1 ?? null,
    'Address Line-2':                row.boPermanentAddress2 ?? null,
    'Address Line-3':                row.boPermanentAddress3 ?? null,
    'Address Line-4':                [row.boPermanentCity, row.boPermanentState].filter(Boolean).join(' ') || null,
    'PIN Code':                      row.boPermanentPinCode ?? null,
    'Bank_Name_and_Branch':          row.bankName ?? null,
    'Bank_Account_Number':           row.dividendBankAccountNumber ?? null,
    'Bank_Account_Type':             mapBankAccountType(row.dividendBankAccountType, 'CDSL') ?? null,
    'MICR_Code':                     row.dividendMicrNo ?? null,
    'IFSC':                          row.dividendBankIfsc ?? null,
    'Category type description':     catTypeDesc ?? null,
    'Category sub type description': catSubDesc ?? null,
    'Category':   cdslExtra?.regulation31TypePublic ?? row.customerType ?? null,
    'Source':                        'CDSL',
  };
}

function mapNsdlRow(row) {
  const { description: catTypeDesc, subDescription: catSubDesc } =
    deriveCategoryDescription('NSDL', row.beneficiaryType, row.beneficiarySubType);
  const nsdlExtra = getCategoryExtra('NSDL', row.beneficiaryType, row.beneficiarySubType);
  if (!nsdlExtra) _missingCategoryKeys.add(`NSDL|${row.beneficiaryType}|${row.beneficiarySubType}`);
  // TODO (client/Sunil): Holding Rpt Date and ISIN should technically come from
  // record type "01" of the raw NSDL file, not parsed/stored currently — using
  // date and isin columns as best-available approximation.
  return {
    'Holding Rpt Date':              formatDateDDMMYYYY(row.date),
    'ISIN':                          row.isin ?? null,
    'Beneficial Owner ID':           (row.dpId ?? '') + (row.beneficiaryAccountNumber ?? ''),
    'DP ID':                         row.dpId ?? null,
    'Client ID':                     row.beneficiaryAccountNumber ?? null,
    'First_Holder_Name':             row.firstHolderName ?? null,
    'Second_Holder_Name':            row.secondHolderName ?? null,
    'Third_Holder_Name':             row.thirdHolderName ?? null,
    'Holding (Total Qty)':           sumFields(row, NSDL_HOLDING_FIELDS),
    'Holding Type':                  'DEMAT NSDL',
    '1st Holder PAN':                row.firstHolderPan ?? null,
    'Lock In Qty':                   toQty(row.beneficiaryLockInPositions),
    'Pledged Qty':                   toQty(row.beneficiaryPledgedPositions),
    'NDU Qty':                       sumFields(row, NSDL_NDU_FIELDS),
    'PAN type':                      mapPanType(panTypeCharFromPan(row.firstHolderPan), 'NSDL') ?? null,
    'Resident Status':               nsdlExtra?.investorType || null,
    // Gender and Date of Birth are not present in NSDL BenPos data (field list confirmed).
    'Gender':                        null,
    'Date of Birth':                 null,
    'Occupation':                    mapOccupation('NSDL', row.beneficiaryOccupation) ?? null,
    'Phone Number':                  row.beneficiaryPhoneNumber ?? null,
    'Email ID':                      row.firstHolderEmailId ? String(row.firstHolderEmailId).trim().toLowerCase() || null : null,
    'Father_Husband_name':           row.firstHolderFatherHusbandName ?? null,
    'Nominee_Guardian_Name':         row.nomineeGuardianName ?? null,
    'Address Line-1':                row.beneficiaryAddress1 ?? null,
    'Address Line-2':                row.beneficiaryAddress2 ?? null,
    'Address Line-3':                row.beneficiaryAddress3 ?? null,
    'Address Line-4':                row.beneficiaryAddress4 ?? null,
    'PIN Code':                      row.beneficiaryPinCode ?? null,
    'Bank_Name_and_Branch':          row.bankNameAndBranch ?? null,
    'Bank_Account_Number':           row.beneficiaryBankAccountNumber ?? null,
    'Bank_Account_Type':             mapBankAccountType(row.bankAccountType, 'NSDL') ?? null,
    'MICR_Code':                     row.micrCode ?? null,
    'IFSC':                          row.ifsc ?? null,
    'Category type description':     catTypeDesc ?? null,
    'Category sub type description': catSubDesc ?? null,
    'Category':   nsdlExtra?.regulation31TypePublic ?? row.beneficiaryType ?? null,
    'Source':                        'NSDL',
  };
}

function mapPhysicalRow(shareholder, lockInQty) {
  // Physical category fields are already human-readable text — not numeric codes.
  // Do not run them through deriveCategoryDescription.
  const physExtra = getPhysicalCategoryExtra(shareholder.category, shareholder.subCategory);
  if (!physExtra) _missingCategoryKeys.add(`Physical|${shareholder.category}|${shareholder.subCategory}`);
  return {
    'Holding Rpt Date':              formatDateDDMMYYYY(shareholder.dateOfIncorporation),
    'ISIN':                          shareholder.isin ?? null,
    'Beneficial Owner ID':           shareholder.folioNo ?? null,
    'DP ID':                         null,
    'Client ID':                     null,
    'First_Holder_Name':             shareholder.holder1Name ?? null,
    'Second_Holder_Name':            shareholder.holder2Name ?? null,
    'Third_Holder_Name':             shareholder.holder3Name ?? null,
    'Holding (Total Qty)':           toQty(shareholder.shareQty),
    'Holding Type':                  'Physical',
    '1st Holder PAN':                shareholder.holder1Pan ?? null,
    'Lock In Qty':                   toQty(lockInQty),
    'Pledged Qty':                   null,
    'NDU Qty':                       null,
    'PAN type':                      mapPanType(panTypeCharFromPan(shareholder.holder1Pan), 'PHYSICAL') ?? null,
    'Resident Status':               physExtra?.investorType || null,
    'Gender':                        mapGender(shareholder.holder1Gender) ?? null,
    'Date of Birth':                 formatDateDDMMYYYY(shareholder.holder1BirthDate),
    'Occupation':                    shareholder.holder1Occupation ?? null,
    'Phone Number':                  shareholder.holder1MobileNo ?? null,
    'Email ID':                      shareholder.holder1EmailId ? String(shareholder.holder1EmailId).trim().toLowerCase() || null : null,
    'Father_Husband_name':           shareholder.fatherHusbandName ?? null,
    'Nominee_Guardian_Name':         shareholder.nominationName ?? null,
    'Address Line-1':                shareholder.address1 ?? null,
    'Address Line-2':                shareholder.address2 ?? null,
    'Address Line-3':                shareholder.address3 ?? null,
    'Address Line-4':                [shareholder.city, shareholder.state].filter(Boolean).join(' ') || null,
    'PIN Code':                      shareholder.pinCode ?? null,
    'Bank_Name_and_Branch':          shareholder.bankName ?? null,
    'Bank_Account_Number':           shareholder.bankAcNo ?? null,
    'Bank_Account_Type':             mapBankAccountType(shareholder.accountType, 'PHYSICAL') ?? null,
    'MICR_Code':                     shareholder.bankMicrCode ?? null,
    'IFSC':                          shareholder.ifscCode ?? null,
    'Category type description':     shareholder.category ?? null,
    'Category sub type description': shareholder.subCategory ?? null,
    'Category':   physExtra?.regulation31TypePublic ?? shareholder.category ?? null,
    'Source':                        'PHYSICAL',
  };
}

// ── Row builder ───────────────────────────────────────────────────────────────

export function buildExportRows(cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr) {
  const lockInMap = buildPhysLockInMap(physShareholdings);

  const filteredCdsl = cdslRows.filter(r => matchesDate(r.dateOfBenpos, dateStr));
  const filteredNsdl = nsdlRows.filter(r => matchesDate(r.date, dateStr));
  const filteredPhys = physShareholders.filter(r => matchesDate(r.dateOfIncorporation, dateStr));

  _missingCategoryKeys.clear();
  flushUnmappedCodes();              // discard stale occupation/gender codes from prior builds
  flushUnmappedBankAccountTypes();   // discard stale bank account type codes from prior builds
  flushUnmappedPanTypes();           // discard stale pan type codes from prior builds
  const rows = [];
  for (const r of filteredCdsl) rows.push(mapCdslRow(r));
  for (const r of filteredNsdl) rows.push(mapNsdlRow(r));
  for (const sh of filteredPhys) {
    const lockIn = lockInMap.get(sh.folioIsinIncorpDate) ?? lockInMap.get(sh.folioNo) ?? 0;
    rows.push(mapPhysicalRow(sh, lockIn));
  }
  if (_missingCategoryKeys.size > 0) {
    console.warn(
      `[benposExport] ${_missingCategoryKeys.size} distinct category codes had no mapping (raw codes used as fallback):`,
      [..._missingCategoryKeys]
    );
    _missingCategoryKeys.clear();
  }
  const { occupation: unmappedOcc, gender: unmappedGen } = flushUnmappedCodes();
  if (unmappedOcc.length > 0)
    console.warn(`[benposExport] ${unmappedOcc.length} distinct unmapped occupation code(s):`, unmappedOcc);
  if (unmappedGen.length > 0)
    console.warn(`[benposExport] ${unmappedGen.length} distinct unmapped gender code(s):`, unmappedGen);
  const unmappedBAT = flushUnmappedBankAccountTypes();
  if (unmappedBAT.length > 0)
    console.warn(`[benposExport] ${unmappedBAT.length} distinct unmapped bank account type code(s):`, unmappedBAT);
  const unmappedPAN = flushUnmappedPanTypes();
  if (unmappedPAN.length > 0)
    console.warn(`[benposExport] ${unmappedPAN.length} distinct unmapped PAN type code(s):`, unmappedPAN);

  // Sort each ISIN's rows by Holding (Total Qty) descending, preserving
  // the order in which ISINs first appear (CDSL before NSDL before Physical).
  const isinOrder = [];
  const byIsin = new Map();
  for (const row of rows) {
    const isin = row['ISIN'] ?? '';
    if (!byIsin.has(isin)) { byIsin.set(isin, []); isinOrder.push(isin); }
    byIsin.get(isin).push(row);
  }
  const sorted = [];
  for (const isin of isinOrder) {
    const g = byIsin.get(isin);
    g.sort((a, b) => (Number(b['Holding (Total Qty)']) || 0) - (Number(a['Holding (Total Qty)']) || 0));
    sorted.push(...g);
  }
  return sorted;
}

// ── Excel download ────────────────────────────────────────────────────────────

export function triggerBenposExcelDownload(rows, dateStr, isins = []) {
  const sheetData = [EXPORT_COLUMNS];
  for (const row of rows) sheetData.push(EXPORT_COLUMNS.map(col => {
    const v = row[col];
    return (v == null || (typeof v === 'string' && !v.trim())) ? undefined : v;
  }));

  let t = Date.now();
  console.log(`[benposExport] aoa_to_sheet start — ${rows.length} rows × ${EXPORT_COLUMNS.length} cols — ${new Date().toISOString()}`);
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  console.log(`[benposExport] aoa_to_sheet done in ${Date.now() - t}ms`);

  const headerStyle = {
    font: { bold: true },
    fill: { fgColor: { rgb: 'ADD8E6' } },
  };
  for (let col = 0; col < EXPORT_COLUMNS.length; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BenPos');
  const isinPart = isins.length > 0 ? `${isins.join('_')}_` : '';
  downloadWorkbookAsBlob(wb, `BENPOS_${isinPart}${fmtDateForFilename(dateStr)}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  const t = Date.now();
  console.log(`[benposExport] Blob download start ${new Date().toISOString()}`);
  link.click();
  console.log(`[benposExport] Blob download triggered in ${Date.now() - t}ms`);
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadWorkbookAsBlob(workbook, filename) {
  let t = Date.now();
  console.log(`[benposExport] XLSX.write start ${new Date().toISOString()}`);
  const wbArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  console.log(`[benposExport] XLSX.write done in ${Date.now() - t}ms — ${wbArray.byteLength} bytes`);
  const blob = new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, filename);
}

// ── Orchestrators ─────────────────────────────────────────────────────────────

export async function exportBenpos(isins, dateStr) {
  await loadCategoryMapping();
  const { cdslRows, nsdlRows, physShareholders, physShareholdings } =
    await fetchBenposExportData(isins);
  const rows = buildExportRows(cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr);
  triggerBenposExcelDownload(rows, dateStr, isins);
  return rows.length;
}

async function fetchAllBenposExportData(dateStr, onProgress) {
  // Server now accepts ?date=YYYY-MM-DD and filters before paginating — no
  // client-side predicate needed for these three sources.
  let t;

  t = Date.now();
  console.log(`[benposExport] fetch CDSL start ${new Date().toISOString()}`);
  const cdslRows = await fetchAllPages(
    '/admin/v1/benpos-cdsl', { date: dateStr },
    (p, tp) => onProgress?.(`Fetching CDSL data (page ${p} of ${tp})`)
  );
  console.log(`[benposExport] fetch CDSL done — ${cdslRows.length} rows in ${Date.now() - t}ms`);

  t = Date.now();
  console.log(`[benposExport] fetch NSDL start ${new Date().toISOString()}`);
  const nsdlRows = await fetchAllPages(
    '/admin/v1/benpos-nsdl', { date: dateStr },
    (p, tp) => onProgress?.(`Fetching NSDL data (page ${p} of ${tp})`)
  );
  console.log(`[benposExport] fetch NSDL done — ${nsdlRows.length} rows in ${Date.now() - t}ms`);

  t = Date.now();
  console.log(`[benposExport] fetch Physical start ${new Date().toISOString()}`);
  const physShareholders = await fetchAllPages(
    '/admin/v1/benpos-physical-shareholder', { date: dateStr },
    (p, tp) => onProgress?.(`Fetching Physical Shareholder data (page ${p} of ${tp})`)
  );
  console.log(`[benposExport] fetch Physical done — ${physShareholders.length} rows in ${Date.now() - t}ms`);

  // Physical Shareholding is tiny (~60 rows total) — fetch it all; lock-in
  // matching by folioNo happens downstream in buildExportRows as usual.
  const physShareholdings = await fetchAllPages(
    '/admin/v1/benpos-physical-shareholding', {},
    (p, tp) => onProgress?.(`Fetching Physical Shareholding data (page ${p} of ${tp})`)
  );
  return { cdslRows, nsdlRows, physShareholders, physShareholdings };
}

export async function exportAllBenpos(dateStr, onProgress) {
  await loadCategoryMapping();
  const { cdslRows, nsdlRows, physShareholders, physShareholdings } =
    await fetchAllBenposExportData(dateStr, onProgress);

  let t = Date.now();
  console.log(`[benposExport] buildExportRows start ${new Date().toISOString()}`);
  const rows = buildExportRows(cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr);
  console.log(`[benposExport] buildExportRows done — ${rows.length} rows in ${Date.now() - t}ms`);

  // Build AOA data rows — same values and order as the SheetJS path used.
  const dataRows = [];
  for (const row of rows) dataRows.push(EXPORT_COLUMNS.map(col => {
    const v = row[col];
    return (v == null || (typeof v === 'string' && !v.trim())) ? undefined : v;
  }));

  t = Date.now();
  console.log(`[benposExport] buildXlsxBlob start — ${rows.length} rows × ${EXPORT_COLUMNS.length} cols — ${new Date().toISOString()}`);
  const blob = await buildXlsxBlob(EXPORT_COLUMNS, dataRows, {
    sheetName: 'BenPos',
    headerFill: 'ADD8E6',
    onProgress: (done, total) => onProgress?.(`Writing Excel… ${done.toLocaleString()} / ${total.toLocaleString()} rows`),
  });
  console.log(`[benposExport] buildXlsxBlob done in ${Date.now() - t}ms`);

  downloadBlob(blob, `BENPOS_ALL_${fmtDateForFilename(dateStr)}.xlsx`);
  return rows.length;
}

// ── Issuer ZIP export ─────────────────────────────────────────────────────────

function sanitizeFilename(name, maxLen = 80) {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, maxLen);
}

// 'YYYY-MM-DD' → 'DD-MM-YYYY' — string split only, no Date() (avoids TZ shifts).
function fmtDateForFilename(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr || 'Unknown';
  return `${dateStr.slice(8, 10)}-${dateStr.slice(5, 7)}-${dateStr.slice(0, 4)}`;
}

const ISSUER_ISIN_CHUNK = 50;

async function fetchBenposForIssuer(isins, dateStr, onProgress) {
  const cdslRows = [];
  const nsdlRows = [];
  const physShMap = new Map();
  const totalChunks = Math.ceil(isins.length / ISSUER_ISIN_CHUNK);

  for (let ci = 0; ci < isins.length; ci += ISSUER_ISIN_CHUNK) {
    const chunk = isins.slice(ci, ci + ISSUER_ISIN_CHUNK);
    const chunkNum = Math.floor(ci / ISSUER_ISIN_CHUNK) + 1;
    const isinParam = chunk.join(',');

    onProgress?.(`Fetching CDSL (chunk ${chunkNum}/${totalChunks})…`);
    const cdslChunk = await fetchAllPages('/admin/v1/benpos-cdsl', { isin: isinParam, date: dateStr });
    for (const r of cdslChunk) cdslRows.push(r);

    onProgress?.(`Fetching NSDL (chunk ${chunkNum}/${totalChunks})…`);
    const nsdlChunk = await fetchAllPages('/admin/v1/benpos-nsdl', { isin: isinParam, date: dateStr });
    for (const r of nsdlChunk) nsdlRows.push(r);

    for (const isin of chunk) {
      const physChunk = await fetchAllPages(
        '/admin/v1/benpos-physical-shareholder', { folioIsinIncorpDate: isin, date: dateStr }
      );
      for (const r of physChunk) {
        const key = r.folioIsinIncorpDate || r.folioNo;
        if (key && !physShMap.has(key)) physShMap.set(key, r);
      }
    }
  }

  const physShareholders = [...physShMap.values()];
  const folioNos = [...new Set(physShareholders.map(r => r.folioNo).filter(Boolean))];
  const physShareholdings = folioNos.length > 0
    ? await fetchAllPages('/admin/v1/benpos-physical-shareholding', { folioNo: folioNos.join(',') })
    : [];

  return { cdslRows, nsdlRows, physShareholders, physShareholdings };
}

export async function exportIssuerBenposZip(issuer, dateStr, onProgress) {
  await loadCategoryMapping();
  // 1. Load all ISINs for this issuer
  onProgress?.(`Loading ISINs for ${issuer.issuerName || issuer.issuerCode}…`);
  const isinItems = await fetchAllPages('/admin/v1/isins', { issuerCode: issuer.issuerCode });
  const isinCodes = isinItems.map(r => r.isin).filter(Boolean);

  if (isinCodes.length === 0) return { downloadedCount: 0, skippedIsins: [] };

  // 2. Fetch BenPos data in ISSUER_ISIN_CHUNK-sized batches
  const { cdslRows, nsdlRows, physShareholders, physShareholdings } =
    await fetchBenposForIssuer(isinCodes, dateStr, onProgress);

  // 3. Map rows and group by ISIN
  onProgress?.('Building rows…');
  const allRows = buildExportRows(cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr);

  const byIsin = new Map();
  for (const row of allRows) {
    const isin = row['ISIN'];
    if (!isin) continue;
    if (!byIsin.has(isin)) byIsin.set(isin, []);
    byIsin.get(isin).push(row);
  }

  const skippedIsins = isinCodes.filter(isin => !byIsin.has(isin));
  const isinsWithData = [...byIsin.keys()];

  if (isinsWithData.length === 0) return { downloadedCount: 0, skippedIsins };

  // 4. Build one xlsx per ISIN, stream each into the zip immediately
  //    (ZipPassThrough = store, no re-compression — .xlsx is already compressed)
  const zipChunks = [];
  let zipErr = null;
  const zip = new Zip((err, chunk) => {
    if (err) { zipErr = err; } else { zipChunks.push(chunk); }
  });

  for (let i = 0; i < isinsWithData.length; i++) {
    const isin = isinsWithData[i];
    const isinRows = byIsin.get(isin);
    onProgress?.(`Building Excel ${i + 1}/${isinsWithData.length}: ${isin}…`);

    const dataRows = [];
    for (const row of isinRows) dataRows.push(EXPORT_COLUMNS.map(col => {
      const v = row[col];
      return (v == null || (typeof v === 'string' && !v.trim())) ? undefined : v;
    }));

    const xlsxBlob = await buildXlsxBlob(EXPORT_COLUMNS, dataRows, {
      sheetName: 'BenPos',
      headerFill: 'ADD8E6',
    });
    const uint8 = new Uint8Array(await xlsxBlob.arrayBuffer());

    const f = new ZipPassThrough(`BENPOS_${isin}_${fmtDateForFilename(dateStr)}.xlsx`);
    zip.add(f);
    f.push(uint8, true);
    if (zipErr) throw zipErr;
  }

  zip.end();
  if (zipErr) throw zipErr;

  // 5. Download zip
  onProgress?.('Finalising ZIP…');
  const zipBlob = new Blob(zipChunks, { type: 'application/zip' });
  const issuerPart = sanitizeFilename(issuer.issuerName || issuer.issuerCode, 60);
  const zipName = `BENPOS_${issuerPart}_${fmtDateForFilename(dateStr)}.zip`;
  downloadBlob(zipBlob, zipName);

  return { downloadedCount: isinsWithData.length, skippedIsins };
}
