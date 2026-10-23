import api from './api/axios';
import { fetchBenposExportData, buildExportRows } from './benposExport';
import { loadCategoryMapping } from './categoryMappingCache';
import { resetPromoterCache, loadPromoters } from './promoterMasterCache';
import { resetCategoryConvertCache, loadCategoryConvert } from './categoryConvertCache';
import { buildShpAllSheetsBlob, VALID_C_CODES } from './shpExcelBuilder';

const BLOB_URL_REVOKE_MS = 10_000;

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
export async function exportShp(isin, dateStr, isinTotalHoldings, faceValue) {
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

  const { rows: allRows } = buildExportRows(
    cdslRows, nsdlRows, physShareholders, physShareholdings, dateStr
  );

  // Determine TOTAL_SHARES
  let totalShares = (isinTotalHoldings != null && isinTotalHoldings !== '' && Number.isFinite(Number(isinTotalHoldings)))
    ? Number(isinTotalHoldings)
    : null;
  let totalSharesSource = 'isin';
  if (totalShares === null) {
    totalShares = allRows.reduce((sum, r) => sum + (Number(r['Holding (Total Qty)']) || 0), 0);
    totalSharesSource = 'benpos';
  }

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
    const shpCode = row['SHP Promoter Code'];
    if (!shpCode) {
      const pan = String(row['1st Holder PAN'] ?? '').trim();
      if (pan && !skippedPans.includes(pan)) skippedPans.push(pan);
      continue;
    }

    const pan = String(row['1st Holder PAN'] ?? '').trim().toUpperCase() || '__NO_PAN__';
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
      accumulate(byPublicCodePan, code, row);
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

  const blob = await buildShpAllSheetsBlob(holdersByCode, holdersByPublicCode, holdersByNonPublicCode, totalShares);
  downloadBlob(blob, `Shareholding_Pattern_${isin}_${fmtDateForFilename(dateStr)}.xlsx`);

  return {
    skippedPans, skippedPublicPans, skippedUnknownCPans,
    totalSharesSource, promoterWarning, categoryWarning,
    noPromoters, noPublic, noNonPublic, faceValueMissing,
  };
}
