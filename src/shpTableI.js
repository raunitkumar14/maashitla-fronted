// src/shpTableI.js
// Builds the XML of the "Table I - Summary Statement holding of specified securities" sheet.
// Pure module: no imports, no DOM, no network. The caller (shpExcelBuilder.js) passes the
// numbers that were already computed for Table II / III / IV and the style ids of its styles.xml.

// ---------- column helpers ----------
export const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const colIndex = (s) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

// ---------- column map (match by HEADING; letters are only a cross-check) ----------
// Table I column -> heading -> Table II column (one extra column "Entity type", so +1) -> Table III/IV column
export const TABLE_I_COLUMN_MAP = [
  { col: 'D',  heading: 'Number of shareholders',                          t2: 'E',  t34: 'D'  },
  { col: 'E',  heading: 'No. of fully paid up equity shares held',         t2: 'F',  t34: 'E'  },
  { col: 'F',  heading: 'No. of Partly paid-up equity shares held',        t2: 'G',  t34: 'F'  },
  { col: 'G',  heading: 'No. of shares underlying Depository Receipts',    t2: 'H',  t34: 'G'  },
  { col: 'H',  heading: 'Total nos. shares held',                          t2: 'I',  t34: 'H'  },
  { col: 'I',  heading: 'Shareholding as a % of total no. of shares',      t2: 'J',  t34: 'I'  },
  { col: 'J',  heading: 'Voting Rights - Class X',                         t2: 'K',  t34: 'J'  },
  { col: 'K',  heading: 'Voting Rights - Class Y',                         t2: 'L',  t34: 'K'  },
  { col: 'L',  heading: 'Voting Rights - Total',                           t2: 'M',  t34: 'L'  },
  { col: 'M',  heading: 'Total as a % of Total Voting Rights',             t2: 'N',  t34: 'M'  },
  { col: 'N',  heading: 'Underlying Outstanding convertible securities (XA)', t2: 'O', t34: 'N' },
  { col: 'O',  heading: 'Underlying Outstanding Warrants (XB)',            t2: 'P',  t34: 'O'  },
  { col: 'P',  heading: 'Outstanding ESOP Granted (XC)',                   t2: 'Q',  t34: 'P'  },
  { col: 'Q',  heading: '(X) = (XA+XB+XC)',                                t2: 'R',  t34: 'Q'  },
  { col: 'R',  heading: 'Total No. of shares on fully diluted basis (XI)', t2: 'S',  t34: 'R'  },
  { col: 'S',  heading: 'Shareholding % assuming full conversion (XII)',   t2: 'T',  t34: 'S'  },
  { col: 'T',  heading: 'Locked in shares - No. (a)',                      t2: 'U',  t34: 'T'  },
  { col: 'U',  heading: 'Locked in shares - %',                            t2: 'V',  t34: 'U'  },
  { col: 'V',  heading: 'Pledged - No. (a)',                               t2: 'W',  t34: null },
  { col: 'W',  heading: 'Pledged - %',                                     t2: 'X',  t34: null },
  { col: 'X',  heading: 'Non-Disposal Undertaking - No. (a)',              t2: 'Y',  t34: null },
  { col: 'Y',  heading: 'Non-Disposal Undertaking - %',                    t2: 'Z',  t34: null },
  { col: 'Z',  heading: 'Other encumbrances - No. (a)',                    t2: 'AA', t34: null },
  { col: 'AA', heading: 'Other encumbrances - %',                          t2: 'AB', t34: null },
  { col: 'AB', heading: 'Total encumbered - No. (a)',                      t2: 'AC', t34: null },
  { col: 'AC', heading: 'Total encumbered - %',                            t2: 'AD', t34: null },
  { col: 'AD', heading: 'Equity shares held in dematerialized form',       t2: 'AE', t34: 'AD' },
];

/** values keyed by Table II column letters -> values keyed by Table I column letters */
export function fromTableII(byLetter) {
  const out = {};
  for (const m of TABLE_I_COLUMN_MAP) if (m.t2 && byLetter[m.t2] !== undefined) out[m.col] = byLetter[m.t2];
  return out;
}
/** values keyed by Table III / Table IV column letters -> values keyed by Table I column letters */
export function fromTableIIIorIV(byLetter) {
  const out = {};
  for (const m of TABLE_I_COLUMN_MAP) if (m.t34 && byLetter[m.t34] !== undefined) out[m.col] = byLetter[m.t34];
  return out;
}
/** an array whose index 0 is column A (or firstCol) -> object keyed by letters */
export function arrayToLetters(arr, firstCol = 'A') {
  const o = {}; const base = colIndex(firstCol);
  arr.forEach((v, i) => { o[colLetter(base + i)] = v; });
  return o;
}

