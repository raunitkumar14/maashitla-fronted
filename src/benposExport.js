import * as XLSX from 'xlsx';
import api from './api/axios';
import { deriveCategoryDescription } from './deriveCategoryDescription';

// ── Pagination helper ─────────────────────────────────────────────────────────
// Fetches all pages from an endpoint that uses the standard { data: { items, totalCount } }
// envelope. Falls back gracefully if the response is a plain array.

const EXPORT_PAGE_SIZE = 500;

async function fetchAllPages(url, params) {
  const res = await api.get(url, { params: { ...params, pageSize: EXPORT_PAGE_SIZE, page: 1 } });
  const envelope = res.data?.data;

  if (Array.isArray(res.data)) return res.data;
  if (!envelope) return [];

  const items      = envelope.items ?? [];
  const totalCount = envelope.totalCount ?? items.length;
  if (totalCount <= items.length) return items;

  const totalPages = Math.ceil(totalCount / EXPORT_PAGE_SIZE);
  const extra = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      api.get(url, { params: { ...params, pageSize: EXPORT_PAGE_SIZE, page: i + 2 } })
    )
  );
  const all = [...items];
  for (const r of extra) all.push(...(r.data?.data?.items ?? []));
  return all;
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
  const acNo = String(row.beneficiaryOwnerAcNo ?? '');
  return {
    'Holding Rpt Date':              row.dateOfBenpos ?? null,
    'ISIN':                          row.isin ?? null,
    'Beneficial Owner ID':           row.beneficiaryOwnerAcNo ?? null,
    'DP ID':                         acNo.length >= 8 ? acNo.slice(0, 8) : null,
    'Client ID':                     acNo.length > 8 ? acNo.slice(8) : null,
    'First_Holder_Name':             row.firstHolderName ?? null,
    'Second_Holder_Name':            row.secondHolderName ?? null,
    'Third_Holder_Name':             row.thirdHolderName ?? null,
    'Holding (Total Qty)':           row.totalHolding ?? null,
    'Holding Type':                  'DEMAT CDSL',
    '1st Holder PAN':                row.panOfFirstHolder ?? null,
    'Lock In Qty':                   row.totalLockIn ?? null,
    'Pledged Qty':                   row.pledgeBalance ?? null,
    'NDU Qty':                       row.nduBalance ?? null,
    // TODO (client/Sunil): PAN type and Resident Status need external reference files
    'PAN type':                      null,
    'Resident Status':               null,
    'Gender':                        row.sexOfFirstHolder ?? null,
    'Date of Birth':                 row.birthDate ?? null,
    'Occupation':                    row.occupation ?? null,
    'Phone Number':                  row.primaryMobileNumber ?? null,
    'Email ID':                      row.primaryEmail ?? null,
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
    'Bank_Account_Type':             row.dividendBankAccountType ?? null,
    'MICR_Code':                     row.dividendMicrNo ?? null,
    'IFSC':                          row.dividendBankIfsc ?? null,
    'Category type description':     catTypeDesc ?? null,
    'Category sub type description': catSubDesc ?? null,
    'Category':                      row.customerType ?? null,
    'Source':                        'CDSL',
  };
}

function mapNsdlRow(row) {
  const { description: catTypeDesc, subDescription: catSubDesc } =
    deriveCategoryDescription('NSDL', row.beneficiaryType, row.beneficiarySubType);
  // TODO (client/Sunil): Holding Rpt Date and ISIN should technically come from
  // record type "01" of the raw NSDL file, not parsed/stored currently — using
  // date and isin columns as best-available approximation.
  return {
    'Holding Rpt Date':              row.date ?? null,
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
    'Lock In Qty':                   row.beneficiaryLockInPositions ?? null,
    'Pledged Qty':                   row.beneficiaryPledgedPositions ?? null,
    'NDU Qty':                       sumFields(row, NSDL_NDU_FIELDS),
    'PAN type':                      null,
    'Resident Status':               null,
    // TODO (client/Sunil): Gender and Date of Birth are not present in current NSDL data
    'Gender':                        null,
    'Date of Birth':                 null,
    'Occupation':                    row.beneficiaryOccupation ?? null,
    'Phone Number':                  row.beneficiaryPhoneNumber ?? null,
    'Email ID':                      row.firstHolderEmailId ?? null,
    'Father_Husband_name':           row.firstHolderFatherHusbandName ?? null,
    'Nominee_Guardian_Name':         row.nomineeGuardianName ?? null,
    'Address Line-1':                row.beneficiaryAddress1 ?? null,
    'Address Line-2':                row.beneficiaryAddress2 ?? null,
    'Address Line-3':                row.beneficiaryAddress3 ?? null,
    'Address Line-4':                row.beneficiaryAddress4 ?? null,
    'PIN Code':                      row.beneficiaryPinCode ?? null,
    'Bank_Name_and_Branch':          row.bankNameAndBranch ?? null,
    'Bank_Account_Number':           row.beneficiaryBankAccountNumber ?? null,
    'Bank_Account_Type':             row.bankAccountType ?? null,
    'MICR_Code':                     row.micrCode ?? null,
    'IFSC':                          row.ifsc ?? null,
    'Category type description':     catTypeDesc ?? null,
    'Category sub type description': catSubDesc ?? null,
    'Category':                      row.beneficiaryType ?? null,
    'Source':                        'NSDL',
  };
}

