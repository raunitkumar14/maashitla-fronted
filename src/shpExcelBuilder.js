// Builds a Table II Shareholding Pattern xlsx (raw XML via fflate).
import { Zip, ZipDeflate, strToU8 } from 'fflate';
import { buildTableIXml, fromTableII, fromTableIIIorIV, arrayToLetters } from './shpTableI';
import { appendStyleSpecs } from './shpStyleSpecs.js';
import { TABLE_I_STYLE_SPECS } from './shpTableIStyles.js';
import { TABLE_II_STYLE_SPECS } from './shpTableIIStyles.js';
import { restyleTableII } from './shpTableII.js';
import { TABLE_III_TEMPLATE } from './shpTableIIIData.js';
import { TABLE_IV_TEMPLATE } from './shpTableIVData.js';
import { restyleByTemplate, TABLE_III_HOLDER_TEMPLATE, TABLE_IV_HOLDER_TEMPLATE } from './shpTableTemplate.js';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS   = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const esc  = s => String(s).replace(CTRL,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA = s => esc(s).replace(/"/g,'&quot;');

// ── Column helpers ────────────────────────────────────────────────────────────

function colName(i) {
  let s = '', n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
// A..AH (34 columns, indices 0-33)
const COL = Array.from({ length: 34 }, (_, i) => colName(i));

// ── Style IDs (indices into <cellXfs> in styles.xml) ─────────────────────────
const S = {
  DEFAULT:      0,
  HDR:          1,  // header rows 3-6: dark-blue fill, bold+white, wrap+center
  TITLE:        2,  // rows 1-2: dark-blue fill, bold+white, wrap
  SECTION:      3,  // section band: dark-red fill, bold+white
  CATEGORY:     4,  // (a)/(b)/… label rows + sub-rows: plain, thin border
  HOLDER:       5,  // holder data rows: plain, thin border
  HOLDER_PCT:   6,  // holder percentage cells: 0.00, thin border
  SUBTOTAL:     7,  // Sub-total rows: subtotalBlue fill, bold
  SUBTOTAL_PCT: 8,  // Sub-total percentage: 0.00, subtotalBlue, bold
  TOTAL:        9,  // Total row: totalLightBlue fill, bold
  TOTAL_PCT:   10,  // Total percentage: 0.00, totalLightBlue, bold
  GRAY:        11,  // AF/AG/AH empty gray columns
  ANNOT:       12,  // column annotation row (I, II, III…)
  BEIGE:       13,  // input columns E, F, U — beige fill, thin border
  NOTE:        14,  // single bottom note: bold
};

// ── Dashboard-sheet style IDs (indices into the base cellXfs in buildStyles) ──
const D = {
  LABEL:    15,  // bold, thin border, wrap+vcenter — labels in top block + particulars
  VAL_BLUE: 16,  // bold, light-blue fill (#C5D9F1), border, center — entity name value
  MAROON:   17,  // bold+white, maroon fill (#953735), border, wrap+center — "AS ON DATE"
  BOLD_CTR: 18,  // bold, border, center — Yes/No and date value
};

// ── Styles XML ────────────────────────────────────────────────────────────────

function buildStyles() {
  const numFmts =
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>';

  // 0=normal, 1=bold, 2=bold+white
  const fonts =
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>' +
    '</fonts>';

  // 0=none, 1=gray125, 2=headerBlue, 3=sectionRed,
  // 4=subtotalBlue, 5=totalLightBlue, 6=gray, 7=beige, 8=dashLightBlue
  const fills =
    '<fills count="9">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF254061"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF953735"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFB9CDE5"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC5D9F1"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>';

  const thin = '<left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>' +
    '<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/>';
  const borders =
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    `<border>${thin}</border>` +
    '</borders>';

  const xfsBase = '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>';

  const xf = (numFmtId, fontId, fillId, borderId, aln = '', unlock = false) => {
    const inner = (aln ? `<alignment ${aln}/>` : '') + (unlock ? '<protection locked="0"/>' : '');
    return `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      (numFmtId ? ' applyNumberFormat="1"' : '') +
      (fontId   ? ' applyFont="1"'         : '') +
      (fillId   ? ' applyFill="1"'         : '') +
      (borderId ? ' applyBorder="1"'       : '') +
      (aln      ? ' applyAlignment="1"'    : '') +
      (unlock   ? ' applyProtection="1"'   : '') +
      (inner    ? `>${inner}</xf>`         : '/>');
  };

  const wrapCtr = 'wrapText="1" horizontal="center" vertical="center"';
  const wrap    = 'wrapText="1" vertical="center"';
  const ctr     = 'horizontal="center" vertical="center"';

  const cellXfs =
    '<cellXfs count="19">' +
    xf(0,0,0,0,'',true)          + // 0  DEFAULT
    xf(0,2,2,1,wrapCtr,true)     + // 1  HDR  (bold+white on headerBlue)
    xf(0,2,2,1,wrap,true)        + // 2  TITLE (bold+white on headerBlue)
    xf(0,2,3,1,wrap,true)        + // 3  SECTION (bold+white on sectionRed)
    xf(0,0,0,1,'',true)          + // 4  CATEGORY
    xf(0,0,0,1,'',true)          + // 5  HOLDER
    xf(164,0,0,1,'',true)        + // 6  HOLDER_PCT
    xf(0,1,4,1,'',true)          + // 7  SUBTOTAL (bold on subtotalBlue)
    xf(164,1,4,1,'',true)        + // 8  SUBTOTAL_PCT
    xf(0,1,5,1,'',true)          + // 9  TOTAL (bold on totalLightBlue)
    xf(164,1,5,1,'',true)        + // 10 TOTAL_PCT
    xf(0,0,6,1)                  + // 11 GRAY — stays locked (default)
    xf(0,0,0,1,ctr,true)         + // 12 ANNOT
    xf(0,0,7,1,'',true)          + // 13 BEIGE (input columns E/F/U)
    xf(0,1,0,0,'',true)          + // 14 NOTE (bold, no fill)
    xf(0,1,0,1,wrap,true)        + // 15 DASH_LABEL   (bold, border, wrap+vcenter)
    xf(0,1,8,1,ctr,true)         + // 16 DASH_VAL_BLUE (bold, lightBlue #C5D9F1, border, center)
    xf(0,2,3,1,wrapCtr,true)     + // 17 DASH_MAROON  (bold+white, maroon fill, border, wrap+center)
    xf(0,1,0,1,ctr,true)         + // 18 DASH_BOLD_CTR (bold, border, center)
    '</cellXfs>';

  const cellStyles = '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>';

  return XML_HEAD +
    `<styleSheet xmlns="${NS}">` +
    numFmts + fonts + fills + borders + xfsBase + cellXfs + cellStyles +
    '</styleSheet>';
}

// ── Cell XML helpers ──────────────────────────────────────────────────────────

function numCell(ref, v, sid) {
  const n = (v === null || v === undefined || !Number.isFinite(Number(v))) ? 0 : Number(v);
  return `<c r="${ref}" s="${sid}"><v>${n}</v></c>`;
}

function strCell(ref, v, sid) {
  const s = v == null ? '' : String(v);
  if (!s) return `<c r="${ref}" s="${sid}"/>`;
  const preserve = /^\s|\s$|[\r\n]/.test(s) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" s="${sid}" t="inlineStr"><is><t${preserve}>${esc(s)}</t></is></c>`;
}

function emptyCell(ref, sid) {
  return `<c r="${ref}" s="${sid}"/>`;
}

function blankStrCell(ref, sid) {
  return `<c r="${ref}" s="${sid}" t="inlineStr"><is><t/></is></c>`;
}

// ── Table III public-shareholder category definitions ─────────────────────────
// SHP Public Code → category (or sub-row).  ONE place to change mappings.
// B4g holders go to (g); B4g holders with nominal > 2 lakhs are re-keyed to
// '__B4H__' by shpExport.js before the builder is called.
const SHP_PUBLIC_SECTIONS = [
  {
    sectionLabel: '( 1 )',
    sectionName:  'Institutions (Domestic)',
    subTotalLabel: 'Sub Total (B)(1)',
    categories: [
      { code: 'B1a', rowLabel: '(a)', name: 'Mutual Funds' },
      { code: 'B1b', rowLabel: '(b)', name: 'Venture Capital Funds' },
      { code: 'B1c', rowLabel: '(c)', name: 'Alternate Investment Funds' },
      { code: 'B1d', rowLabel: '(d)', name: 'Banks' },
      { code: 'B1e', rowLabel: '(e)', name: 'Insurance Companies' },
      { code: 'B1f', rowLabel: '(f)', name: 'Provident Funds/ Pension Funds' },
      { code: 'B1g', rowLabel: '(g)', name: 'Asset reconstruction companies' },
      { code: 'B1h', rowLabel: '(h)', name: 'Sovereign Wealth Funds' },
      { code: 'B1i', rowLabel: '(i)', name: 'NBFCs registered with RBI' },
      { code: 'B1j', rowLabel: '(j)', name: 'Other Financial Institutions' },
      {
        rowLabel: '(k)', name: 'Any Other (specify)',
        subRows: [{ code: 'B1k', name: 'Other' }],
      },
    ],
  },
  {
    sectionLabel: '( 2 )',
    sectionName:  'Institutions (Foreign)',
    subTotalLabel: 'Sub Total (B)(2)',
    categories: [
      { code: 'B2a', rowLabel: '(a)', name: 'Foreign Direct Investment' },
      { code: 'B2b', rowLabel: '(b)', name: 'Foreign Venture Capital Investors' },
      { code: 'B2c', rowLabel: '(c)', name: 'Sovereign Wealth Funds' },
      { code: 'B2d', rowLabel: '(d)', name: 'Foreign Portfolio Investors Category I' },
      { code: 'B2e', rowLabel: '(e)', name: 'Foreign Portfolio Investors Category II' },
      { code: 'B2f', rowLabel: '(f)', name: 'Overseas Depositories (holding DRs) (balancing figure)' },
      {
        rowLabel: '(g)', name: 'Any Other (specify)',
        subRows: [{ code: 'B2g', name: 'Other' }],
      },
    ],
  },
  {
    sectionLabel: '( 3 )',
    sectionName:  'Central Government/ State Government(s)/ President of India',
    subTotalLabel: 'Sub Total (B)(3)',
    categories: [
      { code: 'B3a', rowLabel: '(a)', name: 'Central Government / President of India' },
      { code: 'B3b', rowLabel: '(b)', name: 'State Government / Governor' },
      { code: 'B3c', rowLabel: '(c)', name: 'Shareholding by Companies or Bodies Corporate where Central / State Government is a promoter' },
    ],
  },
  {
    sectionLabel: '( 4 )',
    sectionName:  'Non-institutions',
    subTotalLabel: 'Sub Total (B)(4)',
    categories: [
      { code: 'B4a', rowLabel: '(a)', name: 'Associate companies / Subsidiaries' },
      { code: 'B4b', rowLabel: '(b)', name: 'Directors and their relatives (excluding independent directors and nominee directors)' },
      { code: 'B4c', rowLabel: '(c)', name: 'Key Managerial Personnel' },
      { code: 'B4d', rowLabel: '(d)', name: "Relatives of promoters (other than 'immediate relatives' of promoters disclosed under 'Promoter and Promoter Group' category)" },
      { code: 'B4e', rowLabel: '(e)', name: "Trusts where any person belonging to 'Promoter and Promoter Group' category is 'trustee', 'beneficiary', or 'author of the trust'" },
      { code: 'B4f', rowLabel: '(f)', name: 'Investor Education and Protection Fund (IEPF)' },
      { code: 'B4g',    rowLabel: '(g)', name: 'Resident Individuals holding nominal share capital up to Rs. 2 lakhs' },
      { code: '__B4H__', rowLabel: '(h)', name: 'Resident Individuals holding nominal share capital in excess of Rs. 2 lakhs' },
      { code: 'B4i', rowLabel: '(i)', name: 'Non Resident Indians (NRIs)' },
      { code: 'B4j', rowLabel: '(j)', name: 'Foreign Nationals' },
      { code: 'B4k', rowLabel: '(k)', name: 'Foreign Companies' },
      { code: 'B4l', rowLabel: '(l)', name: 'Bodies Corporate' },
      {
        rowLabel: '(m)', name: 'Any Other (specify)',
        subRows: [
          { code: 'B4m1', name: 'HUF' },
          { code: 'B4m2', name: 'Trusts' },
          { code: 'B4m_FIRM', name: 'Firm' },
          { code: 'B4m3', name: 'Unclaimed or Suspense or Escrow Account' },
          { code: 'B4m4', name: 'Clearing Members' },
          { code: 'B4m5', name: 'Others' },
        ],
      },
    ],
  },
];

const T3_TOTAL_LABEL = 'Total Public Shareholding  (B) = (B)(1)+(B)(2)+(B)(3)+(B)(4)';

// PCT columns for Table III (0-based index in 30-element data array)
// I=8, M=12, S=18, U=20
const T3_PCT_COLS = new Set([8, 12, 18, 20]);
// Grey columns for Table III: AE=30, AF=31, AG=32
const T3_GRAY_COLS = [30, 31, 32];

// ── Table III business logic ───────────────────────────────────────────────────

function t3HolderArr(h, totalShares, convTotal) {
  const e  = h.f  || 0;
  const xa = h.xa || 0;
  const xb = h.xb || 0;
  const xc = h.xc || 0;
  const xX = xa + xb + xc;              // X = XA+XB+XC
  const i  = pct(e, totalShares);
  const xi = e + xX;                    // XI = VII + X
  const xii = pct(xi, totalShares + convTotal); // XII = XI / (total shares + total X)
  const t  = h.u  || 0;
  const u  = e > 0 ? pct(t, e) : 0;
  const ad = h.ae || 0;
  // 0:A  1:B      2:C    3:D  4:E  5:F  6:G  7:H  8:I   9:J  10:K  11:L  12:M  13:N  14:O  15:P  16:Q  17:R  18:S  19:T 20:U  21-28:null(V..AC)  29:AD
  return [null, h.name, h.pan, '', e, 0, 0, e, i, e, 0, e, i, xa, xb, xc, xX, xi, xii, t, u, null, null, null, null, null, null, null, null, ad];
}

function t3AggArr(holders, totalShares, label, colA, convTotal) {
  let E = 0, T = 0, AD = 0, XA = 0, XB = 0, XC = 0;
  for (const h of holders) {
    E += h.f || 0; T += h.u || 0; AD += h.ae || 0;
    XA += h.xa || 0; XB += h.xb || 0; XC += h.xc || 0;
  }
  const XX  = XA + XB + XC;
  const I   = pct(E, totalShares);
  const XI  = E + XX;
  const XII = pct(XI, totalShares + convTotal);
  const U   = E > 0 ? pct(T, E) : 0;
  const cnt = holders.filter(h => (h.f || 0) > 0).length;
  return [colA, label, '-', cnt, E, 0, 0, E, I, E, 0, E, I, XA, XB, XC, XX, XI, XII, T, U, null, null, null, null, null, null, null, null, AD];
}

// ── Table III row renderer ────────────────────────────────────────────────────

function renderT3Row(rn, arr, textSid, pctSid, graySid) {
  let rx = `<row r="${rn}">`;
  for (let c = 0; c < 30; c++) {
    const ref = `${COL[c]}${rn}`;
    const v   = arr[c];
    if (c <= 2) {
      rx += v != null ? strCell(ref, v, textSid) : emptyCell(ref, textSid);
    } else if (v === null) {
      rx += emptyCell(ref, textSid);
    } else if (v === '') {
      rx += blankStrCell(ref, textSid);
    } else if (T3_PCT_COLS.has(c)) {
      rx += numCell(ref, v, pctSid);
    } else {
      rx += numCell(ref, v, textSid);
    }
  }
  for (const gc of T3_GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, graySid);
  rx += '</row>';
  return rx;
}

// ── Table III sheet XML builder ───────────────────────────────────────────────

function buildTableIIIXml(holdersByPublicCode, totalShares, convTotal) {
  const rows   = [];
  const merges = [];
  let rn = 0;

  // Column widths for 33 cols A..AG (Table II widths minus the entity-type col at index 2)
  const widths = [
    9.14, 38.14, 20.43, 13.43, 14.43, 13.14, 13.14, 14, 12,
    16.43, 16.43, 11.86, 10, 14.43, 14.43, 14.43, 17.71, 15.29, 17.71,
    18.43, 9.14, 12.14, 12.14, 12.14, 12.14, 12.14, 12.14, 12.14, 18.43,
    18.43, 18.43, 18.43,
  ];
  const colsXml = '<cols>' +
    widths.map((w, i) => `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('') +
    '</cols>';

  // ── Row 1: Title ─────────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn-1, 0, rn-1, 32));
  {
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Table III - Statement showing shareholding pattern of the Public shareholder', S.TITLE);
    for (let c = 1; c <= 32; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Row 2: Spacer ─────────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn-1, 0, rn-1, 29));
  {
    let rx = `<row r="${rn}" ht="6" customHeight="1">`;
    for (let c = 0; c < 30; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    for (const gc of T3_GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, S.GRAY);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Rows 3-5: Multi-level header ──────────────────────────────────────────────
  rn++; // row 3
  const r3 = rn - 1;
  // Single-col spans rows 3-5 (no entity-type col vs Table II)
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16, 17, 18, 29]) {
    merges.push(merge(r3, c, r3+2, c));
  }
  // J3:M3, T3:U3, V3:W3, X3:Y3, Z3:AA3, AB3:AC3
  merges.push(merge(r3, 9, r3, 12));
  [[19,20],[21,22],[23,24],[25,26],[27,28]].forEach(([a,b]) => merges.push(merge(r3,a,r3,b)));
  // AE3:AG3
  merges.push(merge(r3, 30, r3, 32));

  {
    const cells = {
      0:  ' (B) ',
      1:  'Category & Name of shareholders',
      2:  'PAN',
      3:  'No. of Shareholders',
      4:  'No. of Fully paid up equity shares held ',
      5:  'Partly paid-up equity shares held',
      6:  'No. of shares underlying Depository Receipts',
      7:  'Total nos. shares held',
      8:  'Shareholding as a % of total no. of shares (calculated as per SCRR, 1957)',
      9:  'Number of Voting Rights held in each class of securities',
      13: 'No. Of Shares Underlying Outstanding convertible securities\r\n',
      14: 'No. of Shares Underlying Outstanding Warrants \r\n',
      15: 'No. Of Outstanding ESOP Granted',
      16: 'No. of Shares Underlying Outstanding convertible securities, No. of Warrants and ESOP etc.\r\n',
      17: 'Total No. of shares on fully diluted basis (including warrants, ESOP, Convertible Securities etc.)',
      18: 'Shareholding , as a % assuming full conversion of convertible securities ( as a percentage of diluted share capital)',
      19: 'Number of Locked in shares ',
      21: 'Number of Shares pledged',
      23: 'Non-Disposal Undertaking',
      25: 'Other encumbrances, if any',
      27: 'Total Number of Shares encumbered ',
      29: 'Number of equity shares held in dematerialized form',
      30: 'Sub-categorization of shares\r\n\r\n(XIX)',
    };
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let c = 0; c <= 32; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Row 4
  rn++;
  const r4 = rn - 1;
  merges.push(merge(r4, 9, r4, 11)); // J4:L4
  for (const c of [12, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]) merges.push(merge(r4, c, r4+1, c));
  merges.push(merge(r4, 30, r4, 32)); // AE4:AG4
  {
    const cells = {
      9:  'No. of Voting Rights',
      12: 'Total as a % of Total Voting Rights ',
      20: 'As a % of total shares held (b)',
      21: 'No. (a)', 22: 'As a % of total shares held (b)',
      23: 'No. (a)', 24: 'As a % of total shares held (b)',
      25: 'No. (a)', 26: 'As a % of total shares held (b)',
      27: 'No. (a)', 28: 'As a % of total shares held (b)',
      30: 'Shareholding (No. of shares) under',
    };
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let c = 0; c <= 32; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Row 5
  rn++;
  {
    const cells = {
      9: 'Class : e.g. X ', 10: 'Class : e.g. Y', 11: 'Total',
      30: 'Sub-category (i)', 31: 'Sub-category (ii)', 32: 'Sub-category (iii)',
    };
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let c = 0; c <= 32; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // ── Row 6: Annotations ────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn-1, 9, rn-1, 12)); // J6:M6
  {
    const cells = {
      1: '(I)', 2: '(II)', 3: '(III)', 4: '(IV)', 5: '(V)', 6: '(VI)',
      7: '(VII) = (IV)+(V)+ (VI)', 8: '(VIII) As a % of (A+B+C2)',
      9: '(IX)',
      13: '(XA)', 14: '(XB)', 15: '(XC)', 16: '(X) = (XA+XB+XC)',
      17: '(XI)=(VII+X)', 18: '(XII)= (VII)+(X)\r\nAs a % of (A+B+C2)',
      19: '(XIII) ', 21: '(XIV)', 23: '(XV)', 25: '(XVI)',
      27: '(XVII) = (XIV+XV+XVI)', 29: '(XVIII)',
    };
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    for (let c = 0; c < 30; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.ANNOT) : emptyCell(`${COL[c]}${rn}`, S.ANNOT);
    }
    for (const gc of T3_GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, S.GRAY);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Data rows ─────────────────────────────────────────────────────────────────
  const allT3Holders = [];

  for (const section of SHP_PUBLIC_SECTIONS) {
    rn++;
    merges.push(merge(rn-1, 1, rn-1, 32));
    {
      let rx = `<row r="${rn}" ht="18" customHeight="1">`;
      rx += strCell(`A${rn}`, section.sectionLabel, S.SECTION);
      rx += strCell(`B${rn}`, section.sectionName, S.SECTION);
      for (let c = 2; c <= 32; c++) rx += emptyCell(`${COL[c]}${rn}`, S.SECTION);
      rx += '</row>';
      rows.push(rx);
    }

    const sectionHolders = [];

    for (const cat of section.categories) {
      if (cat.subRows) {
        const subRowData = cat.subRows.map(sr => ({
          sr,
          holders: sr.code
            ? (holdersByPublicCode.get(sr.code) || []).slice().sort((a,b) => (b.f||0) - (a.f||0))
            : [],
        }));
        const allSubHolders = subRowData.flatMap(d => d.holders);

        rn++;
        rows.push(renderT3Row(rn, t3AggArr(allSubHolders, totalShares, cat.name, cat.rowLabel, convTotal), S.CATEGORY, S.HOLDER_PCT, S.GRAY));

        for (const { sr, holders } of subRowData) {
          rn++;
          rows.push(renderT3Row(rn, t3AggArr(holders, totalShares, sr.name, null, convTotal), S.CATEGORY, S.HOLDER_PCT, S.GRAY));
          for (const h of holders) {
            if (h.f * 100 >= totalShares) {
              rn++;
              rows.push(renderT3Row(rn, t3HolderArr(h, totalShares, convTotal), S.HOLDER, S.HOLDER_PCT, S.GRAY));
            }
            sectionHolders.push(h);
            allT3Holders.push(h);
          }
        }
      } else {
        const catHolders = (holdersByPublicCode.get(cat.code) || [])
          .slice().sort((a,b) => (b.f||0) - (a.f||0));

        rn++;
        rows.push(renderT3Row(rn, t3AggArr(catHolders, totalShares, cat.name, cat.rowLabel, convTotal), S.CATEGORY, S.HOLDER_PCT, S.GRAY));

        for (const h of catHolders) {
          if (h.f * 100 >= totalShares) {
            rn++;
            rows.push(renderT3Row(rn, t3HolderArr(h, totalShares, convTotal), S.HOLDER, S.HOLDER_PCT, S.GRAY));
          }
          sectionHolders.push(h);
          allT3Holders.push(h);
        }
      }
    }

    rn++;
    rows.push(renderT3Row(rn, t3AggArr(sectionHolders, totalShares, section.subTotalLabel, null, convTotal), S.SUBTOTAL, S.SUBTOTAL_PCT, S.GRAY));
  }

  // Grand total
  rn++;
  rows.push(renderT3Row(rn, t3AggArr(allT3Holders, totalShares, T3_TOTAL_LABEL, null, convTotal), S.TOTAL, S.TOTAL_PCT, S.GRAY));

  // Notes
  rn++;
  rows.push(`<row r="${rn}"><c r="A${rn}" s="${S.DEFAULT}"/></row>`);
  for (const note of [
    'Details of the shareholders acting as persons in Concert including their Shareholding ( No. and %)',
    'Details of Shares which remain unclaimed for Public',
    'The above format needs to be disclosed along with the names of the shareholders holding 1% or more than 1% of shares of the listed entity. Column no. (XIII) is not applicable in the above format.',
    'W.r.t. the information pertaining to Depository Receipts, the same may be disclosed in the respective columns to the extent information available and the balance to be disclosed as held by custodian',
  ]) {
    rn++;
    rows.push(`<row r="${rn}">${strCell(`A${rn}`, note, S.NOTE)}</row>`);
  }

  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r+1}:${COL[m.e.c]}${m.e.r+1}"/>`).join('') +
      '</mergeCells>'
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    '<sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" formatRows="0"/>' +
    mergeCellsXml +
    '</worksheet>';
}

// ── Table IV Non-Promoter Non-Public category definitions ────────────────────
// SHP Public Code starting with 'C' routes here.
// C1: column I (shareholding %) and S (fully-diluted %) are N/A (grey).
// C2: I and S are computed normally.
const SHP_NONPUBLIC_SECTIONS = [
  { code: 'C1', rowLabel: '( 1 )', name: 'Custodian/DR Holder',
    greyIS: true,  greyAeAg: true },
  { code: 'C2', rowLabel: '( 2 )', name: 'Employees Benefit Trust (Under SEBI (Share Based Employee Benefit Regulation 2014)',
    greyIS: false, greyAeAg: false },
];

// Valid C codes — exported so shpExport.js can route rows without duplicating the list.
export const VALID_C_CODES = new Set(SHP_NONPUBLIC_SECTIONS.map(s => s.code));

const T4_TOTAL_LABEL = 'Total Non Promoter Non Public Shareholding (C)= (C)(1)+(C)(2)';

// V..AC (indices 21-28) are grey/N.A. in all Table IV data rows.
const T4_GREY_VAC = new Set([21, 22, 23, 24, 25, 26, 27, 28]);

// ── Table IV row renderer ─────────────────────────────────────────────────────
// Same 30-element array format as T3; V-AC always grey; I/S optionally grey.

function renderT4Row(rn, arr, textSid, pctSid, graySid, greyIS, greyAeAg) {
  let rx = `<row r="${rn}">`;
  for (let c = 0; c < 30; c++) {
    const ref = `${COL[c]}${rn}`;
    const v   = arr[c];
    if (T4_GREY_VAC.has(c)) {
      rx += emptyCell(ref, graySid);
    } else if (c <= 2) {
      rx += v != null ? strCell(ref, v, textSid) : emptyCell(ref, textSid);
    } else if (v === null) {
      rx += emptyCell(ref, textSid);
    } else if (v === '') {
      rx += blankStrCell(ref, textSid);
    } else if (c === 8 && greyIS) {
      rx += emptyCell(ref, graySid);
    } else if (T3_PCT_COLS.has(c)) {
      rx += numCell(ref, v, pctSid);
    } else {
      rx += numCell(ref, v, textSid);
    }
  }
  if (greyAeAg) {
    for (const gc of T3_GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, graySid);
  } else {
    for (const gc of T3_GRAY_COLS) rx += numCell(`${COL[gc]}${rn}`, 0, textSid);
  }
  rx += '</row>';
  return rx;
}

// ── Table IV sheet XML builder ────────────────────────────────────────────────

function buildTableIVXml(holdersByNonPublicCode, totalShares, convTotal) {
  const rows   = [];
  const merges = [];
  let rn = 0;

  // Column widths for 33 cols A..AG (from reference Table IV sheet8.xml)
  const widths = [
    8.43, 34.71, 17.14, 16.43, 16.43, 11.71, 13.29, 16.43, 13.14,
    13.14, 13.14, 14.71, 9.86, 14.86, 15.00, 14.43, 15.43, 15.43, 17.71,
    16.43, 9.43, 11.43, 9.43, 11.43, 9.43, 11.43, 9.43, 11.43, 9.43,
    16.43, 12.43, 12.43, 12.43,
  ];
  const colsXml = '<cols>' +
    widths.map((w, i) => `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('') +
    '</cols>';

  // ── Row 1: Title ──────────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn-1, 0, rn-1, 32));
  {
    let rx = `<row r="${rn}" ht="25.5" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Table IV - Statement showing shareholding pattern of the Non Promoter- Non Public shareholder', S.TITLE);
    for (let c = 1; c <= 32; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Row 2: Spacer ─────────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn-1, 0, rn-1, 32));
  {
    let rx = `<row r="${rn}" ht="8.25" customHeight="1">`;
    for (let c = 0; c <= 32; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Rows 3-5: Multi-level header ──────────────────────────────────────────────
  rn++; // row 3
  const r3 = rn - 1;
  // Single columns spanning rows 3-5
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16, 17, 18, 29]) {
    merges.push(merge(r3, c, r3+2, c));
  }
  merges.push(merge(r3, 9, r3, 12)); // J3:M3
  [[19,20],[21,22],[23,24],[25,26],[27,28]].forEach(([a,b]) => merges.push(merge(r3,a,r3,b)));
  merges.push(merge(r3, 30, r3, 32)); // AE3:AG3
  {
    const cells = {
      0:  ' (C)',
      1:  'Category & Name of shareholders',
      2:  'PAN',
      3:  'No. of Shareholders',
      4:  'No. of Fully paid up equity shares held ',
      5:  'Partly paid-up equity shares held',
      6:  'No. of shares underlying Depository Receipts',
      7:  'Total nos. shares held',
      8:  'Shareholding as a % of total no. of shares (calculated as per SCRR, 1957)',
      9:  'Number of Voting Rights held in each class of securities',
      13: 'No. Of Shares Underlying Outstanding convertible securities',
      14: 'No. of Shares Underlying Outstanding Warrants ',
      15: 'No. Of Outstanding ESOP Granted',
      16: 'No. of Shares Underlying Outstanding convertible securities, No. of Warrants and ESOP etc.',
      17: 'Total No. of shares on fully diluted basis (including warrants, ESOP, Convertible Securities etc.)',
      18: 'Shareholding , as a % assuming full conversion of convertible securities ( as a percentage of diluted share capital)',
      19: 'Number of Locked in shares ',
      21: 'Number of Shares pledged',
      23: 'Non-Disposal Undertaking',
      25: 'Other encumbrances, if any',
      27: 'Total Number of Shares encumbered ',
      29: 'Number of equity shares held in dematerialized form',
      30: 'Sub-categorization of shares\n\n(XIX)',
    };
    let rx = `<row r="${rn}" ht="52.5" customHeight="1">`;
    for (let c = 0; c <= 32; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Row 4
  rn++;
  const r4 = rn - 1;
  merges.push(merge(r4, 9, r4, 11)); // J4:L4
  for (const c of [12, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]) merges.push(merge(r4, c, r4+1, c));
  merges.push(merge(r4, 30, r4, 32)); // AE4:AG4
  {
    const cells = {
      9:  'No. of Voting Rights',
      12: 'Total as a % of Total Voting Rights ',
      19: 'No. (a)', 20: 'As a % of total shares held (b)',
      21: 'No. (a)', 22: 'As a % of total shares held (b)',
      23: 'No. (a)', 24: 'As a % of total shares held (b)',
      25: 'No. (a)', 26: 'As a % of total shares held (b)',
      27: 'No. (a)', 28: 'As a % of total shares held (b)',
      30: 'Shareholding (No. of shares) under',
    };
    let rx = `<row r="${rn}" ht="46.5" customHeight="1">`;
    for (let c = 0; c <= 32; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Row 5 — AE/AF/AG sub-headers span down into row 6
  rn++;
  const r5 = rn - 1;
  merges.push(merge(r5, 30, r5+1, 30)); // AE5:AE6
  merges.push(merge(r5, 31, r5+1, 31)); // AF5:AF6
  merges.push(merge(r5, 32, r5+1, 32)); // AG5:AG6
  {
    const cells = {
      9: 'Class : e.g. X ', 10: 'Class : e.g. Y', 11: 'Total',
      30: 'Sub-category (i)', 31: 'Sub-category (ii)', 32: 'Sub-category (iii)',
    };
    let rx = `<row r="${rn}" ht="44.25" customHeight="1">`;
    for (let c = 0; c <= 32; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // ── Row 6: Annotations ────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn-1, 9,  rn-1, 12)); // J6:M6
  merges.push(merge(rn-1, 19, rn-1, 20)); // T6:U6
  merges.push(merge(rn-1, 21, rn-1, 22)); // V6:W6
  merges.push(merge(rn-1, 23, rn-1, 24)); // X6:Y6
  merges.push(merge(rn-1, 25, rn-1, 26)); // Z6:AA6
  merges.push(merge(rn-1, 27, rn-1, 28)); // AB6:AC6
  {
    const cells = {
      1: '(I)', 2: '(II)', 3: '(III)', 4: '(IV)', 5: '(V)', 6: '(VI)',
      7: '(VII) = (IV)+(V)+ (VI)', 8: '(VIII) As a % of (A+B+C2)',
      9: '(IX)',
      13: '(XA)', 14: '(XB)', 15: '(XC)', 16: '(X) = (XA+XB+XC)',
      17: '(XI) = (VII)+(X)', 18: '(XII)= (VII)+(X) As a % of (A+B+C2)',
      19: '(XIII)',
      21: '(XIV)', 23: '(XV)', 25: '(XVI)', 27: '(XVII) = (XIV+XV+XVI)',
      29: '(XVIII)',
    };
    let rx = `<row r="${rn}" ht="42.75" customHeight="1">`;
    for (let c = 0; c < 30; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.ANNOT) : emptyCell(`${COL[c]}${rn}`, S.ANNOT);
    }
    for (const gc of T3_GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, S.GRAY);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Data rows ─────────────────────────────────────────────────────────────────
  const allT4Holders = [];

  for (const cat of SHP_NONPUBLIC_SECTIONS) {
    const catHolders = (holdersByNonPublicCode.get(cat.code) || [])
      .slice().sort((a,b) => (b.f||0) - (a.f||0));

    rn++;
    rows.push(renderT4Row(rn,
      t3AggArr(catHolders, totalShares, cat.name, cat.rowLabel, convTotal),
      S.CATEGORY, S.HOLDER_PCT, S.GRAY, cat.greyIS, cat.greyAeAg));

    for (const h of catHolders) {
      rn++;
      rows.push(renderT4Row(rn, t3HolderArr(h, totalShares, convTotal),
        S.HOLDER, S.HOLDER_PCT, S.GRAY, cat.greyIS, cat.greyAeAg));
      allT4Holders.push(h);
    }
  }

  // Grand total — AE-AG grey (same as reference total row styles)
  rn++;
  rows.push(renderT4Row(rn,
    t3AggArr(allT4Holders, totalShares, T4_TOTAL_LABEL, null, convTotal),
    S.TOTAL, S.TOTAL_PCT, S.GRAY, false, true));

  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r+1}:${COL[m.e.c]}${m.e.r+1}"/>`).join('') +
      '</mergeCells>'
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    mergeCellsXml +
    '</worksheet>';
}

// ── Table II category definitions ─────────────────────────────────────────────
// subRows: if present, the category row aggregates all sub-rows;
//          each subRow with a `code` gets its holders; the rest show 0.
// Assumption documented: A1d -> Indian (d) sub-row "Bodies Corporate";
//                        A2e -> Foreign (e) sub-row "Other".
const SHP_SECTIONS = [
  {
    sectionLabel: '( 1 )',
    sectionName:  'Indian',
    subTotalLabel: 'Sub Total (A)(1)',
    categories: [
      { code: 'A1a', rowLabel: '(a)', name: 'Individuals/Hindu undivided Family' },
      { code: 'A1b', rowLabel: '(b)', name: 'Central Government/ State Government(s)' },
      { code: 'A1c', rowLabel: '(c)', name: 'Financial Institutions/ Banks' },
      {
        rowLabel: '(d)', name: 'Any Other (specify)',
        subRows: [
          { name: "Director or Director's Relatives" },
          { code: 'A1d', name: 'Bodies Corporate' },
          { code: 'A1d_TRUST', name: 'Trusts' },
          { code: 'A1d_FIRM', name: 'Partnership Firms' },
          { name: 'Person Acting in Concert' },
          { name: 'Other' },
        ],
      },
    ],
  },
  {
    sectionLabel: '( 2 )',
    sectionName:  'Foreign',
    subTotalLabel: 'Sub Total (A)(2)',
    categories: [
      { code: 'A2a', rowLabel: '(a)', name: 'Individuals (Non-Resident Individuals/ Foreign Individuals)' },
      { code: 'A2b', rowLabel: '(b)', name: 'Government' },
      { code: 'A2c', rowLabel: '(c)', name: 'Institutions' },
      { code: 'A2d', rowLabel: '(d)', name: 'Foreign Portfolio Investor' },
      {
        rowLabel: '(e)', name: 'Any Other (specify)',
        subRows: [
          { name: 'Bodies Corporate' },
          { name: 'Clearing Member' },
          { name: 'Employee Welfare Fund' },
          { code: 'A2e_FIRM', name: 'Firms' },
          { code: 'A2e', name: 'Other' },
          { name: 'Overseas Corporate Bodies' },
          { name: 'Private Equity Fund' },
          { name: 'Societies' },
          { code: 'A2e_TRUST', name: 'Trust' },
          { name: 'Venture Capital Fund' },
        ],
      },
    ],
  },
];

const TOTAL_LABEL = 'Total Shareholding of Promoter and Promoter Group (A)= (A)(1)+(A)(2)';

// Percentage column indices (0-based in the 31-element data array):
// J=9, N=13, T=19, V=21, X=23, Z=25, AB=27, AD=29
const PCT_COLS = new Set([9, 13, 19, 21, 23, 25, 27, 29]);
// Input columns with beige tint: E=4, F=5, U=20
const BEIGE_COLS = new Set([4, 5, 20]);
// Gray columns (AF=31, AG=32, AH=33)
const GRAY_COLS = [31, 32, 33];

// ── Business logic helpers ────────────────────────────────────────────────────

function pct(num, denom) {
  if (!denom) return 0;
  return num / denom * 100;
}

// Returns a 31-element array (indices 0-30 = columns A-AE) for a holder row.
function holderArr(h, totalShares, convTotal) {
  const f  = h.f  || 0;
  const xa = h.xa || 0;
  const xb = h.xb || 0;
  const xc = h.xc || 0;
  const xX = xa + xb + xc;             // X = XA+XB+XC
  const i  = f;                         // G=H=0, so I=F
  const j  = pct(i, totalShares);
  const m  = f;                         // K=F, L=0, M=K
  const n  = pct(m, totalShares);
  const s  = i + xX;                    // XI = VII + X
  const t  = pct(s, totalShares + convTotal); // XII = XI / (total shares + total X)
  const u  = h.u  || 0;
  const v  = pct(u, i);
  const w  = h.w  || 0;
  const wx = pct(w, i);
  const y  = h.y  || 0;
  const z  = pct(y, i);
  const ac = w + y;                     // AA=AB=0
  const ad = pct(ac, i);
  const ae = h.ae || 0;
  //      A       B          C             D       E  F  G  H  I  J  K  L  M   N   O   P   Q    R  S  T  U  V  W   WX Y  Z  AA AB  AC  AD  AE
  return [null, h.name, h.entityType, h.pan, null, f, 0, 0, i, j, f, 0, m, n, xa, xb, xc, xX, s, t, u, v, w, wx, y, z, 0, 0, ac, ad, ae];
}

// Returns a 31-element array for a category, sub-row, subtotal or total row.
function aggregateArr(holders, totalShares, label, colA, convTotal) {
  let F = 0, U = 0, W = 0, Y = 0, AE = 0, XA = 0, XB = 0, XC = 0;
  for (const h of holders) {
    F += h.f || 0; U += h.u || 0; W += h.w || 0; Y += h.y || 0; AE += h.ae || 0;
    XA += h.xa || 0; XB += h.xb || 0; XC += h.xc || 0;
  }
  const XX = XA + XB + XC;
  const I = F, J = pct(I, totalShares);
  const M = F, N = pct(M, totalShares);
  const SV = I + XX;                    // XI = VII + X
  const T  = pct(SV, totalShares + convTotal); // XII = XI / (total shares + total X)
  const V = pct(U, I), WX = pct(W, I), Z = pct(Y, I);
  const AC = W + Y, AD = pct(AC, I);
  const E = holders.filter(h => (h.f || 0) > 0).length;
  //        A      B      C    D    E  F  G  H  I  J  K  L  M   N    O    P    Q    R   S  T  U  V  W   WX Y  Z   AA AB  AC   AD  AE
  return [colA, label, '-', '-', E, F, 0, 0, I, J, F, 0, M, N, XA, XB, XC, XX, SV, T, U, V, W, WX, Y, Z, 0, 0, AC, AD, AE];
}

// ── Row renderer ──────────────────────────────────────────────────────────────

// beigeSid: if set, cols E(4)/F(5)/U(20) use this style instead of textSid
function renderRow(rn, arr, textSid, pctSid, graySid, beigeSid = null) {
  let rx = `<row r="${rn}">`;
  for (let c = 0; c < 31; c++) {
    const ref = `${COL[c]}${rn}`;
    const v   = arr[c];
    if (c <= 3) {
      rx += v != null ? strCell(ref, v, textSid) : emptyCell(ref, textSid);
    } else if (PCT_COLS.has(c)) {
      rx += numCell(ref, v, pctSid);
    } else if (beigeSid !== null && BEIGE_COLS.has(c)) {
      rx += v === null ? emptyCell(ref, beigeSid) : numCell(ref, v, beigeSid);
    } else {
      rx += numCell(ref, v, textSid);
    }
  }
  for (const gc of GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, graySid);
  rx += '</row>';
  return rx;
}

// ── Merge helper ──────────────────────────────────────────────────────────────

function merge(r1, c1, r2, c2) { return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }; }


// ── Dashboard (Declaration) sheet ────────────────────────────────────────────

function fmtDashDate(isoStr) {
  if (!isoStr || isoStr.length < 10) return isoStr || '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${isoStr.slice(8,10)}-${MONTHS[parseInt(isoStr.slice(5,7),10)-1]}-${isoStr.slice(0,4)}`;
}

function toTitleCase(s) {
  return String(s || '').replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function buildDashboardXml(entityInfo, t1Rows, tableVRows) {
  const { issuerName = '', scripCode = '', symbol = '', classOfSecurity = 'Equity Shares', dateStr = '' } = entityInfo || {};
  const dateFmt = fmtDashDate(dateStr);
  const scV  = scripCode || '-';
  const symV = symbol    || '-';
  const cls  = toTitleCase(classOfSecurity || 'Equity Shares');
  const scripInfo = `( ${scV} / ${symV} / ${cls} )`;

  const getV = (row, col) => (row ? Number(row[col]) || 0 : 0);
  const hasSBO = Array.isArray(tableVRows) && tableVRows.some(r => {
    const name = String(r.beneficialOwnerName ?? '').toUpperCase().trim();
    if (!name || name === 'NIL') return false;
    const shares = Number(String(r.numberOfShares ?? '').replace(/,/g, ''));
    const regName = String(r.registeredOwnerName ?? '').toUpperCase().trim();
    return (Number.isFinite(shares) && shares > 0) || (regName && regName !== 'NIL');
  });

  // D=col3, E:G=col4-6(merged), H=col7, I=col8, J=col9, K=col10
  const DECL = [
    { txt: 'Whether the Listed Entity has issued any partly paid up shares?',                                            col: 'F', promoterOnly: false },
    { txt: 'Whether the Listed Entity has issued any Convertible Securities ?',                                          col: 'N', promoterOnly: false },
    { txt: 'Whether the Listed Entity has issued any Warrants ?',                                                        col: 'O', promoterOnly: false },
    { txt: 'Whether Listed Entity has granted any ESOPs, which are outstanding?',                                        col: 'P', promoterOnly: false },
    { txt: 'Whether the Listed Entity has any shares against which depository receipts are issued?',                     col: 'G', promoterOnly: false },
    { txt: 'Whether the Listed Entity has any shares in locked-in?',                                                     col: 'T', promoterOnly: false },
    { txt: 'Whether any shares held by promoters are encumbered under "Pledged"?',                                       col: 'V', promoterOnly: true  },
    { txt: 'Whether any shares held by promoters are encumbered under "Non-Disposal Undertaking"?',                     col: 'X', promoterOnly: true  },
    { txt: 'Whether any shares held by promoters are encumbered, other than by way of Pledge or NDU, if any?',          col: 'Z', promoterOnly: true  },
    { txt: 'Whether company has equity shares with differential voting rights?',                                         col: null, alwaysNo: true   },
    { txt: 'Whether the listed entity has any significant beneficial owner?',                                            col: null, yesIfSBO: true, iJKGrey: true },
  ];

  // Row heights for the 11 declaration rows: 15pt per wrapped line, ~60 chars/line at col width 20×3
  const DECL_HT = [30, 30, 20, 30, 30, 20, 30, 30, 30, 30, 30];

  const FOOTNOTE =
    "* If the Listed Entity selects the option 'No' for the questions above, the columns for the partly paid up " +
    'shares, Outstanding Convertible Securities/Warrants, depository receipts, locked-in shares, No of shares pledged ' +
    "or otherwise encumbered shall be not be displayed at the time of dissemination on the Stock Exchange(s).";

  const rows = [];
  const mergeRefs = [];
  const mc  = (r1,c1,r2,c2) => mergeRefs.push(`<mergeCell ref="${COL[c1]}${r1}:${COL[c2]}${r2}"/>`);
  const sc_ = (c,r,v,sid)   => strCell(`${COL[c]}${r}`, v, sid);
  const nc_ = (c,r,v,sid)   => numCell(`${COL[c]}${r}`, v, sid);
  const ec_ = (c,r,sid)     => emptyCell(`${COL[c]}${r}`, sid);
  // Fill columns c1+1..c2 in row r with empty cells (all same style) — ensures outer merge border renders
  const fillRow = (r,c1,c2,sid) => { let s=''; for (let c=c1+1;c<=c2;c++) s+=ec_(c,r,sid); return s; };

  // ── Row 1: blank ──
  rows.push('<row r="1"/>');

  // ── Row 2: title C2:K2 — navy, bold white, centered ──
  mc(2,2,2,10);
  rows.push(`<row r="2">${sc_(2,2,'Shareholding Pattern under Regulation 31 of SEBI (Listing Obligations and Disclosure Requirements) Regulations, 2015',S.HDR)}${fillRow(2,2,10,S.HDR)}</row>`);

  // ── Row 3: blank ──
  rows.push('<row r="3"/>');

  // ── Row 4: 1 | "Name of Listed Entity :" D4:E4 | issuerName F4:K4 (lightBlue) ──
  mc(4,3,4,4); mc(4,5,4,10);
  rows.push(`<row r="4">${nc_(2,4,1,S.ANNOT)}${sc_(3,4,'Name of Listed Entity :',D.LABEL)}${fillRow(4,3,4,D.LABEL)}${sc_(5,4,issuerName,D.VAL_BLUE)}${fillRow(4,5,10,D.VAL_BLUE)}</row>`);

  // ── Row 5: 2 | "Scrip Code/..." D5:F5 | scrip info G5:K5 ──
  mc(5,3,5,5); mc(5,6,5,10);
  rows.push(`<row r="5">${nc_(2,5,2,S.ANNOT)}${sc_(3,5,'Scrip Code/Name of Scrip/Class of Security :',D.LABEL)}${fillRow(5,3,5,D.LABEL)}${sc_(6,5,scripInfo,D.BOLD_CTR)}${fillRow(5,6,10,D.BOLD_CTR)}</row>`);

  // ── Row 6: 3 | label D6:H6 | "SHAREHOLDING AS ON DATE" I6:K6 (maroon) ──
  mc(6,3,6,7); mc(6,8,6,10);
  rows.push(`<row r="6">${nc_(2,6,3,S.ANNOT)}${sc_(3,6,'Share Holding Pattern Filed under: Reg. 31(1)(a)/Reg. 31(1)(b)/Reg.31(1)(C )',D.LABEL)}${fillRow(6,3,7,D.LABEL)}${sc_(8,6,'SHAREHOLDING AS ON DATE',D.MAROON)}${fillRow(6,8,10,D.MAROON)}</row>`);

  // ── Row 7: a) label D7:H7 | date I7:K8 (2-row merge, bold centered) ──
  mc(7,3,7,7); mc(7,8,8,10);
  rows.push(`<row r="7">${ec_(2,7,S.ANNOT)}${sc_(3,7,'a) If under 31(1)(b) then indicate the report for Quarter ending',D.LABEL)}${fillRow(7,3,7,D.LABEL)}${sc_(8,7,dateFmt,D.BOLD_CTR)}${ec_(9,7,D.BOLD_CTR)}${ec_(10,7,D.BOLD_CTR)}</row>`);

  // ── Row 8: b) label D8:H8 (I8:K8 covered by I7:K8 merge — write empty cells for outer border) ──
  mc(8,3,8,7);
  rows.push(`<row r="8">${ec_(2,8,S.ANNOT)}${sc_(3,8,'b) If under 31(1)(c) then indicate date of allotment/extinguishment',D.LABEL)}${fillRow(8,3,7,D.LABEL)}${ec_(8,8,D.BOLD_CTR)}${ec_(9,8,D.BOLD_CTR)}${ec_(10,8,D.BOLD_CTR)}</row>`);

  // ── Row 9: 4 | Declaration intro D9:K9 ──
  mc(9,3,9,10);
  rows.push(`<row r="9">${nc_(2,9,4,S.ANNOT)}${sc_(3,9,'Declaration: The Listed entity is required to submit the following declaration to the extent of submission of information:-',D.LABEL)}${fillRow(9,3,10,D.LABEL)}</row>`);

  // ── Row 10: blank ──
  rows.push('<row r="10"/>');

  // ── Row 11: declaration table header (navy, bold white, wrap+center) ──
  mc(11,4,11,6);
  rows.push(`<row r="11" ht="36" customHeight="1">${sc_(3,11,'S.No.',S.HDR)}${sc_(4,11,'Particulars',S.HDR)}${fillRow(11,4,6,S.HDR)}${sc_(7,11,'Yes/No',S.HDR)}${sc_(8,11,'Promoter and Promoter Group',S.HDR)}${sc_(9,11,'Public shareholder',S.HDR)}${sc_(10,11,'Non Promoter- Non Public',S.HDR)}</row>`);

  // ── Rows 12-22: declaration rows ──
  // J18:K20 = merged grey block spanning the 3 promoterOnly rows
  mc(18,9,20,10);
  // Pre-build per-row extra cells for the non-top-left cells of J18:K20
  const grayExtra = {};
  for (let r = 18; r <= 20; r++) {
    grayExtra[r] = '';
    for (let c = 9; c <= 10; c++) {
      if (r === 18 && c === 9) continue; // top-left written in loop
      grayExtra[r] += ec_(c, r, S.GRAY);
    }
  }

  for (let i = 0; i < DECL.length; i++) {
    const er = 12 + i;
    const d  = DECL[i];
    mc(er,4,er,6); // E:G merged for Particulars

    const pVal  = d.col && !d.alwaysNo ? getV(t1Rows.A,  d.col) : 0;
    const pubVal = d.col && !d.alwaysNo && !d.promoterOnly ? getV(t1Rows.B,  d.col) : 0;
    const npVal  = d.col && !d.alwaysNo && !d.promoterOnly
      ? getV(t1Rows.C1, d.col) + getV(t1Rows.C2, d.col) : 0;

    const total = pVal + pubVal + npVal;
    const yn   = d.alwaysNo ? 'No' : d.yesIfSBO ? (hasSBO ? 'Yes' : 'No') : (total > 0 ? 'Yes' : 'No');
    const pYN  = pVal   > 0 ? 'Yes' : '-';
    const pubYN = pubVal > 0 ? 'Yes' : '-';
    const npYN  = npVal  > 0 ? 'Yes' : '-';

    let cells =
      `${nc_(3,er,i+1,S.ANNOT)}` +
      `${sc_(4,er,d.txt,D.LABEL)}${ec_(5,er,D.LABEL)}${ec_(6,er,D.LABEL)}` + // E:G merge fill
      `${sc_(7,er,yn,D.BOLD_CTR)}`;

    if (d.iJKGrey) {
      // Row 22 (i=10): I:K merged grey — write all three cells
      mc(er,8,er,10);
      cells += `${ec_(8,er,S.GRAY)}${ec_(9,er,S.GRAY)}${ec_(10,er,S.GRAY)}`;
    } else if (d.promoterOnly) {
      // Rows 18-20 (i=6-8): only Promoter (I) has data; J:K covered by J18:K20
      cells += sc_(8,er,pYN,S.ANNOT);
      if (i === 6) cells += ec_(9,er,S.GRAY); // J18: top-left of J18:K20
      cells += grayExtra[er] ?? '';            // K18; J19+K19; J20+K20
    } else {
      cells += `${sc_(8,er,pYN,S.ANNOT)}${sc_(9,er,pubYN,S.ANNOT)}${sc_(10,er,npYN,S.ANNOT)}`;
    }

    rows.push(`<row r="${er}" ht="${DECL_HT[i]}" customHeight="1">${cells}</row>`);
  }

  // ── Row 23: blank gap ──
  rows.push('<row r="23"/>');

  // ── Rows 24-27: footnote C24:K27 ──
  mc(24,2,27,10);
  rows.push(`<row r="24">${sc_(2,24,FOOTNOTE,S.NOTE)}</row>`);
  rows.push('<row r="25"/>');
  rows.push('<row r="26"/>');
  rows.push('<row r="27"/>');

  const colsXml =
    '<cols>' +
    '<col min="1" max="2" width="3"  customWidth="1"/>' +
    '<col min="3" max="3" width="6"  customWidth="1"/>' +
    '<col min="4" max="4" width="12" customWidth="1"/>' +
    '<col min="5" max="7" width="22" customWidth="1"/>' +
    '<col min="8" max="8" width="12" customWidth="1"/>' +
    '<col min="9" max="11" width="24" customWidth="1"/>' +
    '</cols>';

  const mergeCellsXml = mergeRefs.length
    ? `<mergeCells count="${mergeRefs.length}">${mergeRefs.join('')}</mergeCells>`
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    colsXml +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    mergeCellsXml +
    '</worksheet>';
}

// ── Annexure A style specs ─────────────────────────────────────────────────────
// 0: AA_TITLE — bold 20pt, no fill, no border (Row 1 "Annexure A" cell)
// 1: AA_HDR   — light blue #92CDDC fill, bold black, thin border (Row 4 column headers)
const ANNEX_A_STYLE_SPECS = [
  { font: { b: true, sz: 20, color: '000000', name: 'Calibri' }, fill: null,
    al: { v: 'center' },
    bd: { l: null, r: null, t: null, b: null }, lk: false },
  { font: { b: true, sz: 11, color: '000000', name: 'Calibri' }, fill: '92CDDC',
    al: { h: 'center', v: 'center', wrap: true },
    bd: { l: ['thin', null], r: ['thin', null], t: ['thin', null], b: ['thin', null] }, lk: false },
];

// ── Annexure B style specs ─────────────────────────────────────────────────────
// 0: AB_DATA_CTR — bold, light blue #DCE6F1 fill, thin border, center (text/fallback cells)
// 1: AB_DATA_NUM — same as AB_DATA_CTR but with 0.00 number format (Board/Utilized % cells)
const ANNEX_B_STYLE_SPECS = [
  { font: { b: true, sz: 11, color: '000000', name: 'Calibri' }, fill: 'DCE6F1',
    al: { h: 'center', v: 'center' },
    bd: { l: ['thin', null], r: ['thin', null], t: ['thin', null], b: ['thin', null] }, lk: false },
  { font: { b: true, sz: 11, color: '000000', name: 'Calibri' }, fill: 'DCE6F1',
    al: { h: 'center', v: 'center' },
    bd: { l: ['thin', null], r: ['thin', null], t: ['thin', null], b: ['thin', null] }, lk: false, nf: 164 },
];


// -- Table V (Significant Beneficial Owners) style specs
// 0: TV_BOLD_CTR -- bold, thin border, center+vcenter (NIL row cells)
const TABLE_V_STYLE_SPECS = [
  { font: { b: true, sz: 11, color: '000000', name: 'Calibri' }, fill: null,
    al: { h: 'center', v: 'center' },
    bd: { l: ['thin', null], r: ['thin', null], t: ['thin', null], b: ['thin', null] }, lk: false },
];
// ── Ancillary table style specs ────────────────────────────────────────────────
// 0: ANCS_TEXT — thin border, wrap+top (text/notes data cells)
// 1: ANCS_NUM  — thin border, right+center (numeric data cells)
const ANC_STYLE_SPECS = [
  { font: { b: false, sz: 11, color: '000000', name: 'Calibri' }, fill: null,
    al: { v: 'top', wrap: true },
    bd: { l: ['thin', null], r: ['thin', null], t: ['thin', null], b: ['thin', null] }, lk: false },
  { font: { b: false, sz: 11, color: '000000', name: 'Calibri' }, fill: null,
    al: { h: 'right', v: 'center' },
    bd: { l: ['thin', null], r: ['thin', null], t: ['thin', null], b: ['thin', null] }, lk: false },
];

// ── Ancillary table layout config ─────────────────────────────────────────────
const ANCH_CONFIG = {
  'II-A': {
    title: 'Details of Shares which remain unclaimed for Promoter & Promoter Group',
    row2MergeEndCol: 4, // B2:E2
    headers: [
      'Sr. No.',
      'Number of shareholders',
      'Outstanding shares held in demat or unclaimed suspense account',
      'Voting rights which are frozen',
      'Disclosure of notes on shares which remain unclaimed for promoter and promoter group',
    ],
    fields:       ['numberOfShareholders', 'outstandingShares', 'votingRightsFrozen', 'notes'],
    numericFields: new Set(['numberOfShareholders', 'outstandingShares', 'votingRightsFrozen']),
    colWidths: [2, 8, 22, 42, 20, 50, 2],
  },
  'III-A': {
    title: 'Details of the shareholders acting as persons in Concert for Public',
    row2MergeEndCol: 5, // B2:F2
    headers: [
      'Sr. No.',
      'Name of Shareholder',
      'Name of the PAC',
      'Number of shares',
      'Percentage of shareholding by PAC',
    ],
    fields:       ['shareholderName', 'pacName', 'numberOfShares', 'pacPercentage'],
    numericFields: new Set(['numberOfShares', 'pacPercentage']),
    colWidths: [2, 8, 25, 25, 18, 28, 2],
  },
  'III-B': {
    title: 'Details of Shares which remain unclaimed for Public',
    row2MergeEndCol: null, // no row-2 merge
    headers: [
      'Sr. No.',
      'Number of shareholders',
      'Outstanding shares held in demat or unclaimed suspense account',
      'Voting rights which are frozen',
      'Disclosure of notes on shares which remain unclaimed for public shareholders',
    ],
    fields:       ['numberOfShareholders', 'outstandingShares', 'votingRightsFrozen', 'notes'],
    numericFields: new Set(['numberOfShareholders', 'outstandingShares', 'votingRightsFrozen']),
    colWidths: [2, 8, 22, 42, 20, 50, 2],
  },
};

// ── Ancillary sheet XML builder ────────────────────────────────────────────────
// dataRows: row objects from /all (or null/empty → default NIL row)
// ancSid:   [textSid, numSid] from appendStyleSpecs(ANC_STYLE_SPECS)
function buildAncillarySheetXml(tableCode, dataRows, ancSid) {
  const cfg = ANCH_CONFIG[tableCode];
  const rows   = [];
  const merges = [];
  let rn = 0;

  const colsXml = '<cols>' +
    cfg.colWidths.map((w, i) => `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('') +
    '</cols>';

  // Row 1: Title — B1:F1 merged; A and G are plain margin columns
  rn++;
  merges.push(merge(rn-1, 1, rn-1, 5));
  {
    let rx = `<row r="${rn}" ht="25" customHeight="1">`;
    rx += strCell(`${COL[1]}${rn}`, cfg.title, S.TITLE);
    for (let c = 2; c <= 5; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // Row 2: Spacer — B..F only
  rn++;
  if (cfg.row2MergeEndCol !== null) merges.push(merge(rn-1, 1, rn-1, cfg.row2MergeEndCol));
  {
    let rx = `<row r="${rn}" ht="6" customHeight="1">`;
    for (let c = 1; c <= 5; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // Row 3: Headers — B..F only
  rn++;
  {
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let h = 0; h < cfg.headers.length; h++) {
      rx += strCell(`${COL[1+h]}${rn}`, cfg.headers[h], S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Data rows — default NIL row when no uploaded data
  const effectiveRows = (dataRows && dataRows.length > 0) ? dataRows : null;

  if (!effectiveRows) {
    rn++;
    let rx = `<row r="${rn}">`;
    rx += numCell(`${COL[1]}${rn}`, 1, S.HOLDER);
    for (let f = 0; f < cfg.fields.length; f++) {
      rx += strCell(`${COL[2+f]}${rn}`, 'NIL', ancSid[0]);
    }
    rx += '</row>';
    rows.push(rx);
  } else {
    for (let i = 0; i < effectiveRows.length; i++) {
      const dr  = effectiveRows[i];
      const sno = dr.rowNo ?? (i + 1);
      rn++;
      let rx = `<row r="${rn}">`;
      rx += numCell(`${COL[1]}${rn}`, sno, S.HOLDER);
      for (let f = 0; f < cfg.fields.length; f++) {
        const field  = cfg.fields[f];
        const val    = dr[field];
        const ref    = `${COL[2+f]}${rn}`;
        const isNum  = cfg.numericFields.has(field);
        if (val == null || val === '') {
          rx += emptyCell(ref, isNum ? ancSid[1] : ancSid[0]);
        } else if (String(val).toUpperCase() === 'NIL') {
          rx += strCell(ref, 'NIL', ancSid[0]);
        } else if (isNum) {
          const n = Number(String(val).replace(/,/g, ''));
          rx += Number.isFinite(n) ? numCell(ref, n, ancSid[1]) : strCell(ref, String(val), ancSid[0]);
        } else {
          rx += strCell(ref, String(val), ancSid[0]);
        }
      }
      rx += '</row>';
      rows.push(rx);
    }
  }

  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r+1}:${COL[m.e.c]}${m.e.r+1}"/>`).join('') +
      '</mergeCells>'
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    mergeCellsXml +
    '</worksheet>';
}

// ── Annexure A sheet XML builder ──────────────────────────────────────────────
// annexARows: [{pan, name, promoterType}] — already sorted (PROMOTER first, then name)
// annexSid:   [AA_TITLE_sid, AA_HDR_sid]

const PAN_TYPE_MAP = {
  P: 'Individual', C: 'Company', H: 'HUF', F: 'Firm',
  A: 'AOP', B: 'BOI', G: 'Government', J: 'Artificial Juridical Person',
  T: 'Trust', L: 'Local Authority',
};
function panEntityType(pan) {
  const ch = String(pan ?? '').trim().toUpperCase();
  return (ch.length >= 4 && PAN_TYPE_MAP[ch[3]]) ? PAN_TYPE_MAP[ch[3]] : '-';
}

function buildAnnexureAXml(annexARows, annexSid) {
  const dataRows = Array.isArray(annexARows) ? annexARows : [];
  const out      = [];
  const merges   = [];
  let rn = 0;

  const AA_TITLE = annexSid[0];
  const AA_HDR   = annexSid[1];

  const colsXml =
    '<cols>' +
    '<col min="1" max="1" width="8"  customWidth="1"/>' +
    '<col min="2" max="2" width="45" customWidth="1"/>' +
    '<col min="3" max="3" width="18" customWidth="1"/>' +
    '<col min="4" max="4" width="22" customWidth="1"/>' +
    '<col min="5" max="5" width="20" customWidth="1"/>' +
    '</cols>';

  // Row 1: "Annexure A" merged A1:E1
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 4));
  {
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Annexure A', AA_TITLE);
    for (let c = 1; c <= 4; c++) rx += emptyCell(`${COL[c]}${rn}`, AA_TITLE);
    rx += '</row>';
    out.push(rx);
  }

  // Row 2: navy title band merged A2:E2
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 4));
  {
    let rx = `<row r="${rn}" ht="25" customHeight="1">`;
    rx += strCell(`A${rn}`, 'List of Promoter/Promoter Group having - Zero/NIL Holding in company', S.HDR);
    for (let c = 1; c <= 4; c++) rx += emptyCell(`${COL[c]}${rn}`, S.HDR);
    rx += '</row>';
    out.push(rx);
  }

  // Row 3: blank spacer
  rn++;
  {
    let rx = `<row r="${rn}" ht="6" customHeight="1">`;
    for (let c = 0; c <= 4; c++) rx += emptyCell(`${COL[c]}${rn}`, S.DEFAULT);
    rx += '</row>';
    out.push(rx);
  }

  // Row 4: column headers
  rn++;
  {
    const hdrs = ['S.No.', 'Name', 'PAN', 'Category', 'Type'];
    let rx = `<row r="${rn}" ht="20" customHeight="1">`;
    for (let c = 0; c < 5; c++) rx += strCell(`${COL[c]}${rn}`, hdrs[c], AA_HDR);
    rx += '</row>';
    out.push(rx);
  }

  // Rows 5+: data (one empty bordered row when no data)
  if (dataRows.length === 0) {
    rn++;
    let rx = `<row r="${rn}">`;
    for (let c = 0; c < 5; c++) rx += emptyCell(`${COL[c]}${rn}`, S.HOLDER);
    rx += '</row>';
    out.push(rx);
  } else {
    for (let i = 0; i < dataRows.length; i++) {
      const ar = dataRows[i];
      rn++;
      const category = ar.promoterType === 'PROMOTER' ? 'Promoter' : 'Promoter Group';
      let rx = `<row r="${rn}">`;
      rx += numCell(`A${rn}`, i + 1, S.HOLDER);
      rx += strCell(`B${rn}`, ar.name ?? '', S.HOLDER);
      rx += strCell(`C${rn}`, ar.pan ?? '', S.HOLDER);
      rx += strCell(`D${rn}`, category, S.HOLDER);
      rx += strCell(`E${rn}`, panEntityType(ar.pan), S.HOLDER);
      rx += '</row>';
      out.push(rx);
    }
  }

  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r + 1}:${COL[m.e.c]}${m.e.r + 1}"/>`).join('') +
      '</mergeCells>'
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + out.join('') + '</sheetData>' +
    mergeCellsXml +
    '</worksheet>';
}

// ── Annexure B sheet XML builder ──────────────────────────────────────────────
// annexBData: { benposDate, utilizedPct, quarters: [{label,benposDate,utilizedPct,boardLimitPct}x4] }
// abDataCtrSid: style id for centered light-blue data cells (AB_DATA_CTR from ANNEX_B_STYLE_SPECS)
// titleSid:     style id for 20pt bold title (reuses annexSid[0] from ANNEX_A_STYLE_SPECS)

const MONTHS_SHORT_B = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtBenposDate(s) {
  if (!s || s.length < 10) return '-';
  const m = parseInt(s.slice(5, 7), 10) - 1;
  return `${s.slice(8, 10)}-${MONTHS_SHORT_B[m] ?? '?'}-${s.slice(0, 4)}`;
}
function fmtPct(v) {
  if (v == null) return '-';
  return Number(v).toFixed(2);
}

const ANNEX_B_PARTICULARS = [
  'As on shareholding date',
  'As on the end of previous 1st quarter',
  'As on the end of previous 2nd quarter',
  'As on the end of previous 3rd quarter',
  'As on the end of previous 4th quarter',
];

function buildAnnexureBXml(annexBData, abDataCtrSid, abDataNumSid, titleSid) {
  const data = annexBData ?? {};
  const out   = [];
  const merges = [];
  let rn = 0;

  const colsXml =
    '<cols>' +
    '<col min="1" max="1" width="50" customWidth="1"/>' +
    '<col min="2" max="2" width="25" customWidth="1"/>' +
    '<col min="3" max="3" width="20" customWidth="1"/>' +
    '</cols>';

  // Row 1: "Annexure B" merged A1:C1
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 2));
  {
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Annexure B', titleSid);
    for (let c = 1; c <= 2; c++) rx += emptyCell(`${COL[c]}${rn}`, titleSid);
    rx += '</row>';
    out.push(rx);
  }

  // Row 2: navy band merged A2:C2
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 2));
  {
    let rx = `<row r="${rn}" ht="25" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Table VI - Statement showing foreign ownership limits', S.HDR);
    for (let c = 1; c <= 2; c++) rx += emptyCell(`${COL[c]}${rn}`, S.HDR);
    rx += '</row>';
    out.push(rx);
  }

  // Row 3: blank spacer
  rn++;
  {
    let rx = `<row r="${rn}" ht="6" customHeight="1">`;
    for (let c = 0; c <= 2; c++) rx += emptyCell(`${COL[c]}${rn}`, S.DEFAULT);
    rx += '</row>';
    out.push(rx);
  }

  // Row 4: column headers (navy, bold white, centered, borders)
  rn++;
  {
    const hdrs = ['Particulars', 'Board approved limits %', 'Limits utilized %'];
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    for (let c = 0; c < 3; c++) rx += strCell(`${COL[c]}${rn}`, hdrs[c], S.HDR);
    rx += '</row>';
    out.push(rx);
  }

  // Rows 5-9: 5 data rows (light blue, bold, bordered)
  const quarters = Array.isArray(data.quarters) ? data.quarters : [];
  for (let i = 0; i < 5; i++) {
    rn++;
    let rx = `<row r="${rn}" ht="18" customHeight="1">`;
    rx += strCell(`A${rn}`, ANNEX_B_PARTICULARS[i], S.TOTAL);
    if (i === 0) {
      rx += numCell(`B${rn}`, 100, abDataNumSid);
      rx += data.utilizedPct == null
        ? strCell(`C${rn}`, '-', abDataCtrSid)
        : numCell(`C${rn}`, Number(data.utilizedPct), abDataNumSid);
    } else {
      const q = quarters[i - 1] ?? null;
      if (!q || q.benposDate == null) {
        rx += strCell(`B${rn}`, '-', abDataCtrSid);
        rx += strCell(`C${rn}`, '-', abDataCtrSid);
      } else {
        rx += q.boardLimitPct == null
          ? strCell(`B${rn}`, '-', abDataCtrSid)
          : numCell(`B${rn}`, Number(q.boardLimitPct), abDataNumSid);
        rx += q.utilizedPct == null
          ? strCell(`C${rn}`, '-', abDataCtrSid)
          : numCell(`C${rn}`, Number(q.utilizedPct), abDataNumSid);
      }
    }
    rx += '</row>';
    out.push(rx);
  }

  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r + 1}:${COL[m.e.c]}${m.e.r + 1}"/>`).join('') +
      '</mergeCells>'
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + out.join('') + '</sheetData>' +
    mergeCellsXml +
    '</worksheet>';
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * holdersByCode: Map<shpCode, holderLine[]>
 *   holderLine: { name, entityType, pan, f, u, w, y, ae }
 * totalShares: number
 * Returns Promise<Blob>
 */

// -- Table V (Significant Beneficial Owners) sheet XML builder
function buildTableVXml(tableVRows, ancSid, t5Sid) {
  const rows   = [];
  const merges = [];
  let rn = 0;

  const colsXml =
    '<cols>' +
    '<col min="1"  max="1"  width="6"  customWidth="1"/>' +
    '<col min="2"  max="2"  width="28" customWidth="1"/>' +
    '<col min="3"  max="3"  width="16" customWidth="1"/>' +
    '<col min="4"  max="4"  width="18" customWidth="1"/>' +
    '<col min="5"  max="5"  width="28" customWidth="1"/>' +
    '<col min="6"  max="6"  width="16" customWidth="1"/>' +
    '<col min="7"  max="7"  width="18" customWidth="1"/>' +
    '<col min="8"  max="8"  width="18" customWidth="1"/>' +
    '<col min="9"  max="9"  width="34" customWidth="1"/>' +
    '<col min="10" max="10" width="32" customWidth="1"/>' +
    '</cols>';

  // Row 1: blank
  rn++;
  rows.push(`<row r="${rn}"/>`);

  // Row 2: title A2:J2
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 9));
  {
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Table V - Statement showing details of significant beneficial owners', S.TITLE);
    for (let c = 1; c <= 9; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // Row 3: thin spacer
  rn++;
  {
    let rx = `<row r="${rn}" ht="6" customHeight="1">`;
    for (let c = 0; c <= 9; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // Rows 4-5: two-level headers
  rn++; // row 4
  const r4 = rn - 1;
  merges.push(merge(r4, 0, r4 + 1, 0)); // A4:A5
  merges.push(merge(r4, 1, r4,     3)); // B4:D4
  merges.push(merge(r4, 4, r4,     6)); // E4:G4
  merges.push(merge(r4, 7, r4,     8)); // H4:I4
  merges.push(merge(r4, 9, r4 + 1, 9)); // J4:J5
  {
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    rx += strCell(`${COL[0]}${rn}`, 'Sr. No', S.HDR);
    rx += strCell(`${COL[1]}${rn}`, 'Details of the beneficial owner (I)', S.HDR);
    rx += emptyCell(`${COL[2]}${rn}`, S.HDR);
    rx += emptyCell(`${COL[3]}${rn}`, S.HDR);
    rx += strCell(`${COL[4]}${rn}`, 'Details of the registered owner (II)', S.HDR);
    rx += emptyCell(`${COL[5]}${rn}`, S.HDR);
    rx += emptyCell(`${COL[6]}${rn}`, S.HDR);
    rx += strCell(`${COL[7]}${rn}`, 'Particulars of the shares in which significant beneficial interest is held by the beneficial owner (III)', S.HDR);
    rx += emptyCell(`${COL[8]}${rn}`, S.HDR);
    rx += strCell(`${COL[9]}${rn}`, 'Date of Creation / acquisition of significant beneficial interest (IV)', S.HDR);
    rx += '</row>';
    rows.push(rx);
  }
  rn++; // row 5
  {
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    rx += emptyCell(`${COL[0]}${rn}`, S.HDR);
    rx += strCell(`${COL[1]}${rn}`, 'Name',        S.HDR);
    rx += strCell(`${COL[2]}${rn}`, 'PAN',         S.HDR);
    rx += strCell(`${COL[3]}${rn}`, 'Nationality', S.HDR);
    rx += strCell(`${COL[4]}${rn}`, 'Name',        S.HDR);
    rx += strCell(`${COL[5]}${rn}`, 'PAN',         S.HDR);
    rx += strCell(`${COL[6]}${rn}`, 'Nationality', S.HDR);
    rx += strCell(`${COL[7]}${rn}`, 'Number of shares', S.HDR);
    rx += strCell(`${COL[8]}${rn}`, 'Shareholding as a % of total no. of shares (calculated as per SCRR, 1957) As a % of (A+B+C2)', S.HDR);
    rx += emptyCell(`${COL[9]}${rn}`, S.HDR);
    rx += '</row>';
    rows.push(rx);
  }

  // Data rows (or default NIL row when empty)
  const effectiveRows = (tableVRows && tableVRows.length > 0) ? tableVRows : null;

  if (!effectiveRows) {
    rn++;
    let rx = `<row r="${rn}">`;
    rx += numCell(`${COL[0]}${rn}`, 1, t5Sid);
    for (let c = 1; c <= 9; c++) rx += strCell(`${COL[c]}${rn}`, 'NIL', t5Sid);
    rx += '</row>';
    rows.push(rx);
  } else {
    const textFields = [
      'beneficialOwnerName', 'beneficialOwnerPan', 'beneficialOwnerNationality',
      'registeredOwnerName',  'registeredOwnerPan', 'registeredOwnerNationality',
    ];
    for (let i = 0; i < effectiveRows.length; i++) {
      const dr  = effectiveRows[i];
      const sno = dr.rowNo ?? (i + 1);
      rn++;
      let rx = `<row r="${rn}">`;
      rx += numCell(`${COL[0]}${rn}`, sno, ancSid[1]);
      for (let fi = 0; fi < textFields.length; fi++) {
        const val = dr[textFields[fi]];
        const ref = `${COL[1 + fi]}${rn}`;
        rx += (val == null || val === '') ? emptyCell(ref, ancSid[0]) : strCell(ref, String(val), ancSid[0]);
      }
      // H: numberOfShares (integer)
      {
        const val = dr.numberOfShares;
        const ref = `${COL[7]}${rn}`;
        if (val == null || val === '') {
          rx += emptyCell(ref, ancSid[1]);
        } else if (String(val).toUpperCase() === 'NIL') {
          rx += strCell(ref, 'NIL', ancSid[0]);
        } else {
          const n = Number(String(val).replace(/,/g, ''));
          rx += Number.isFinite(n) ? numCell(ref, n, ancSid[1]) : strCell(ref, String(val), ancSid[0]);
        }
      }
      // I: shareholdingPct (0.00 format)
      {
        const val = dr.shareholdingPct;
        const ref = `${COL[8]}${rn}`;
        if (val == null || val === '') {
          rx += emptyCell(ref, S.HOLDER_PCT);
        } else if (String(val).toUpperCase() === 'NIL') {
          rx += strCell(ref, 'NIL', ancSid[0]);
        } else {
          const n = Number(String(val).replace(/,/g, ''));
          rx += Number.isFinite(n) ? numCell(ref, n, S.HOLDER_PCT) : strCell(ref, String(val), ancSid[0]);
        }
      }
      // J: dateOfCreation formatted dd-Mon-yyyy
      {
        const val = dr.dateOfCreation;
        const ref = `${COL[9]}${rn}`;
        rx += (val == null || val === '') ? emptyCell(ref, ancSid[0]) : strCell(ref, fmtDashDate(String(val)), ancSid[0]);
      }
      rx += '</row>';
      rows.push(rx);
    }
  }

  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r + 1}:${COL[m.e.c]}${m.e.r + 1}"/>`).join('') +
      '</mergeCells>'
    : '';

  return XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    mergeCellsXml +
    '</worksheet>';
}
export async function buildShpAllSheetsBlob(holdersByCode, holdersByPublicCode, holdersByNonPublicCode, totalShares, convTotal = 0, entityInfo = {}, shpTableData = {}, annexARows = [], annexBData = null) {
  const chunks = [];
  let zipErr = null;
  const zip = new Zip((err, chunk) => { if (err) zipErr = err; else chunks.push(chunk); });

  const addSmall = (name, xml) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(xml), true);
    if (zipErr) throw zipErr;
  };

  addSmall('[Content_Types].xml', XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet6.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet7.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet8.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet9.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet10.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet11.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>');

  addSmall('_rels/.rels', XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>');

  addSmall('xl/workbook.xml', XML_HEAD +
    `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>` +
    `<sheet name="${escA('Dashboard')}"    sheetId="5" r:id="rId6"/>` +
    `<sheet name="${escA('Table I')}"      sheetId="4" r:id="rId5"/>` +
    `<sheet name="${escA('Table II')}"     sheetId="1" r:id="rId1"/>` +
    `<sheet name="${escA('Table II-A')}"   sheetId="6" r:id="rId7"/>` +
    `<sheet name="${escA('Table III')}"    sheetId="2" r:id="rId3"/>` +
    `<sheet name="${escA('Table III-A')}"  sheetId="7" r:id="rId8"/>` +
    `<sheet name="${escA('Table III-B')}"  sheetId="8" r:id="rId9"/>` +
    `<sheet name="${escA('Table IV')}"     sheetId="3"  r:id="rId4"/>` +
    `<sheet name="${escA('Table V')}"  sheetId="11" r:id="rId12"/>` +
    `<sheet name="${escA('Annexure B')}"  sheetId="10" r:id="rId11"/>` +
    `<sheet name="${escA('Annexure A')}"  sheetId="9"  r:id="rId10"/>` +
    '</sheets></workbook>');

  addSmall('xl/_rels/workbook.xml.rels', XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>' +
    '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>' +
    '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet6.xml"/>' +
    '<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet7.xml"/>' +
    '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet8.xml"/>' +
    '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet9.xml"/>' +
    '<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet10.xml"/>' +
    '<Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet11.xml"/>' +
    '</Relationships>');

  const stylesXml = buildStyles();
  const { xml: stylesXml2, ids: t1StyleIds } = appendStyleSpecs(stylesXml, TABLE_I_STYLE_SPECS);
  const r2 = appendStyleSpecs(stylesXml2, TABLE_II_STYLE_SPECS); const t2StyleIds = r2.ids;
  const t3Style  = appendStyleSpecs(r2.xml,       TABLE_III_TEMPLATE.specs);
  const t4Style  = appendStyleSpecs(t3Style.xml,  TABLE_IV_TEMPLATE.specs);
  const ancStyle   = appendStyleSpecs(t4Style.xml,   ANC_STYLE_SPECS);
  const ancSid     = ancStyle.ids; // [ANCS_TEXT, ANCS_NUM]
  const annexStyle  = appendStyleSpecs(ancStyle.xml,   ANNEX_A_STYLE_SPECS);
  const annexSid    = annexStyle.ids; // [AA_TITLE, AA_HDR]
  const annexBStyle = appendStyleSpecs(annexStyle.xml, ANNEX_B_STYLE_SPECS);
  const annexBSid   = annexBStyle.ids; // [AB_DATA_CTR, AB_DATA_NUM]
  const t5Style     = appendStyleSpecs(annexBStyle.xml, TABLE_V_STYLE_SPECS);
  const t5Sid       = t5Style.ids[0]; // TV_BOLD_CTR
  addSmall('xl/styles.xml', t5Style.xml);

  // ── Sheet content ───────────────────────────────────────────────────────────
  const rows   = [];
  const merges = [];
  let rn = 0;

  // Column widths (34 columns A-AH)
  const widths = [
    9.14, 38.14, 21.14, 20.43, 13.43, 14.43, 13.14, 13.14, 14, 12,
    16.43, 16.43, 11.86, 10, 14.43, 14.43, 14.43, 17.71, 15.29, 17.71,
    18.43, 9.14, 12.14, 12.14, 12.14, 12.14, 12.14, 12.14, 12.14, 12.14,
    18.43, 18.43, 18.43, 18.43,
  ];
  const colsXml = '<cols>' +
    widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') +
    '</cols>';

  // ── Row 1: Title ─────────────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 33));
  {
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    rx += strCell(`A${rn}`, 'Table II - Statement showing shareholding pattern of the Promoter and Promoter Group', S.TITLE);
    for (let c = 1; c <= 33; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Row 2: Thin spacer ───────────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn - 1, 0, rn - 1, 30));
  {
    let rx = `<row r="${rn}" ht="6" customHeight="1">`;
    for (let c = 0; c < 31; c++) rx += emptyCell(`${COL[c]}${rn}`, S.TITLE);
    for (const gc of GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, S.GRAY);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Rows 3-5: Multi-level header ─────────────────────────────────────────────
  rn++; // row 3
  const r3 = rn - 1; // 0-based index for merges
  // Columns that span rows 3-5 individually
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19, 30]) {
    merges.push(merge(r3, c, r3 + 2, c));
  }
  // K3:N3 — voting rights super-header
  merges.push(merge(r3, 10, r3, 13));
  // Encumbrance group headers span 2 cols at row 3
  [[20,21],[22,23],[24,25],[26,27],[28,29]].forEach(([a,b]) => merges.push(merge(r3,a,r3,b)));
  // AF3:AH3 — sub-categorization super-header
  merges.push(merge(r3, 31, r3, 33));

  {
    const cells = {
      0:  '(A) ',
      1:  'Category & Name of shareholders',
      2:  'Entity type i.e.\r\npromoter\r\nOR\r\npromoter group entity (except promoter)',
      3:  'PAN',
      4:  'No. of Shareholders',
      5:  'No. of Fully paid up equity shares held ',
      6:  'Partly paid-up equity shares held',
      7:  'No. of shares underlying Depository Receipts',
      8:  'Total nos. shares held',
      9:  'Shareholding as a % of total no. of shares (calculated as per SCRR, 1957)',
      10: 'Number of Voting Rights held in each class of securities',
      14: 'No. Of Shares Underlying Outstanding convertible securities\r\n',
      15: 'No. of Shares Underlying Outstanding Warrants \r\n',
      16: 'No. Of Outstanding ESOP Granted',
      17: 'No. of Shares Underlying Outstanding convertible securities, No. of Warrants and ESOP etc.\r\n',
      18: 'Total No. of shares on fully diluted basis (including warrants, ESOP, Convertible Securities etc.)',
      19: 'Shareholding , as a % assuming full conversion of convertible securities ( as a percentage of diluted share capital)',
      20: 'Number of Locked in shares ',
      22: 'Number of Shares pledged',
      24: 'Non-Disposal Undertaking',
      26: 'Other encumbrances, if any',
      28: 'Total Number of Shares encumbered ',
      30: 'Number of equity shares held in dematerialized form',
      31: 'Sub-categorization of shares\r\n\r\n(XIX)',
    };
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let c = 0; c <= 33; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Row 4
  rn++;
  const r4 = rn - 1;
  merges.push(merge(r4, 10, r4, 12)); // K4:M4
  // N4:N5 and all encumbrance sub-cols span rows 4-5
  for (const c of [13, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]) merges.push(merge(r4, c, r4 + 1, c));
  merges.push(merge(r4, 31, r4, 33)); // AF4:AH4
  {
    const cells = {
      10: 'No. of Voting Rights',
      13: 'Total as a % of Total Voting Rights ',
      21: 'As a % of total shares held (b)',
      22: 'No. (a)', 23: 'As a % of total shares held (b)',
      24: 'No. (a)', 25: 'As a % of total shares held (b)',
      26: 'No. (a)', 27: 'As a % of total shares held (b)',
      28: 'No. (a)', 29: 'As a % of total shares held (b)',
      31: 'Shareholding (No. of shares) under',
    };
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let c = 0; c <= 33; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // Row 5
  rn++;
  {
    const cells = {
      10: 'Class : e.g. X ', 11: 'Class : e.g. Y', 12: 'Total',
      31: 'Sub-category (i)', 32: 'Sub-category (ii)', 33: 'Sub-category (iii)',
    };
    let rx = `<row r="${rn}" ht="40" customHeight="1">`;
    for (let c = 0; c <= 33; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.HDR) : emptyCell(`${COL[c]}${rn}`, S.HDR);
    }
    rx += '</row>';
    rows.push(rx);
  }

  // ── Row 6: Column annotation ──────────────────────────────────────────────────
  rn++;
  merges.push(merge(rn - 1, 10, rn - 1, 13)); // K6:N6
  {
    const cells = {
      1: '(I)', 2: '(II)', 4: '(III)', 5: '(IV)', 6: '(V)', 7: '(VI)',
      8: '(VII) = (IV)+(V)+ (VI)', 9: '(VIII) As a % of (A+B+C2)',
      10: '(IX)',
      14: '(XA)', 15: '(XB)', 16: '(XC)', 17: '(X) = (XA+XB+XC)',
      18: '(XI)=(VII+X)', 19: '(XII)= (VII)+(X)\r\nAs a % of (A+B+C2)',
      20: '(XIII) ', 22: '(XIV)', 24: '(XV)', 26: '(XVI)',
      28: '(XVII) = (XIV+XV+XVI)', 30: '(XVIII)',
    };
    let rx = `<row r="${rn}" ht="30" customHeight="1">`;
    for (let c = 0; c < 31; c++) {
      const v = cells[c];
      rx += v != null ? strCell(`${COL[c]}${rn}`, v, S.ANNOT) : emptyCell(`${COL[c]}${rn}`, S.ANNOT);
    }
    for (const gc of GRAY_COLS) rx += emptyCell(`${COL[gc]}${rn}`, S.GRAY);
    rx += '</row>';
    rows.push(rx);
  }

  // ── Data rows ─────────────────────────────────────────────────────────────────

  const allHolders = [];

  for (const section of SHP_SECTIONS) {
    // Section band row: col A = section number, col B:AH merged = section name
    rn++;
    merges.push(merge(rn - 1, 1, rn - 1, 33));
    {
      let rx = `<row r="${rn}" ht="18" customHeight="1">`;
      rx += strCell(`A${rn}`, section.sectionLabel, S.SECTION);
      rx += strCell(`B${rn}`, section.sectionName, S.SECTION);
      for (let c = 2; c <= 33; c++) rx += emptyCell(`${COL[c]}${rn}`, S.SECTION);
      rx += '</row>';
      rows.push(rx);
    }

    const sectionHolders = [];

    for (const cat of section.categories) {
      if (cat.subRows) {
        // Resolve holders for each sub-row
        const subRowData = cat.subRows.map(sr => ({
          sr,
          holders: sr.code
            ? (holdersByCode.get(sr.code) || []).slice().sort((a, b) => (b.f || 0) - (a.f || 0))
            : [],
        }));
        const allSubHolders = subRowData.flatMap(d => d.holders);

        // Parent category row — aggregate of all sub-row holders
        rn++;
        rows.push(renderRow(rn, aggregateArr(allSubHolders, totalShares, cat.name, cat.rowLabel, convTotal), S.CATEGORY, S.HOLDER_PCT, S.GRAY, S.BEIGE));

        // Individual sub-rows
        for (const { sr, holders } of subRowData) {
          rn++;
          rows.push(renderRow(rn, aggregateArr(holders, totalShares, sr.name, null, convTotal), S.CATEGORY, S.HOLDER_PCT, S.GRAY, S.BEIGE));
          for (const h of holders) {
            rn++;
            rows.push(renderRow(rn, holderArr(h, totalShares, convTotal), S.HOLDER, S.HOLDER_PCT, S.GRAY, S.BEIGE));
            sectionHolders.push(h);
            allHolders.push(h);
          }
        }
      } else {
        const catHolders = (holdersByCode.get(cat.code) || [])
          .slice().sort((a, b) => (b.f || 0) - (a.f || 0));

        rn++;
        rows.push(renderRow(rn, aggregateArr(catHolders, totalShares, cat.name, cat.rowLabel, convTotal), S.CATEGORY, S.HOLDER_PCT, S.GRAY, S.BEIGE));

        for (const h of catHolders) {
          rn++;
          rows.push(renderRow(rn, holderArr(h, totalShares, convTotal), S.HOLDER, S.HOLDER_PCT, S.GRAY, S.BEIGE));
          sectionHolders.push(h);
          allHolders.push(h);
        }
      }
    }

    // Sub-total row
    rn++;
    rows.push(renderRow(rn, aggregateArr(sectionHolders, totalShares, section.subTotalLabel, null, convTotal), S.SUBTOTAL, S.SUBTOTAL_PCT, S.GRAY));
  }

  // Grand total row
  rn++;
  rows.push(renderRow(rn, aggregateArr(allHolders, totalShares, TOTAL_LABEL, null, convTotal), S.TOTAL, S.TOTAL_PCT, S.GRAY));

  // ── Single note ───────────────────────────────────────────────────────────────
  rn++;
  rows.push(`<row r="${rn}">${strCell(`A${rn}`, 'Details of Shares which remain unclaimed may be given here alongwith details such as number of shareholders, outstanding shares held in demat / unclaimed suspense account, voting rights which are frozen etc.', S.NOTE)}</row>`);

  // ── Assemble sheet XML ────────────────────────────────────────────────────────
  const mergeCellsXml = merges.length
    ? '<mergeCells count="' + merges.length + '">' +
      merges.map(m => `<mergeCell ref="${COL[m.s.c]}${m.s.r + 1}:${COL[m.e.c]}${m.e.r + 1}"/>`)
            .join('') +
      '</mergeCells>'
    : '';

  let table3Xml = buildTableIIIXml(holdersByPublicCode, totalShares, convTotal);
  table3Xml = restyleByTemplate(table3Xml, t3Style.ids, TABLE_III_TEMPLATE, { holderTemplate: TABLE_III_HOLDER_TEMPLATE });
  addSmall('xl/worksheets/sheet2.xml', table3Xml);
  let table4Xml = buildTableIVXml(holdersByNonPublicCode, totalShares, convTotal);
  table4Xml = restyleByTemplate(table4Xml, t4Style.ids, TABLE_IV_TEMPLATE, { holderTemplate: TABLE_IV_HOLDER_TEMPLATE });
  addSmall('xl/worksheets/sheet3.xml', table4Xml);

  // ── Table I: aggregate totals from Tables II / III / IV ───────────────────────
  const t1Rows = {
    A:  fromTableII(arrayToLetters(
          aggregateArr([...holdersByCode.values()].flat(), totalShares, '', null, convTotal))),
    B:  fromTableIIIorIV(arrayToLetters(
          t3AggArr([...holdersByPublicCode.values()].flat(), totalShares, '', null, convTotal))),
    C1: fromTableIIIorIV(arrayToLetters(
          t3AggArr(holdersByNonPublicCode.get('C1') || [], totalShares, '', null, convTotal))),
    C2: fromTableIIIorIV(arrayToLetters(
          t3AggArr(holdersByNonPublicCode.get('C2') || [], totalShares, '', null, convTotal))),
  };
  addSmall('xl/worksheets/sheet4.xml', buildTableIXml({ rows: t1Rows, totalShares, convTotal, styleIds: t1StyleIds, strCell }));
  const tblData = shpTableData ?? {};
  addSmall('xl/worksheets/sheet5.xml', buildDashboardXml(entityInfo, t1Rows, tblData['V']));

  addSmall('xl/worksheets/sheet6.xml', buildAncillarySheetXml('II-A',  tblData['II-A'],  ancSid));
  addSmall('xl/worksheets/sheet7.xml', buildAncillarySheetXml('III-A', tblData['III-A'], ancSid));
  addSmall('xl/worksheets/sheet8.xml', buildAncillarySheetXml('III-B', tblData['III-B'], ancSid));
  addSmall('xl/worksheets/sheet9.xml',  buildAnnexureAXml(annexARows, annexSid));
  addSmall('xl/worksheets/sheet10.xml', buildAnnexureBXml(annexBData, annexBSid[0], annexBSid[1], annexSid[0]));
  addSmall('xl/worksheets/sheet11.xml', buildTableVXml(tblData['V'], ancSid, t5Sid));

  let table2Xml =
    XML_HEAD +
    `<worksheet xmlns="${NS}">` +
    colsXml +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    '<sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" formatRows="0"/>' +
    mergeCellsXml +
    '</worksheet>';
  table2Xml = restyleTableII(table2Xml, t2StyleIds);
  addSmall('xl/worksheets/sheet1.xml', table2Xml);

  zip.end();
  if (zipErr) throw zipErr;
  return new Blob(chunks, { type: MIME });
}
