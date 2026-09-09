import { ISIN_COLUMNS } from './isinColumns';

/*
 * Reusing ISIN_COLUMNS here guarantees the parser always interprets
 * field positions in exactly the same order as the table renders them.
 * If a column is ever reordered or renamed in isinColumns.js, both the
 * table and the parser change in lockstep — there is no second list to
 * keep in sync.
 */

const DATE_FIELDS = new Set([
  'sebiRegistrationFromDate',
  'sebiRegistrationToDate',
  'expiryDate',
  'redemptionDate',
  'closeDate',
  'issueDate',
  'conversionDate',
  'moneyDueDate',
]);

/*
 * "0"/"1" strings in the file represent boolean flags.
 * We convert them so downstream code can use strict equality (=== true)
 * rather than coercing "0" (a truthy string!) to a boolean by accident.
 */
const FLAG_FIELDS = new Set([
  'holdDematFlag',
  'holdRematFlag',
  'distinctRangeExists',
  'isinComplete',
]);

/*
 * These fields carry numeric values that may be used in calculations
 * or comparisons (price filters, lot-size checks, etc.).
 * All others are codes or free-text and stay as strings.
 */
const NUMBER_FIELDS = new Set([
  'marketLot',
  'parValue',
  'paidupValue',
  'redemptionPrice',
  'closePrice',
  'closePriceDecimalIndicator',
  'isinDecimalCode',
]);

const MONTH_INDEX = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/*
 * Converts "DD-MON-YYYY" (CDSL date format) to ISO "YYYY-MM-DD".
 * Returns null for empty/unrecognised values so the field is clearly absent,
 * not a junk string like "" or "undefined".
 */
function parseCdslDate(raw) {
  if (!raw) return null;
  const parts = raw.split('-');
  if (parts.length !== 3) return null;
  const [dd, mon, yyyy] = parts;
  const mm = MONTH_INDEX[mon.toUpperCase()];
  if (!mm) return null;
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
}

/*
 * parseCdslFile — converts raw CDSL ISIN Master text to an array of records.
 *
 * File format:
 *   • One record per line (CRLF or LF endings both accepted).
 *   • Fields separated by "~".
 *   • Consecutive tildes (~~) represent a null/empty field at that position.
 *     A plain split('~') handles this correctly: splitting "a~~b" on "~"
 *     yields ["a", "", "b"] — the empty string lands at the right index
 *     without shifting any subsequent field. No special pre-processing needed.
 *   • Each line ends with a trailing "~", producing one extra empty element
 *     at the end of the split array — we ignore it because we only iterate
 *     over ISIN_COLUMNS (87 entries), stopping before that phantom element.
 *
 * TODO: once the backend endpoint is ready, call it here (or in the caller):
 *
 *   import axios from 'axios';
 *   // After parsing:
 *   await axios.post('/api/isin-master/cdsl/import', { records });
 *
 * For now the function is pure — it only parses; the caller stores the result.
 */
export function parseCdslFile(fileText) {
  const lines = fileText
    .split(/\r?\n/)           // handle both CRLF (Windows) and LF (Unix)
    .filter((l) => l.trim()); // drop blank lines (e.g. trailing newline at EOF)

  return lines.map((line) => {
    /*
     * split('~') is all we need. Consecutive tildes produce '' at the
     * correct array index, preserving every subsequent field's position.
     * Example: "A~~C".split('~') → ['A', '', 'C']  ← field 1 is empty, field 2 is 'C'.
     * If we had pre-replaced '~~' with some sentinel first, we'd need to
     * reverse the substitution — unnecessary complexity.
     */
    const fields = line.split('~');

    const record = {};
    ISIN_COLUMNS.forEach((col, i) => {
      const raw = fields[i] ?? ''; // fields beyond the 87 we expect stay ''

      if (DATE_FIELDS.has(col.field)) {
        record[col.field] = parseCdslDate(raw);
      } else if (FLAG_FIELDS.has(col.field)) {
        record[col.field] = raw === '1';
      } else if (NUMBER_FIELDS.has(col.field)) {
        const n = parseFloat(raw);
        record[col.field] = isNaN(n) ? null : n;
      } else {
        record[col.field] = raw;
      }
    });

    return record;
  });
}
