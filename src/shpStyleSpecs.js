// src/shpStyleSpecs.js
// Appends style specs (see shpTableIStyles.js) to an existing styles.xml string.
// Returns { xml, ids } where ids[i] is the cellXfs index of specs[i].
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const argb = (hex) => 'FF' + String(hex).toUpperCase();

function bump(xml, tag, newItems) {
  // adds items before </tag> and raises count; returns [xml, firstNewIndex]
  const re = new RegExp('<' + tag + '\\b([^>]*?)count="(\\d+)"([^>]*)>', 'i');
  const m = re.exec(xml);
  if (!m) throw new Error('styles.xml: <' + tag + '> with count not found');
  const first = Number(m[2]);
  xml = xml.replace(re, '<' + tag + m[1] + 'count="' + (first + newItems.length) + '"' + m[3] + '>');
  const close = xml.indexOf('</' + tag + '>');
  if (close < 0) throw new Error('styles.xml: </' + tag + '> not found');
  xml = xml.slice(0, close) + newItems.join('') + xml.slice(close);
  return [xml, first];
}
const fontXml = (f) => '<font>' + (f.b ? '<b/>' : '') + (f.i ? '<i/>' : '') + '<sz val="' + f.sz + '"/>'
  + (f.color ? '<color rgb="' + argb(f.color) + '"/>' : '<color theme="1"/>') + '<name val="' + esc(f.name || 'Calibri') + '"/><family val="2"/></font>';
const fillXml = (hex) => '<fill><patternFill patternType="solid"><fgColor rgb="' + argb(hex) + '"/><bgColor indexed="64"/></patternFill></fill>';
const sideXml = (tag, s) => s ? '<' + tag + ' style="' + s[0] + '">' + (s[1] ? '<color rgb="' + argb(s[1]) + '"/>' : '<color indexed="64"/>') + '</' + tag + '>' : '<' + tag + '/>';
const borderXml = (b) => '<border>' + sideXml('left', b.l) + sideXml('right', b.r) + sideXml('top', b.t) + sideXml('bottom', b.b) + '<diagonal/></border>';

export function appendStyleSpecs(stylesXml, specs) {
  const key = (o) => JSON.stringify(o);
  const fonts = [], fills = [], borders = [];
  const fIdx = new Map(), flIdx = new Map(), bIdx = new Map();
  const per = specs.map((sp) => {
    const fk = key(sp.font); if (!fIdx.has(fk)) { fIdx.set(fk, fonts.length); fonts.push(fontXml(sp.font)); }
    let fl = -1; if (sp.fill) { const k = sp.fill; if (!flIdx.has(k)) { flIdx.set(k, fills.length); fills.push(fillXml(sp.fill)); } fl = flIdx.get(k); }
    const bk = key(sp.bd); if (!bIdx.has(bk)) { bIdx.set(bk, borders.length); borders.push(borderXml(sp.bd)); }
    return { f: fIdx.get(fk), fl, b: bIdx.get(bk), sp };
  });
  let xml = stylesXml, base;
  let fontBase, fillBase, borderBase;
  [xml, fontBase] = bump(xml, 'fonts', fonts);
  [xml, fillBase] = bump(xml, 'fills', fills);
  [xml, borderBase] = bump(xml, 'borders', borders);
  const xfs = per.map(({ f, fl, b, sp }) => {
    const nf = typeof sp.nf === 'number' ? sp.nf : 0;
    const al = sp.al || {};
    const alignment = '<alignment' + (al.h ? ' horizontal="' + al.h + '"' : '') + (al.v ? ' vertical="' + al.v + '"' : '')
      + (al.wrap ? ' wrapText="1"' : '') + (al.indent ? ' indent="' + al.indent + '"' : '') + '/>';
    return '<xf numFmtId="' + nf + '" fontId="' + (fontBase + f) + '" fillId="' + (fl < 0 ? 0 : fillBase + fl) + '" borderId="' + (borderBase + b)
      + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"' + (sp.lk === false ? ' applyProtection="1"' : '') + '>'
      + alignment + (sp.lk === false ? '<protection locked="0"/>' : '') + '</xf>';
  });
  let xfBase;
  [xml, xfBase] = bump(xml, 'cellXfs', xfs);
  return { xml, ids: specs.map((_, i) => xfBase + i) };
}