function mapPhysicalRow(shareholder, lockInQty) {
  // Physical category fields are already human-readable text — not numeric codes.
  // Do not run them through deriveCategoryDescription.
  return {
    'Holding Rpt Date':              shareholder.dateOfIncorporation ?? null,
    'ISIN':                          shareholder.isin ?? null,
    'Beneficial Owner ID':           shareholder.folioNo ?? null,
    'DP ID':                         null,
    'Client ID':                     null,
    'First_Holder_Name':             shareholder.holder1Name ?? null,
    'Second_Holder_Name':            shareholder.holder2Name ?? null,
    'Third_Holder_Name':             shareholder.holder3Name ?? null,
    'Holding (Total Qty)':           shareholder.shareQty ?? null,
    'Holding Type':                  'Physical',
    '1st Holder PAN':                shareholder.holder1Pan ?? null,
    'Lock In Qty':                   lockInQty || null,
    'Pledged Qty':                   null,
    'NDU Qty':                       null,
    'PAN type':                      null,
    'Resident Status':               null,
    'Gender':                        shareholder.holder1Gender ?? null,
    'Date of Birth':                 shareholder.holder1BirthDate ?? null,
    'Occupation':                    shareholder.holder1Occupation ?? null,
    'Phone Number':                  shareholder.holder1MobileNo ?? null,
    'Email ID':                      shareholder.holder1EmailId ?? null,
    'Father_Husband_name':           shareholder.fatherHusbandName ?? null,
    'Nominee_Guardian_Name':         shareholder.nominationName ?? null,
    'Address Line-1':                shareholder.address1 ?? null,
    'Address Line-2':                shareholder.address2 ?? null,
    'Address Line-3':                shareholder.address3 ?? null,
    'Address Line-4':                [shareholder.city, shareholder.state].filter(Boolean).join(' ') || null,
    'PIN Code':                      shareholder.pinCode ?? null,
    'Bank_Name_and_Branch':          shareholder.bankName ?? null,
    'Bank_Account_Number':           shareholder.bankAcNo ?? null,
    'Bank_Account_Type':             shareholder.accountType ?? null,
    'MICR_Code':                     shareholder.bankMicrCode ?? null,
    'IFSC':                          shareholder.ifscCode ?? null,
    'Category type description':     shareholder.category ?? null,
    'Category sub type description': shareholder.subCategory ?? null,
    'Category':                      shareholder.category ?? null,
    'Source':                        'PHYSICAL',
  };
}

// ── Row builder ───────────────────────────────────────────────────────────────

export function buildExportRows(cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr) {
  const lockInMap = buildPhysLockInMap(physShareholdings);

  const filteredCdsl = cdslRows.filter(r => matchesDate(r.dateOfBenpos, dateStr));
  const filteredNsdl = nsdlRows.filter(r => matchesDate(r.date, dateStr));
  const filteredPhys = physShareholders.filter(r => matchesDate(r.dateOfIncorporation, dateStr));

  return [
    ...filteredCdsl.map(mapCdslRow),
    ...filteredNsdl.map(mapNsdlRow),
    ...filteredPhys.map(sh => {
      const lockIn = lockInMap.get(sh.folioIsinIncorpDate) ?? lockInMap.get(sh.folioNo) ?? 0;
      return mapPhysicalRow(sh, lockIn);
    }),
  ];
}

// ── Excel download ────────────────────────────────────────────────────────────

export function triggerBenposExcelDownload(rows, dateStr) {
  const sheetData = [
    EXPORT_COLUMNS,
    ...rows.map(row => EXPORT_COLUMNS.map(col => row[col] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BenPos');
  XLSX.writeFile(wb, `BenPos_Export_${dateStr || 'All'}.xlsx`);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function exportBenpos(isins, dateStr) {
  const { cdslRows, nsdlRows, physShareholders, physShareholdings } =
    await fetchBenposExportData(isins);
  const rows = buildExportRows(cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr);
  triggerBenposExcelDownload(rows, dateStr);
  return rows.length;
}