// ---------- layout constants (copied from the reference sheet "Table I") ----------
const TITLE = 'Table I - Summary Statement holding of specified securities';
const HEADERS = [ // [range, text]
  ['B3:B5', 'Category'], ['C3:C5', 'Category of shareholder'], ['D3:D5', 'Number of\nshareholders'],
  ['E3:E5', 'No. of fully paid up equity shares held'], ['F3:F5', 'No. of Partly paid-up equity shares held'],
  ['G3:G5', 'No. of shares underlying Depository Receipts'], ['H3:H5', 'Total nos. shares held'],
  ['I3:I5', 'Shareholding as a % of total no. of shares (calculated as per SCRR, 1957)'],
  ['J3:M3', 'Number of Voting Rights held in each class of securities'], ['J4:L4', 'No. of Voting Rights'],
  ['M4:M5', 'Total as a % (A+B+C)'], ['J5', 'Class X: EQUITY '], ['K5', 'Class : Y'], ['L5', 'Total'],
  ['N3:N5', 'No. Of Shares Underlying Outstanding convertible securities\n'], ['O3:O5', 'No. of Shares Underlying Outstanding Warrants \n'],
  ['P3:P5', 'No. Of Outstanding ESOP Granted'],
  ['Q3:Q5', 'No. of Shares Underlying Outstanding convertible securities, No. of Warrants and ESOP etc.\n'],
  ['R3:R5', 'Total No. of shares on fully diluted basis (including warrants, ESOP, Convertible Securities etc.)'],
  ['S3:S5', 'Shareholding , as a % assuming full conversion of convertible securities ( as a percentage of diluted share capital)'],
  ['T3:U3', 'Number of Locked in shares'], ['V3:W3', 'Number of Shares pledged'], ['X3:Y3', 'Non-Disposal Undertaking'],
  ['Z3:AA3', 'Other encumbrances, if any'], ['AB3:AC3', 'Total Number of Shares encumbered '],
  ['T4:T5', 'No. (a)'], ['U4:U5', 'As a % of total shares held (b)'], ['V4:V5', 'No. (a)'], ['W4:W5', 'As a % of total shares held (b)'],
  ['X4:X5', 'No. (a)'], ['Y4:Y5', 'As a % of total shares held (b)'], ['Z4:Z5', 'No. (a)'], ['AA4:AA5', 'As a % of total shares held (b)'],
  ['AB4:AB5', 'No. (a)'], ['AC4:AC5', 'As a % of total shares held (b)'],
  ['AD3:AD5', 'Number of equity shares held in dematerialized form '],
  ['AE3:AG3', 'Sub-categorization of shares\n\n(XIX)'], ['AE4:AG4', 'Shareholding (No. of shares) under'],
  ['AE5:AE6', 'Sub-category (i)'], ['AF5:AF6', 'Sub-category (ii)'], ['AG5:AG6', 'Sub-category (iii)'],
  // row 6 (roman numerals)
  ['B6', '(I)'], ['C6', '(II)'], ['D6', '(III)'], ['E6', '(IV)'], ['F6', '(V)'], ['G6', '(VI)'], ['H6', '(VII) = (IV)+(V)+ (VI)'],
  ['I6', '(VIII) As a % of (A+B+C2)'], ['J6:M6', '(IX)'], ['N6', '(XA)'], ['O6', '(XB)'], ['P6', '(XC)'], ['Q6', '(X) = (XA+XB+XC)'],
  ['R6', '(XI)=(VII+X)'], ['S6', '(XII)= (VII)+(X)\nAs a % of (A+B+C2)'], ['T6:U6', '(XIII)'], ['V6:W6', '(XIV)'], ['X6:Y6', '(XV)'],
  ['Z6:AA6', '(XVI)'], ['AB6:AC6', '(XVII) = (XIV+XV+XVI)'], ['AD6', '(XVIII)'],
];
const ROW_HEIGHT = { 1: 37.5, 3: 50.25, 4: 36, 5: 57.75, 6: 45.75, 7: 25.5, 8: 25.5, 9: 25.5, 10: 25.5, 11: 25.5, 12: 32.25 };
const COL_WIDTH = { A: 1.3, B: 11.4, C: 33.4, D: 13.9, E: 15, F: 13.1, G: 13.7, H: 16, I: 14.4, J: 13.7, K: 13.7, L: 13.7, M: 9.9, N: 15.4, O: 13.7, P: 13.7, Q: 17.4, R: 17.3, S: 22, T: 14.3, U: 11.3, V: 16.4, W: 9.3, X: 16.4, Y: 9.3, Z: 16.4, AA: 9.3, AB: 16.4, AC: 9.3, AD: 17.3, AE: 14.4, AF: 14.4, AG: 14.4 };

