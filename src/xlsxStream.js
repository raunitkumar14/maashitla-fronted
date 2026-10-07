// Streaming .xlsx writer: builds the file in chunks (no per-cell objects), so it
// handles hundreds of thousands of rows without SheetJS's memory blow-up.
import { Zip, ZipDeflate, strToU8 } from "fflate";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const MAX_CELL_CHARS = 32767;

function colName(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const esc = (s) => s.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const tick = () => new Promise((r) => setTimeout(r, 0));

function cellXml(ref, v, sAttr) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${sAttr}><v>${v}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    v = v.toISOString().slice(0, 10);
  }
  const str = String(v);
  if (!str.trim()) return "";
  const s = str.length > MAX_CELL_CHARS ? str.slice(0, MAX_CELL_CHARS) : str;
  const preserve = /^\s|\s$|[\r\n]/.test(s) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t${preserve}>${esc(s)}</t></is></c>`;
}

/**
 * headers: string[]; rows: any[][] (array of arrays, same order as headers)
 * opts: { sheetName, headerFill (hex, no #), colWidths (number[] in chars), rowsPerSheet, onProgress(doneRows,total) }
 * returns Promise<Blob>
 */
export async function buildXlsxBlob(headers, rows, opts = {}) {
  const {
    sheetName = "Sheet1",
    headerFill = "ADD8E6",
    colWidths = null,
    rowsPerSheet = 1000000, // Excel max is 1,048,576 incl. header
    onProgress = null,
    asChunks = false, // test helper
  } = opts;

  const ncols = headers.length;
  const cols = Array.from({ length: ncols }, (_, i) => colName(i));
  const perSheetData = Math.max(1, rowsPerSheet - 1);
  const sheetCount = Math.max(1, Math.ceil(rows.length / perSheetData));
  const names = Array.from({ length: sheetCount }, (_, i) => {
    const base = sheetCount === 1 ? sheetName : `${sheetName} ${i + 1}`;
    return base.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  });

  const chunks = [];
  let zipErr = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipErr = err;
    else chunks.push(chunk);
  });
  const addSmall = (name, xml) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(xml), true);
  };

  addSmall(
    "[Content_Types].xml",
    XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      "</Types>"
  );
  addSmall(
    "_rels/.rels",
    XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
  );
  addSmall(
    "xl/workbook.xml",
    XML_HEAD +
      `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>` +
      names.map((n, i) => `<sheet name="${escAttr(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      "</sheets></workbook>"
  );
  addSmall(
    "xl/_rels/workbook.xml.rels",
    XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>"
  );
  // cellXfs: 0 = default, 1 = header (bold + solid fill)
  addSmall(
    "xl/styles.xml",
    XML_HEAD +
      `<styleSheet xmlns="${NS}">` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${headerFill}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
  );

  const colsXml = colWidths
    ? "<cols>" + colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>"
    : "";
  const headerRowXml = `<row r="1">${headers.map((h, c) => cellXml(`${cols[c]}1`, h, ' s="1"')).join("")}</row>`;

  let done = 0;
  const BATCH = 2000;
  for (let s = 0; s < sheetCount; s++) {
    const f = new ZipDeflate(`xl/worksheets/sheet${s + 1}.xml`, { level: 3 });
    zip.add(f);
    f.push(strToU8(XML_HEAD + `<worksheet xmlns="${NS}">` + colsXml + "<sheetData>" + headerRowXml), false);
    const start = s * perSheetData;
    const end = Math.min(rows.length, start + perSheetData);
    for (let b = start; b < end; b += BATCH) {
      const parts = [];
      const bEnd = Math.min(end, b + BATCH);
      for (let i = b; i < bEnd; i++) {
        const row = rows[i];
        const rn = i - start + 2;
        let rx = `<row r="${rn}">`;
        for (let c = 0; c < ncols; c++) rx += cellXml(`${cols[c]}${rn}`, row[c], "");
        parts.push(rx + "</row>");
      }
      f.push(strToU8(parts.join("")), false);
      done = bEnd;
      if (zipErr) throw zipErr;
      if (onProgress) onProgress(done, rows.length);
      await tick(); // let the UI breathe
    }
    f.push(strToU8("</sheetData></worksheet>"), true);
  }
  zip.end();
  if (zipErr) throw zipErr;
  if (asChunks) return chunks;
  return new Blob(chunks, { type: MIME });
}
