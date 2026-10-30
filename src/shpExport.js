import api from './api/axios';
import { fetchBenposExportData, buildExportRows } from './benposExport';
import { loadCategoryMapping, getCategoryMap, normCategoryDesc } from './categoryMappingCache';
import { resetPromoterCache, loadPromoters, getPromoterMap } from './promoterMasterCache';
import { resetCategoryConvertCache, loadCategoryConvert } from './categoryConvertCache';
import { buildShpAllSheetsBlob, VALID_C_CODES } from './shpExcelBuilder';

const BLOB_URL_REVOKE_MS = 10_000;

// ── PAN 4th-character override (Individual category only) ─────────────────────
// Maps (original SHP code, PAN[3]) → redirected code for Firm (F) or Trust (T).
const PROMOTER_INDIVIDUAL_OVERRIDE = {
  A1a: { F: 'A1d_FIRM', T: 'A1d_TRUST' },
  A2a: { F: 'A2e_FIRM', T: 'A2e_TRUST' },
};

const PUBLIC_INDIVIDUAL_OVERRIDE = {
  B4g: { F: 'B4m_FIRM', T: 'B4m2' },
  B4i: { F: 'B4m_FIRM', T: 'B4m2' },
  B4j: { F: 'B4m_FIRM', T: 'B4m2' },
};

// Returns the effective SHP code after applying the PAN 4th-char override.
// Only acts when the holding's ORIGINAL category-mapping description is "Individual".
function resolveShpCode(code, overrideMap, shpCategoryTypeDesc, pan) {
  if (String(shpCategoryTypeDesc ?? '').trim().toLowerCase() !== 'individual') return code;
  const overrides = overrideMap[code];
  if (!overrides) return code;
  const s = String(pan ?? '').trim().toUpperCase();
  const ch = s.length >= 4 ? s[3] : null;
  return (ch && overrides[ch]) ? overrides[ch] : code;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_MS);
}

function fmtDateForFilename(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr || 'Unknown';
  return `${dateStr.slice(8, 10)}-${dateStr.slice(5, 7)}-${dateStr.slice(0, 4)}`;
}

/**
 * Exports Table II + Table III Shareholding Pattern Excel for one ISIN and BenPos date.
 *
 * Returns {
 *   skippedPans: string[],          // promoter PANs with no SHP Promoter Code
 *   skippedPublicPans: string[],    // public PANs with no SHP Public Code
 *   totalSharesSource: 'isin'|'benpos',
 *   promoterWarning: string|null,
 *   categoryWarning: string|null,
 *   noPromoters: boolean,
 *   noPublic: boolean,
 *   faceValueMissing: boolean,      // face value absent; B4g may be incomplete
 * }
 */
