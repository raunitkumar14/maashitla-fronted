import { buildXlsxBlob } from './xlsxStream';
import { resetPromoterCache, loadPromoters, getPromoterType } from './promoterMasterCache';
import { resetCategoryConvertCache, loadCategoryConvert, getCategoryConvert } from './categoryConvertCache';
import { loadCategoryMapping } from './categoryMappingCache';
import { deriveCategoryDescription } from './deriveCategoryDescription';

function fmtDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
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

export async function downloadComparisonReport(apiData) {
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
    'Dp_ID', 'Client_ID', 'Pan No', 'Beneficiary Name', 'Depositry',
    `Balance As on ${fromFmt}`,
    `Balance As on ${toFmt}`,
    'Buy', 'Sell', 'Change in Shares', 'Category',
  ];
  const headers = isAll ? ['ISIN', ...baseHeaders] : baseHeaders;

  const dataRows = rows.map(row => {
    const promoterType = getPromoterType(row.isin, row.panNo);
    const ccEntry      = getCategoryConvert(row.isin, row.panNo);
    const { description: catTypeDesc } = deriveCategoryDescription(
      row.depository, row.categoryType, row.categorySubType
    );
    const category = promoterType ?? ccEntry?.typeDescription ?? catTypeDesc ?? row.categoryTypeDescription ?? null;

    const base = [
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
    return isAll ? [String(row.isin ?? ''), ...base] : base;
  });

  // Auto-width: max of header length and longest value in each column
  const colWidths = headers.map((h, colIdx) => {
    const maxData = dataRows.reduce((max, row) => {
      const v = row[colIdx];
      if (v == null) return max;
      const len = String(v).length;
      return len > max ? len : max;
    }, h.length);
    return Math.min(maxData + 2, 60);
  });

  const sheetName = `${fromFmt}-To-${toFmt}-SalePu`.slice(0, 31);
  const fileName  = `${fromFmt}-To-${toFmt}-SalePurc-${isin}.xlsx`;

  const blob = await buildXlsxBlob(headers, dataRows, {
    sheetName,
    headerFill: 'ADD8E6',
    colWidths,
    freezeTopRow: true,
  });

  downloadBlob(blob, fileName);
}