const PCT_COLS = new Set(['I', 'M', 'S', 'U', 'W', 'Y', 'AA', 'AC']);
const BEIGE_COLS = new Set(['D', 'E', 'T']);            // light input tint in rows (A)..(C2)
const rng = (a, b) => { const o = []; for (let i = colIndex(a); i <= colIndex(b); i++) o.push(colLetter(i)); return o; };
const ENC = rng('V', 'AC'), SUB = ['AE', 'AF', 'AG'];
const GREY = {      // not-applicable cells per body row (from the reference sheet)
  A: new Set(SUB),
  B: new Set(ENC),
  C: new Set(['I', 'S', ...ENC, ...SUB]),
  C1: new Set(['I', 'S', ...ENC, ...SUB]),
  C2: new Set([...ENC, ...SUB]),
};
const BODY = [
  { key: 'A',  r: 7,  b: '(A)',          c: 'Promoter & Promoter Group ' },
  { key: 'B',  r: 8,  b: '(B)',          c: 'Public Shares' },
  { key: 'C',  r: 9,  b: '(C)',          c: 'Non- Promoter- None Public' },
  { key: 'C1', r: 10, b: '      (C1)',   c: 'Shares underlying DRs' },
  { key: 'C2', r: 11, b: '      (C2)',   c: 'Shares held by Employee Trusts' },
];
const ADDITIVE = ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'N', 'O', 'P', 'Q', 'R', 'T', 'V', 'X', 'Z', 'AB', 'AD', 'AE', 'AF', 'AG'];
const ALL_DATA_COLS = rng('D', 'AG');

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[ --￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const defaultStrCell = (ref, text, s) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const numCell = (ref, v, s) => `<c r="${ref}" s="${s}"><v>${Number.isFinite(v) ? v : 0}</v></c>`;
const blankCell = (ref, s) => `<c r="${ref}" s="${s}"/>`;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const splitRef = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return [m[1], Number(m[2])]; };
function expand(range) {
  const [a, b = a] = range.split(':'); const [c1, r1] = splitRef(a), [c2, r2] = splitRef(b); const out = [];
  for (let r = r1; r <= r2; r++) for (let c = colIndex(c1); c <= colIndex(c2); c++) out.push(colLetter(c) + r);
  return out;
}

/**
 * @param {object} o
 * @param {{A?:object,B?:object,C1?:object,C2?:object}} o.rows  values keyed by TABLE I column letters (D..AD). Missing = 0.
 *        A  <- fromTableII(<Table II total row (A)>)
 *        B  <- fromTableIIIorIV(<Table III total row (B)>)
 *        C1 <- fromTableIIIorIV(<Table IV row (1)>)   C2 <- fromTableIIIorIV(<Table IV row (2)>)
 *        (row (C) is computed as C1 + C2)
 * @param {number} o.totalShares  same TOTAL_SHARES as Table II/III/IV (0/undefined -> use the Total row's H)
 * @param {object} o.S style ids of the workbook's styles.xml (see STYLE_KEYS below)
 * @param {function} [o.strCell] (ref, text, styleId) => xml for a text cell (default: inline string)
 */
