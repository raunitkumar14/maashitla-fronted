// src/shpTableII.js
// Gives the generated "Table II" sheet the exact look of the client's original template.
// Pure string function: takes the sheet XML written by shpExcelBuilder.js and returns the restyled XML.
// Cell values/formulas are kept; only styles, row heights, merges, column widths, footer are set.
import { TABLE_II_CELL_STYLE, TABLE_II_ROW_HEIGHT, TABLE_II_HEADER_MERGES, TABLE_II_COLS_XML } from './shpTableIIStyles.js';

const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colIndex = (s) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const LAST_COL = 34; // AH
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// template row used for a holder line (named promoter / promoter group): the plain sub-row "Director or Director's Relatives"
const HOLDER_TEMPLATE_ROW = 12;
const TOTAL_TEMPLATE_ROW = 36;
const FOOTER_NOTES = [
  { off: 4, a: 'Note' },
  { off: 5, a: '1', b: 'PAN would not be displyed on website of Stock Exchnage(s)' },
  { off: 6, a: '2', b: 'The above format needs to be diclosed alongwith the name of following pesons- Institutions/ Non Institutions holding more than  1% of the total nunber of shares.' },
  { off: 7, a: '3', b: 'With respect to the information pertaining to Depository Receipts, the same may be disclosed in the respective columns to the extent information available and the balance to be disclosed as held custodian.' },
];
// text fixes for the header rows (U4 label was missing, "(II)" belongs above PAN = column D)
const HEADER_TEXT = { U4: 'No. (a)', C6: '', D6: '(II)' };

function parseRows(sheetData) {
  const rows = [];
  const re = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(sheetData))) {
    const attrs = m[1] ?? m[3] ?? '';
    const r = Number(/\br="(\d+)"/.exec(attrs)[1]);
    const cells = {};
    const inner = m[2] || '';
    const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cre.exec(inner))) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1]);
      if (!ref) continue;
      const t = /\bt="([^"]+)"/.exec(c[1]);
      const txt = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] || '');
      cells[ref[1]] = { t: t ? t[1] : null, inner: c[2] || '', text: txt ? unesc(txt[1]) : null };
    }
    rows.push({ r, cells });
  }
  return rows;
}

/**
 * @param {string} xml        sheet XML of Table II produced by the builder
 * @param {number[]} styleIds cellXfs index for every entry of TABLE_II_STYLE_SPECS (from appendStyleSpecs)
 * @returns {string}          restyled sheet XML (unchanged input if the row layout is not recognised)
 */