export async function exportShp(isin, dateStr, isinTotalHoldings, faceValue, entityInfo = {}) {
  await loadCategoryMapping();

  const { cdslRows, nsdlRows, physShareholders, physShareholdings } =
    await fetchBenposExportData([isin], dateStr);

  resetPromoterCache();
  resetCategoryConvertCache();

  let promoterWarning = null;
  let categoryWarning = null;

  const issuerCode = String(isin).slice(3, 7);

  try {
    await loadPromoters([issuerCode]);
  } catch {
    promoterWarning = 'Promoter lookup failed — entity type may be incomplete.';
  }
  try {
    await loadCategoryConvert([issuerCode]);
  } catch {
    categoryWarning = 'Category convert lookup failed — category descriptions may be incomplete.';
  }

  // ── Fetch convertible/warrant/ESOP holdings ───────────────────────────────────
  // Fail gracefully: if the fetch fails or returns nothing, all XA/XB/XC stay 0.
  let convMap = new Map(); // PAN → { xa, xb, xc, type, subType, promoterFlag, name, _consumed }
  try {
    const convRes = await api.get(`/admin/v1/shp-convertible/${issuerCode}/all`);
    const convData = convRes.data?.data ?? {};
    for (const [secType, field] of [['CONVERTIBLE', 'xa'], ['WARRANT', 'xb'], ['ESOP', 'xc']]) {
      for (const row of (convData[secType] ?? [])) {
        const pan = String(row.pan ?? '').trim().toUpperCase();
        if (!pan) continue;
        if (!convMap.has(pan)) {
          convMap.set(pan, {
            xa: 0, xb: 0, xc: 0,
            type: row.type, subType: row.subType,
            promoterFlag: row.promoterFlag, name: row.name ?? '',
            _consumed: false,
          });
        }
        convMap.get(pan)[field] += Number(row.outstandingQty) || 0;
      }
    }
  } catch { /* fail gracefully */ }

  // ── Fetch Table II-A / III-A / III-B uploaded rows ──────────────────────────
  let shpTableData = { 'II-A': [], 'III-A': [], 'III-B': [], 'V': [] };
  try {
    const tblRes = await api.get(`/admin/v1/shp-table/${issuerCode}/all`);
    shpTableData = tblRes.data?.data ?? shpTableData;
  } catch { /* fail gracefully — each table shows the default NIL row */ }

  const { rows: allRows } = buildExportRows(
    cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr
  );

  // ── Annexure A: promoters from master with zero holding in this benpos ────────
  const holderPanSet = new Set();
  for (const row of allRows) {
    if ((Number(row['Holding (Total Qty)']) || 0) > 0) {
      const pan = String(row['1st Holder PAN'] ?? '').trim().toUpperCase();
      if (pan) holderPanSet.add(pan);
    }
  }
  const annexARows = [];
  for (const [pan, info] of getPromoterMap(issuerCode)) {
    if (!holderPanSet.has(pan)) {
      annexARows.push({ pan, name: info.name ?? '', promoterType: info.promoterType });
    }
  }
  annexARows.sort((a, b) => {
    if (a.promoterType !== b.promoterType) return a.promoterType === 'PROMOTER' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });

  // ── Foreign ownership: count holdings with flag 'Y' ─────────────────────────
  let foreignShares = 0;
  for (const row of allRows) {
    if (row['shpForeignOwnership'] === 'Y') foreignShares += Number(row['Holding (Total Qty)']) || 0;
  }

  // Determine TOTAL_SHARES
  let totalShares = (isinTotalHoldings != null && isinTotalHoldings !== '' && Number.isFinite(Number(isinTotalHoldings)))
    ? Number(isinTotalHoldings)
    : null;
  let totalSharesSource = 'isin';
  if (totalShares === null) {
    totalShares = allRows.reduce((sum, r) => sum + (Number(r['Holding (Total Qty)']) || 0), 0);
    totalSharesSource = 'benpos';
  }

  const foreignOwnershipWarning = totalShares <= 0
    ? 'Total holding missing: foreign ownership shown as 0.00.'
    : null;
  const utilizedPct = totalShares > 0
    ? Math.round(foreignShares / totalShares * 100 * 10000) / 10000
    : 0;

  // Filter to promoter rows
  const promoterRows = allRows.filter(r => {
    const cat = String(r['Category type description'] ?? '').trim().toUpperCase();
    return cat === 'PROMOTER' || cat === 'PROMOTER GROUP';
  });

  const skippedPans = [];

  // Group by (SHP code, PAN) and aggregate
  // Map<shpCode, Map<pan, holderLine>>
  const byCodePan = new Map();

  for (const row of promoterRows) {
    const rawShpCode = row['SHP Promoter Code'];
    if (!rawShpCode) {
      const pan = String(row['1st Holder PAN'] ?? '').trim();
      if (pan && !skippedPans.includes(pan)) skippedPans.push(pan);
      continue;
    }

    const pan = String(row['1st Holder PAN'] ?? '').trim().toUpperCase() || '__NO_PAN__';
    const shpCode = resolveShpCode(rawShpCode, PROMOTER_INDIVIDUAL_OVERRIDE, row['shpCategoryTypeDescription'], row['1st Holder PAN']);
    const catType = String(row['Category type description'] ?? '').trim().toUpperCase();
    const entityType = catType === 'PROMOTER' ? 'Promoter' : 'Promoter Group';
    const holdingQty = Number(row['Holding (Total Qty)']) || 0;
    const isDemat = String(row['Holding Type'] ?? '').startsWith('DEMAT');

    if (!byCodePan.has(shpCode)) byCodePan.set(shpCode, new Map());
    const panMap = byCodePan.get(shpCode);

    if (!panMap.has(pan)) {
      panMap.set(pan, {
        name: row['First_Holder_Name'] ?? '',
        entityType,
        pan: pan === '__NO_PAN__' ? '' : pan,
        f: 0, u: 0, w: 0, y: 0, ae: 0,
        _physicalQty: 0,
        _biggestHolding: 0,
      });
    }

    const line = panMap.get(pan);
    line.f  += holdingQty;
    line.u  += Number(row['Lock In Qty'])  || 0;
    line.w  += Number(row['Pledged Qty'])  || 0;
    line.y  += Number(row['NDU Qty'])      || 0;
    if (!isDemat) line._physicalQty += holdingQty;
    // Keep name from the biggest single holding
    if (holdingQty > line._biggestHolding) {
      line._biggestHolding = holdingQty;
      line.name = row['First_Holder_Name'] ?? line.name;
    }
  }

  // AE = max(0, F - physicalQty) per holder
  for (const panMap of byCodePan.values()) {
    for (const line of panMap.values()) {
      line.ae = Math.max(0, line.f - line._physicalQty);
    }
  }

  // Convert to Map<shpCode, holderLine[]>
  const holdersByCode = new Map();
  for (const [code, panMap] of byCodePan) {
    holdersByCode.set(code, [...panMap.values()]);
  }

  const noPromoters = promoterRows.length === 0;

  // ── Table III: public shareholders ─────────────────────────────────────────
  const faceValueNum = (faceValue != null && faceValue !== '' && Number.isFinite(Number(faceValue)))
    ? Number(faceValue)
    : null;

  const publicRows = allRows.filter(r => {
    const cat = String(r['Category type description'] ?? '').trim().toUpperCase();
    return cat !== 'PROMOTER' && cat !== 'PROMOTER GROUP';
  });

  const skippedPublicPans    = []; // no SHP Public Code at all
  const skippedUnknownCPans  = []; // code starts with C but is not in VALID_C_CODES
  const byPublicCodePan      = new Map(); // T3: B-codes
  const byNonPublicCodePan   = new Map(); // T4: C-codes

  // Helper: accumulate a holding row into a byXxxCodePan map
  function accumulate(targetMap, shpCode, row) {
    const pan = String(row['1st Holder PAN'] ?? '').trim().toUpperCase() || '__NO_PAN__';
    const holdingQty = Number(row['Holding (Total Qty)']) || 0;
    const isDemat    = String(row['Holding Type'] ?? '').startsWith('DEMAT');

    if (!targetMap.has(shpCode)) targetMap.set(shpCode, new Map());
    const panMap = targetMap.get(shpCode);

    if (!panMap.has(pan)) {
      panMap.set(pan, {
        name: row['First_Holder_Name'] ?? '',
        pan: pan === '__NO_PAN__' ? '' : pan,
        f: 0, u: 0, ae: 0,
        _physicalQty: 0,
        _biggestHolding: 0,
      });
    }

    const line = panMap.get(pan);
    line.f += holdingQty;
    line.u += Number(row['Lock In Qty']) || 0;
    if (!isDemat) line._physicalQty += holdingQty;
    if (holdingQty > line._biggestHolding) {
      line._biggestHolding = holdingQty;
      line.name = row['First_Holder_Name'] ?? line.name;
    }
  }

  for (const row of publicRows) {
    const rawCode = row['SHP Public Code'];
    const code    = rawCode ? String(rawCode).trim() : '';
    const pan     = String(row['1st Holder PAN'] ?? '').trim();

    if (!code) {
      if (pan && !skippedPublicPans.includes(pan)) skippedPublicPans.push(pan);
      continue;
    }

    if (code.startsWith('B')) {
      const effectiveCode = resolveShpCode(code, PUBLIC_INDIVIDUAL_OVERRIDE, row['shpCategoryTypeDescription'], row['1st Holder PAN']);
      accumulate(byPublicCodePan, effectiveCode, row);
    } else if (code.startsWith('C')) {
      if (VALID_C_CODES.has(code)) {
        accumulate(byNonPublicCodePan, code, row);
      } else {
        if (pan && !skippedUnknownCPans.includes(pan)) skippedUnknownCPans.push(pan);
      }
    } else {
      if (pan && !skippedPublicPans.includes(pan)) skippedPublicPans.push(pan);
    }
  }

  // AE = max(0, F - physicalQty) for T3 holders
  for (const panMap of byPublicCodePan.values()) {
    for (const line of panMap.values()) {
      line.ae = Math.max(0, line.f - line._physicalQty);
    }
  }

  // B4g/B4h split: holders with f × faceValue > 200_000 move to __B4H__
  let faceValueMissing = false;
  if (byPublicCodePan.has('B4g')) {
    if (faceValueNum !== null) {
      const b4gMap = byPublicCodePan.get('B4g');
      const b4hEntries = [];
      for (const [pan, line] of b4gMap) {
        if (line.f * faceValueNum > 200_000) b4hEntries.push([pan, line]);
      }
      if (b4hEntries.length > 0) {
        if (!byPublicCodePan.has('__B4H__')) byPublicCodePan.set('__B4H__', new Map());
        const b4hMap = byPublicCodePan.get('__B4H__');
        for (const [pan, line] of b4hEntries) { b4gMap.delete(pan); b4hMap.set(pan, line); }
      }
    } else {
      faceValueMissing = true;
    }
  }

  // Convert to Map<shpCode, holderLine[]>
  const holdersByPublicCode = new Map();
  for (const [code, panMap] of byPublicCodePan) {
    holdersByPublicCode.set(code, [...panMap.values()]);
  }

  // AE = max(0, F - physicalQty) for T4 holders
  for (const panMap of byNonPublicCodePan.values()) {
    for (const line of panMap.values()) {
      line.ae = Math.max(0, line.f - line._physicalQty);
    }
  }

  const holdersByNonPublicCode = new Map();
  for (const [code, panMap] of byNonPublicCodePan) {
    holdersByNonPublicCode.set(code, [...panMap.values()]);
  }

  const noPublic    = publicRows.length === 0;
  const noNonPublic = holdersByNonPublicCode.size === 0;

  // ── Assign xa/xb/xc to matched holders (objects shared by byXxxPan and holdersByXxx) ──
  if (convMap.size > 0) {
    for (const panMap of byCodePan.values()) {
      for (const [pan, line] of panMap) {
        if (pan === '__NO_PAN__') continue;
        const conv = convMap.get(pan);
        if (conv) { line.xa = conv.xa; line.xb = conv.xb; line.xc = conv.xc; conv._consumed = true; }
      }
    }
    for (const panMap of byPublicCodePan.values()) {
      for (const [pan, line] of panMap) {
        if (pan === '__NO_PAN__') continue;
        const conv = convMap.get(pan);
        if (conv) { line.xa = conv.xa; line.xb = conv.xb; line.xc = conv.xc; conv._consumed = true; }
      }
    }
    for (const panMap of byNonPublicCodePan.values()) {
      for (const [pan, line] of panMap) {
        if (pan === '__NO_PAN__') continue;
        const conv = convMap.get(pan);
        if (conv) { line.xa = conv.xa; line.xb = conv.xb; line.xc = conv.xc; conv._consumed = true; }
      }
    }
  }

  // ── Handle unmatched convertible PANs (zero-equity holder rows) ───────────────
  const unmappedConvRows = [];
  if (convMap.size > 0) {
    const physMap = getCategoryMap().physicalByDescription;
    for (const [pan, conv] of convMap) {
      if (conv._consumed) continue;
      const physKey = normCategoryDesc(conv.type ?? '') + '|' + normCategoryDesc(conv.subType ?? '');
      const physEntry = physMap[physKey];
      if (!physEntry) {
        unmappedConvRows.push({ pan, type: conv.type, subType: conv.subType });
        continue;
      }
      const isPromoter = String(conv.promoterFlag ?? '').trim().toLowerCase() === 'yes';
      const rawCode = isPromoter ? physEntry.shpPromoterCode : physEntry.shpPublicCode;
      if (!rawCode) {
        unmappedConvRows.push({ pan, type: conv.type, subType: conv.subType });
        continue;
      }
      const overrideMap = isPromoter ? PROMOTER_INDIVIDUAL_OVERRIDE : PUBLIC_INDIVIDUAL_OVERRIDE;
      const code = resolveShpCode(rawCode, overrideMap, conv.type, pan);

      if (isPromoter) {
        const pmEntry = getPromoterMap(issuerCode).get(pan);
        const entityType = pmEntry
          ? (pmEntry.promoterType === 'PROMOTER' ? 'Promoter' : 'Promoter Group')
          : 'Promoter';
        if (!holdersByCode.has(code)) holdersByCode.set(code, []);
        holdersByCode.get(code).push({
          name: conv.name, entityType, pan,
          f: 0, u: 0, w: 0, y: 0, ae: 0,
          xa: conv.xa, xb: conv.xb, xc: conv.xc,
          _physicalQty: 0, _biggestHolding: 0,
        });
      } else if (code.startsWith('B')) {
        if (!holdersByPublicCode.has(code)) holdersByPublicCode.set(code, []);
        holdersByPublicCode.get(code).push({
          name: conv.name, pan,
          f: 0, u: 0, ae: 0,
          xa: conv.xa, xb: conv.xb, xc: conv.xc,
          _physicalQty: 0, _biggestHolding: 0,
        });
      } else if (code.startsWith('C') && VALID_C_CODES.has(code)) {
        if (!holdersByNonPublicCode.has(code)) holdersByNonPublicCode.set(code, []);
        holdersByNonPublicCode.get(code).push({
          name: conv.name, pan,
          f: 0, u: 0, ae: 0,
          xa: conv.xa, xb: conv.xb, xc: conv.xc,
          _physicalQty: 0, _biggestHolding: 0,
        });
      } else {
        unmappedConvRows.push({ pan, type: conv.type, subType: conv.subType });
      }
    }
  }

  // Total outstanding convertible/warrant/ESOP — used as extra denominator in XII
  let convTotal = 0;
  for (const c of convMap.values()) convTotal += c.xa + c.xb + c.xc;

  // ── Foreign ownership: fetch previous quarters ───────────────────────────────
  let previousQuarters = null;
  try {
    const prevRes = await api.get(`/admin/v1/foreign-ownership/${isin}/previous`, { params: { asOn: dateStr } });
    previousQuarters = prevRes.data?.data?.quarters ?? null;
  } catch { /* fail gracefully — history rows will show "-" */ }

  const annexBData = {
    benposDate: dateStr,
    foreignShares,
    totalShares,
    utilizedPct,
    quarters: previousQuarters,
  };

  const blob = await buildShpAllSheetsBlob(holdersByCode, holdersByPublicCode, holdersByNonPublicCode, totalShares, convTotal, { ...entityInfo, dateStr }, shpTableData, annexARows, annexBData);
  downloadBlob(blob, `Shareholding_Pattern_${isin}_${fmtDateForFilename(dateStr)}.xlsx`);

  // ── Save foreign ownership history (non-blocking) ────────────────────────────
  let foreignOwnershipHistorySaved = true;
  try {
    await api.post('/admin/v1/foreign-ownership', {
      isin,
      benposDate: dateStr,
      foreignShares,
      totalHolding: totalShares,
      utilizedPct,
      boardLimitPct: 100,
    });
  } catch {
    foreignOwnershipHistorySaved = false;
  }

  return {
    skippedPans, skippedPublicPans, skippedUnknownCPans,
    totalSharesSource, promoterWarning, categoryWarning,
    noPromoters, noPublic, noNonPublic, faceValueMissing,
    unmappedConvRows,
    foreignOwnershipWarning, foreignOwnershipHistorySaved,
  };
}
