import { buildXlsxBlob } from './xlsxStream';
import { resetPromoterCache, loadPromoters, getPromoterType } from './promoterMasterCache';
import { resetCategoryConvertCache, loadCategoryConvert, getCategoryConvert } from './categoryConvertCache';
import { loadCategoryMapping } from './categoryMappingCache';
import { deriveCategoryDescription } from './deriveCategoryDescription';
import { Zip, ZipPassThrough } from 'fflate';

function fmtDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function sanitizeForFilename(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadComparisonReport(apiData, onProgress) {
  const { isin, fromDate, toDate, rows } = apiData;
  const isAll = isin === 'ALL';

  // Extract unique issuer codes (chars 3-7 of each ISIN) for cache loading
  const issuerCodes = [...new Set(rows.map(r => String(r.isin ?? '').slice(3, 7)).filter(Boolean))];

  try { await loadCategoryMapping(); } catch { /* non-fatal */ }

  resetPromoterCache();
  resetCategoryConvertCache();
  try { await loadPromoters(issuerCodes); } catch { /* non-fatal: category falls back */ }
  try { await loadCategoryConvert(issuerCodes); } catch { /* non-fatal */ }

  const fromFmt = fmtDDMMYYYY(fromDate);
  const toFmt   = fmtDDMMYYYY(toDate);

  const baseHeaders = [
    'Dp_ID', 'Client_ID', 'PAN', 'Beneficiary Name', 'Depositry',
    `Balance As on ${fromFmt}`,
    `Balance As on ${toFmt}`,
    'Buy', 'Sell', 'Change in Shares', 'Category',
  ];

  function mapRow(row) {
    const promoterType = getPromoterType(row.isin, row.panNo);
    const ccEntry      = getCategoryConvert(row.isin, row.panNo);
    const { description: catTypeDesc } = deriveCategoryDescription(
      row.depository, row.categoryType, row.categorySubType
    );
    const category = promoterType ?? ccEntry?.typeDescription ?? catTypeDesc ?? row.categoryTypeDescription ?? null;

    return [
      String(row.dpId    ?? ''),   // text — preserves leading zeros
      String(row.clientId ?? ''),  // text — preserves leading zeros
      row.panNo           ?? null,
      row.beneficiaryName ?? null,
      row.depository      ?? null,
      row.fromBalance,             // number
      row.toBalance,               // number
      row.buy,                     // number
      row.sell,                    // number
      row.change,                  // number
      category            ?? null,
    ];
  }

  const sheetName = `${fromFmt}-To-${toFmt}-SalePu`.slice(0, 31);

  if (!isAll) {
    const dataRows = rows.map(mapRow);
    const colWidths = baseHeaders.map((h, colIdx) => {
      const maxData = dataRows.reduce((max, row) => {
        const v = row[colIdx];
        if (v == null) return max;
        const len = String(v).length;
        return len > max ? len : max;
      }, h.length);
      return Math.min(maxData + 2, 60);
    });

    const fileName = `Comparison Report_${sanitizeForFilename(isin)}_${fromFmt}-To-${toFmt}.xlsx`;
    const blob = await buildXlsxBlob(baseHeaders, dataRows, {
      sheetName,
      headerFill: 'ADD8E6',
      colWidths,
      freezeTopRow: true,
    });
    downloadBlob(blob, fileName);
    return;
  }

  // ALL: group by ISIN (preserving incoming row order within each group)
  const byIsin = new Map();
  for (const row of rows) {
    const rowIsin = String(row.isin ?? '');
    if (!rowIsin) continue;
    if (!byIsin.has(rowIsin)) byIsin.set(rowIsin, []);
    byIsin.get(rowIsin).push(row);
  }

  const isinsWithData = [...byIsin.keys()];
  const total = isinsWithData.length;

  if (total === 0) return { isinCount: 0 };

  const zipChunks = [];
  let zipErr = null;
  const zip = new Zip((err, chunk) => {
    if (err) { zipErr = err; } else { zipChunks.push(chunk); }
  });

  for (let i = 0; i < total; i++) {
    const fileIsin = isinsWithData[i];
    const isinRows = byIsin.get(fileIsin);
    onProgress?.(`Preparing file ${(i + 1).toLocaleString()} of ${total.toLocaleString()}…`);

    const dataRows = isinRows.map(mapRow);
    const colWidths = baseHeaders.map((h, colIdx) => {
      const maxData = dataRows.reduce((max, row) => {
        const v = row[colIdx];
        if (v == null) return max;
        const len = String(v).length;
        return len > max ? len : max;
      }, h.length);
      return Math.min(maxData + 2, 60);
    });

    const xlsxBlob = await buildXlsxBlob(baseHeaders, dataRows, {
      sheetName,
      headerFill: 'ADD8E6',
      colWidths,
      freezeTopRow: true,
    });
    const uint8 = new Uint8Array(await xlsxBlob.arrayBuffer());

    const entryName = `Comparison Report_${sanitizeForFilename(fileIsin)}_${fromFmt}-To-${toFmt}.xlsx`;
    const f = new ZipPassThrough(entryName);
    zip.add(f);
    f.push(uint8, true);
    if (zipErr) throw zipErr;

    byIsin.delete(fileIsin);
    await new Promise(resolve => setTimeout(resolve, 0)); // yield to UI
  }

  zip.end();
  if (zipErr) throw zipErr;

  const zipBlob = new Blob(zipChunks, { type: 'application/zip' });
  downloadBlob(zipBlob, `Comparison Report_ALL_${fromFmt}-To-${toFmt}.zip`);

  return { isinCount: total };
}
