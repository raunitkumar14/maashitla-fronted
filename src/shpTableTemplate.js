// src/shpTableTemplate.js
// Gives a generated sheet (Table III / Table IV) the exact look and row layout of the client's original template.
// Pure string function. Cell values are kept; styles, row heights, merges, column widths, footer, the template's
// zero rows (sub-rows the builder skips) and the header texts come from the template data file.
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const GREY = 'D9D9D9';

function parseRows(sheetData) {
  const rows = [];
  const re = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(sheetData))) {
    const attrs = m[1] ?? m[3] ?? '';
    const r = Number(/\br="(\d+)"/.exec(attrs)[1]);
    const cells = {};
    const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    const inner = m[2] || '';
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
const txtOf = (row, col) => (row.cells[col] && row.cells[col].text) || '';

/**
 * @param {string} xml        sheet XML written by shpExcelBuilder.js
 * @param {number[]} styleIds cellXfs index for every entry of T.specs (from appendStyleSpecs)
 * @param {object} T          TABLE_III_TEMPLATE or TABLE_IV_TEMPLATE
 * @param {object} [opts]     { holderTemplate: (templateRow) => templateRow used for styling named holder lines, debug: true }
 * @returns {string|{xml,plan}} restyled XML (the unchanged input if the row layout is not recognised)
 */
export function restyleByTemplate(xml, styleIds, T, opts = {}) {
  const fail = (why) => { console.warn('restyleByTemplate: ' + why + ' - styles not applied'); return opts.debug ? { xml, plan: [] } : xml; };
  const sdStart = xml.indexOf('<sheetData'), sdEnd = xml.indexOf('</sheetData>');
  if (sdStart < 0 || sdEnd < 0) return fail('no sheetData');
  const sdOpenEnd = xml.indexOf('>', sdStart) + 1;
  const genRows = parseRows(xml.slice(sdOpenEnd, sdEnd));
  const head = genRows.filter((r) => r.r < T.firstBody);
  const bodyAll = genRows.filter((r) => r.r >= T.firstBody);
  const tplTotal = T.rows[T.rows.length - 1];
  const totalKey = norm(tplTotal.a + tplTotal.b).slice(0, 22);
  const totalIdx = bodyAll.findIndex((r) => norm(txtOf(r, 'A') + txtOf(r, 'B')).startsWith(totalKey));
  if (totalIdx < 0) return fail('total row not found');
  const body = bodyAll.slice(0, totalIdx + 1);
  const after = bodyAll.slice(totalIdx + 1);
  const isHolder = (row) => norm(txtOf(row, 'A')) === '' && txtOf(row, 'C') !== '-';
  const holderTpl = opts.holderTemplate || ((t) => t);
  const tplByT = {}; T.rows.forEach((x) => { tplByT[x.t] = x; });

  // ---- 1) match template rows with generated rows -------------------------------------------------
  const used = body.map(() => false);
  const nextUnused = (from) => { let i = from; while (i < body.length && used[i]) i++; return i; };
  const emit = []; // { kind: 'gen'|'holder'|'zero'|'total', row, tpl }
  let p = 0;
  for (const tr of T.rows) {
    let hit = -1;
    const i0 = nextUnused(p);
    if (tr.t === tplTotal.t) { hit = totalIdx; if (used[hit]) hit = -1; }
    else if (norm(tr.a) !== '') {
      if (i0 < body.length && !isHolder(body[i0]) && norm(txtOf(body[i0], 'A')) === norm(tr.a)) hit = i0;
    } else {
      for (let j = i0; j < body.length; j++) {
        if (norm(txtOf(body[j], 'A')) !== '') break;           // next labelled row = end of this block
        if (!used[j] && !isHolder(body[j]) && norm(txtOf(body[j], 'B')) === norm(tr.b)) { hit = j; break; }
      }
    }
    if (hit < 0) { emit.push({ kind: 'zero', tpl: tr.t }); continue; }
    used[hit] = true;
    emit.push({ kind: tr.t === tplTotal.t ? 'total' : 'gen', row: body[hit], tpl: tr.t });
    for (let k = hit + 1; k < body.length && !used[k] && isHolder(body[k]); k++) { used[k] = true; emit.push({ kind: 'holder', row: body[k], tpl: holderTpl(tr.t), parent: tr.t }); }
    p = nextUnused(p);
  }
  const left = body.filter((_, i) => !used[i]);
  if (left.length) return fail('rows not matched: ' + left.map((r) => txtOf(r, 'B')).join(' | '));

  // ---- 2) write rows -------------------------------------------------------------------------------
  const isGrey = (tpl, k) => { const sp = T.specs[T.rowStyle[tpl][k - 1]]; return sp && sp.fill === GREY; };
  const styleAttr = (tpl, k) => { const i = T.rowStyle[tpl] && T.rowStyle[tpl][k - 1]; return i === undefined ? '' : ' s="' + styleIds[i] + '"'; };
  const strCell = (ref, s, text) => '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(text) + '</t></is></c>';
  const keepCell = (ref, s, old) => '<c r="' + ref + '"' + s + (old.t ? ' t="' + old.t + '"' : '') + (old.inner ? '>' + old.inner + '</c>' : '/>');
  const blank = (ref, s) => '<c r="' + ref + '"' + s + '/>';
  const rowXml = (r, ht, cs) => '<row r="' + r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cs + '</row>';

  const out = [];
  // header rows (same row numbers)
  for (let r = 1; r < T.firstBody; r++) {
    const row = head.find((x) => x.r === r); let cs = '';
    for (let k = 1; k <= T.lastCol; k++) {
      const col = colLetter(k), ref = col + r, s = styleAttr(r, k), ht = T.header[ref];
      if (ht !== undefined) cs += strCell(ref, s, ht);
      else if (row && row.cells[col]) cs += keepCell(ref, s, row.cells[col]);
      else cs += blank(ref, s);
    }
    out.push(rowXml(r, T.heights[r], cs));
  }
  const outRow = {}; const plan = [];
  let n = T.firstBody;
  for (const e of emit) {
    const r = n++; const tpl = e.tpl; const tr = tplByT[tpl]; const vals = new Set(tr.vals);
    if (e.kind !== 'holder') outRow[e.parent || tpl] = r;
    plan.push({ out: r, tpl, kind: e.kind });
    let cs = '';
    for (let k = 1; k <= T.lastCol; k++) {
      const col = colLetter(k), ref = col + r, s = styleAttr(tpl, k);
      const old = e.row && e.row.cells[col];
      if (isGrey(tpl, k)) { cs += blank(ref, s); continue; }
      if (e.kind === 'total' && tr.a && (col === 'A' || col === 'B')) {   // Table III: text lives in A (A:B merged)
        cs += col === 'A' ? strCell(ref, s, txtOf(e.row, 'B') || txtOf(e.row, 'A')) : blank(ref, s); continue;
      }
      if ((e.kind === 'gen' || e.kind === 'total') && (col === 'A' || col === 'B')) {   // Table IV total: text stays in B
        const t = col === 'A' ? tr.a : tr.b; cs += t ? strCell(ref, s, t) : blank(ref, s); continue;
      }
      if (e.kind === 'zero') {
        if (col === 'A' || col === 'B' || col === 'C') { const t = col === 'A' ? tr.a : col === 'B' ? tr.b : tr.c; cs += t ? strCell(ref, s, t) : blank(ref, s); }
        else cs += vals.has(col) ? '<c r="' + ref + '"' + s + '><v>0</v></c>' : blank(ref, s);
        continue;
      }
      if (col !== 'A' && col !== 'B' && col !== 'C' && !vals.has(col)) { cs += blank(ref, s); continue; }   // template leaves this cell empty
      if (old && (old.inner || old.t)) cs += keepCell(ref, s, old);
      else if (col !== 'A' && col !== 'B' && col !== 'C' && vals.has(col)) cs += '<c r="' + ref + '"' + s + '><v>0</v></c>';
      else cs += blank(ref, s);
    }
    let ht = T.heights[tpl];
    if (e.kind === 'holder') { const lines = Math.max(1, Math.ceil(txtOf(e.row, 'B').length / 36)); ht = Math.max(ht || 15, lines * 15 + 1.5); }
    out.push(rowXml(r, ht, cs));
  }
  // footer (rows below the total row of the template)
  const afterTexts = after.map((r) => txtOf(r, 'A') || txtOf(r, 'B')).filter(Boolean);
  const shift = outRow[T.totalRow] - T.totalRow;
  let detailsSeen = 0;
  for (const f of T.footer) {
    const r = f.t + shift; let cs = '';
    const texts = Object.assign({}, f.texts);
    if (texts.A && /^Details of/i.test(texts.A) && afterTexts[detailsSeen]) texts.A = afterTexts[detailsSeen++];
    for (let k = 1; k <= T.lastCol; k++) {
      const col = colLetter(k), ref = col + r, s = styleAttr(f.t, k);
      cs += texts[col] != null ? strCell(ref, s, texts[col]) : blank(ref, s);
    }
    out.push(rowXml(r, T.heights[f.t], cs));
    outRow[f.t] = r;
  }
  const lastRow = T.footer.length ? T.lastRow + shift : outRow[T.totalRow];

  // ---- 3) merges, columns, view, dimension ---------------------------------------------------------
  const merges = [];
  for (const m of T.merges) {
    const g = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m); if (!g) continue;
    const r1 = Number(g[2]), r2 = Number(g[4]);
    if (r2 < T.firstBody) merges.push(m);
    else if (r1 === r2 && outRow[r1] != null) merges.push(g[1] + outRow[r1] + ':' + g[3] + outRow[r1]);
  }
  const mergeXml = '<mergeCells count="' + merges.length + '">' + merges.map((m) => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
  let h = xml.slice(0, sdStart);
  h = h.replace(/<dimension\b[^>]*\/>/, '').replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '').replace(/<sheetFormatPr\b[^>]*\/>/, '').replace(/<cols>[\s\S]*?<\/cols>/, '');
  const pre = '<dimension ref="A1:' + colLetter(T.lastCol) + lastRow + '"/><sheetViews>' + T.sheetView + '</sheetViews><sheetFormatPr defaultColWidth="9.140625" defaultRowHeight="15"/><cols>' + T.colsXml + '</cols>';
  h = h.replace(/(<worksheet\b[^>]*>)/, '$1' + pre);
  let tail = xml.slice(sdEnd + '</sheetData>'.length).replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, '');
  const prot = /<sheetProtection\b[^>]*\/>/.exec(tail);
  tail = prot ? tail.replace(prot[0], prot[0] + mergeXml) : mergeXml + tail;
  const res = h + xml.slice(sdStart, sdOpenEnd) + out.join('') + '</sheetData>' + tail;
  return opts.debug ? { xml: res, plan } : res;
}

// Which template row styles a named holder line: the first plain sub-row of the block it belongs to.
export const TABLE_III_HOLDER_TEMPLATE = (t) => (t <= 29 ? 19 : t <= 52 ? 38 : 72);
export const TABLE_IV_HOLDER_TEMPLATE = (t) => t;