export function restyleTableII(xml, styleIds) {
  const sdStart = xml.indexOf('<sheetData');
  const sdEnd = xml.indexOf('</sheetData>');
  if (sdStart < 0 || sdEnd < 0) return xml;
  const sdOpenEnd = xml.indexOf('>', sdStart) + 1;
  const rows = parseRows(xml.slice(sdOpenEnd, sdEnd));
  const isHolder = (row) => { const c = row.cells.C && row.cells.C.text; return c === 'Promoter' || c === 'Promoter Group'; };

  // 1) map every generated row to a template row of the original sheet
  const plan = []; // { row, tpl }
  let next = 9, totalRow = null, foreignRow = null;
  for (const row of rows) {
    if (row.r <= 8) { plan.push({ row, tpl: row.r }); continue; }
    const b = row.cells.B && row.cells.B.text || '';
    if (/^Total Shareholding of Promoter/i.test(b)) { plan.push({ row, tpl: TOTAL_TEMPLATE_ROW }); totalRow = row.r; break; }
    if (isHolder(row)) { plan.push({ row, tpl: HOLDER_TEMPLATE_ROW }); continue; }
    if (next === 19) foreignRow = row.r;
    plan.push({ row, tpl: next++ });
  }
  if (totalRow == null || next !== TOTAL_TEMPLATE_ROW) { console.warn('restyleTableII: unexpected row layout, styles not applied'); return xml; }
  const detailsRow = rows.find((x) => x.r > totalRow && x.cells.A && x.cells.A.text);
  const detailsText = detailsRow ? detailsRow.cells.A.text : '';

  // 2) write rows
  const styleOf = (ref) => { const i = TABLE_II_CELL_STYLE[ref]; return i === undefined ? null : styleIds[i]; };
  const cellXml = (ref, col, tpl, old) => {
    const s = styleOf(col + tpl); const sAttr = s == null ? '' : ' s="' + s + '"';
    if (!old) return '<c r="' + ref + '"' + sAttr + '/>';
    return '<c r="' + ref + '"' + sAttr + (old.t ? ' t="' + old.t + '"' : '') + (old.inner ? '>' + old.inner + '</c>' : '/>');
  };
  const out = [];
  for (const { row, tpl } of plan) {
    const ht = TABLE_II_ROW_HEIGHT[tpl];
    let cs = '';
    for (let k = 1; k <= LAST_COL; k++) {
      const col = colLetter(k); const ref = col + row.r;
      let old = row.cells[col];
      if (row.r <= 8 && (col + row.r) in HEADER_TEXT) {
        const v = HEADER_TEXT[col + row.r];
        old = v === '' ? null : { t: 'inlineStr', inner: '<is><t xml:space="preserve">' + esc(v) + '</t></is>' };
      }
      cs += cellXml(ref, col, tpl, old);
    }
    out.push('<row r="' + row.r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cs + '</row>');
  }
  // 3) footer rows copied from the original (styles + notes), placed 2 rows below the total, like the template
  const shift = totalRow - TOTAL_TEMPLATE_ROW;
  const footer = (tplRow, texts) => {
    const r = tplRow + shift; const ht = TABLE_II_ROW_HEIGHT[tplRow]; let cs = '';
    for (let k = 1; k <= LAST_COL; k++) {
      const col = colLetter(k); const ref = col + r; const t = texts && texts[col];
      cs += t == null ? cellXml(ref, col, tplRow, null) : cellXml(ref, col, tplRow, { t: 'inlineStr', inner: '<is><t xml:space="preserve">' + esc(t) + '</t></is>' });
    }
    return '<row r="' + r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cs + '</row>';
  };
  out.push(footer(37, null));
  out.push(footer(38, { A: detailsText }));
  out.push(footer(39, null));
  FOOTER_NOTES.forEach((n) => out.push(footer(36 + n.off, n.b ? { A: n.a, B: n.b } : { A: n.a })));
  const lastRow = totalRow + 7;

  // 4) merges, columns, view, dimension
  const merges = TABLE_II_HEADER_MERGES.slice();
  if (foreignRow != null) merges.push('B' + foreignRow + ':AH' + foreignRow);
  const mergeXml = '<mergeCells count="' + merges.length + '">' + merges.map((m) => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';

  let head = xml.slice(0, sdStart);
  head = head.replace(/<dimension\b[^>]*\/>/, '').replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '').replace(/<sheetFormatPr\b[^>]*\/>/, '').replace(/<cols>[\s\S]*?<\/cols>/, '');
  const pre = '<dimension ref="A1:AH' + lastRow + '"/><sheetViews><sheetView showGridLines="0" zoomScale="80" zoomScaleNormal="80" workbookViewId="0"/></sheetViews>'
    + '<sheetFormatPr defaultColWidth="9.140625" defaultRowHeight="15"/><cols>' + TABLE_II_COLS_XML + '</cols>';
  head = head.replace(/(<worksheet\b[^>]*>)/, '$1' + pre);
  let tail = xml.slice(sdEnd + '</sheetData>'.length).replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, '');
  const prot = /<sheetProtection\b[^>]*\/>/.exec(tail);
  if (prot) tail = tail.replace(prot[0], prot[0] + mergeXml); else tail = mergeXml + tail;
  return head + xml.slice(sdStart, sdOpenEnd) + out.join('') + '</sheetData>' + tail;
}