export function buildTableIXml({ rows = {}, totalShares = 0, S, strCell = defaultStrCell }) {
  if (!S) throw new Error('buildTableIXml: style ids (S) are required');
  const grid = {};                                   // grid[row][colIdx] = xml
  const put = (ref, xml) => { const [c, r] = splitRef(ref); (grid[r] ||= {})[colIndex(c)] = xml; };
  const merges = [];

  // title
  put('B1', strCell('B1', TITLE, S.title));
  for (const ref of expand('B1:AG1')) if (ref !== 'B1') put(ref, blankCell(ref, S.title));
  merges.push('B1:AG1');

  // headers (rows 3-6)
  for (const [range, text] of HEADERS) {
    const cells = expand(range);
    cells.forEach((ref, i) => put(ref, i === 0 ? strCell(ref, text, S.hdr) : blankCell(ref, S.hdr)));
    if (cells.length > 1) merges.push(range);
  }
  for (const col of ['B', 'C', 'D']) { /* B3:B5 etc. already merged above; row 6 cells written above */ }

  // body values
  const val = {};
  for (const k of ['A', 'B', 'C1', 'C2']) { val[k] = {}; for (const c of ALL_DATA_COLS) val[k][c] = num((rows[k] || {})[c]); }
  val.C = {}; for (const c of ALL_DATA_COLS) val.C[c] = ADDITIVE.includes(c) ? val.C1[c] + val.C2[c] : 0;

  const total = {}; for (const c of ALL_DATA_COLS) total[c] = 0;
  for (const k of ['A', 'B', 'C']) for (const c of ADDITIVE) if (!GREY[k].has(c)) total[c] += val[k][c];
  const T = totalShares > 0 ? totalShares : total.H;

  const pctOf = (v, base) => (base > 0 ? (v / base) * 100 : 0);
  const computePct = (v, c) => {
    switch (c) {
      case 'I': return pctOf(v.H, T);
      case 'M': return pctOf(v.L, T);
      case 'S': return pctOf(v.R, T);
      case 'U': return pctOf(v.T, v.E);
      case 'W': return pctOf(v.V, v.E);
      case 'Y': return pctOf(v.X, v.E);
      case 'AA': return pctOf(v.Z, v.E);
      case 'AC': return pctOf(v.AB, v.E);
      default: return 0;
    }
  };
  for (const k of ['A', 'B', 'C', 'C1', 'C2']) for (const c of PCT_COLS) {
    const given = (rows[k] || {})[c];
    val[k][c] = (k !== 'C' && typeof given === 'number' && Number.isFinite(given)) ? given : computePct(val[k], c);
  }
  for (const c of PCT_COLS) total[c] = computePct(total, c);

  // body rows
  for (const row of BODY) {
    put('B' + row.r, strCell('B' + row.r, row.b, S.lblB));
    put('C' + row.r, strCell('C' + row.r, row.c, S.lblC));
    for (const c of ALL_DATA_COLS) {
      const ref = c + row.r;
      if (GREY[row.key].has(c)) { put(ref, blankCell(ref, S.grey)); continue; }
      const style = PCT_COLS.has(c) ? S.pct : (BEIGE_COLS.has(c) ? S.qtyBeige : S.qty);
      put(ref, numCell(ref, val[row.key][c], style));
    }
  }
  // total row 12
  put('B12', strCell('B12', ' Total', S.totLbl)); put('C12', blankCell('C12', S.totLbl)); merges.push('B12:C12');
  for (const c of ALL_DATA_COLS) put(c + '12', numCell(c + '12', total[c], PCT_COLS.has(c) ? S.totPct : S.totQty));

  // assemble
  const colsXml = '<cols>' + Object.entries(COL_WIDTH).map(([c, w]) => `<col min="${colIndex(c)}" max="${colIndex(c)}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
  const rowsXml = Object.keys(grid).map(Number).sort((a, b) => a - b).map((r) => {
    const cells = Object.keys(grid[r]).map(Number).sort((a, b) => a - b).map((i) => grid[r][i]).join('');
    const h = ROW_HEIGHT[r] ? ` ht="${ROW_HEIGHT[r]}" customHeight="1"` : '';
    return `<row r="${r}"${h}>${cells}</row>`;
  }).join('');
  const mergeXml = `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<dimension ref="B1:AG12"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>' + colsXml + `<sheetData>${rowsXml}</sheetData>` + mergeXml
    + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
}

/** style keys the caller must provide in S (ids = cellXfs index in styles.xml):
 * title   dark-blue title band, bold white, left
 * hdr     dark-blue header cell, bold white, centered, wrap, thin border
 * lblB    body col B label: bold, centered, border
 * lblC    body col C label: bold, left, wrap, border
 * qty     white number cell, '#,##0' (or '0'), border
 * qtyBeige same as qty with the light beige fill (columns D, E, T)
 * pct     white percentage cell '0.00', border
 * grey    grey fill (not applicable), border
 * totLbl  Total label: dark-blue fill, bold white
 * totQty  Total number: dark-blue fill, bold white, '#,##0'
 * totPct  Total percent: dark-blue fill, bold white, '0.00'
 */
export const STYLE_KEYS = ['title', 'hdr', 'lblB', 'lblC', 'qty', 'qtyBeige', 'pct', 'grey', 'totLbl', 'totQty', 'totPct'];
