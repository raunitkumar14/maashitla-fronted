/*
 * mergeIsinMaster — joins CDSL and NSDL ISIN row arrays into a single merged set.
 *
 * cdslRows: output of deriveCdslIsinTable()  — key field: isinAlphaCode
 * nsdlRows: output of deriveNsdlIsinTable()  — key field: isin
 *
 * Returns { merged: MergedIsinRecord[], counts: { nsdlOnly, cdslOnly, both } }
 * where each MergedIsinRecord has exactly the fields the backend's /isins/bulk
 * endpoint expects (no issuerCode — the backend derives it from isin).
 *
 * Merge rules:
 *   - Union of all ISINs from both sources.
 *   - isinDescription: NSDL's derived value (`${issuerName} ${isinShortName}`) wins;
 *     CDSL's native raw "ISIN Description" column is used only when NSDL has no value.
 *   - securityType: NSDL raw code wins → mapped to description; CDSL text is fallback.
 *   - faceValue: NSDL wins when non-blank; else CDSL.
 *   - isinStatus: CDSL's isinStatusDescription (human-readable, no mapping needed).
 *   - paidupValue, issueDateCdsl, convertDateCdsl: CDSL row only.
 *   - issueDateNsdl, maturityDate, convertDateNsdl, isinStatusNsdl (code → description),
 *     isinActivationDateNsdl: NSDL row only — blank when NSDL row is absent.
 *   - source: "NSDL" | "CDSL" | "NSDL/CDSL".
 */

// NSDL fixed-width files store security type as a 2-char code.
const NSDL_SECURITY_TYPE = {
  '01': 'EQUITY SHARES',
  '03': 'PREFERENCE SHARES',
  '07': 'COMMERCIAL PAPER',
  '11': 'SECURITISED INSTRUMENT',
  '12': 'DEBENTURE',
  '15': 'WARRANT',
  '18': 'RIGHTS ENTITLEMENT',
  '21': 'ALTERNATIVE INVESTMENT FUND',
};

// NSDL fixed-width files store ISIN status as a 2-char code.
const NSDL_ISIN_STATUS = {
  '01':  'ACTIVE',
  '03':  'BLOCKED DUE TO ACA',
  '04':  'SUSPENDED',
  '05':  'DELETED',
  '101': 'RTA CHANGE',
};

export function mergeIsinMaster(cdslRows, nsdlRows) {
  const cdslMap = new Map();
  for (const row of cdslRows) {
    const key = String(row.isinAlphaCode ?? '').trim().toUpperCase();
    if (key) cdslMap.set(key, row);
  }

  const nsdlMap = new Map();
  for (const row of nsdlRows) {
    const key = String(row.isin ?? '').trim().toUpperCase();
    if (key) nsdlMap.set(key, row);
  }

  const allIsins = new Set([...cdslMap.keys(), ...nsdlMap.keys()]);

  let nsdlOnly = 0;
  let cdslOnly = 0;
  let both     = 0;
  const merged = [];

  for (const isin of allIsins) {
    // Explicit undefined checks — do not rely on truthiness so that a row object
    // that happens to be falsy (impossible in practice but easy to reason about)
    // can never silently suppress a valid lookup.
    const c = cdslMap.get(isin);
    const n = nsdlMap.get(isin);

    const hasC = c !== undefined;
    const hasN = n !== undefined;

    let source;
    if (hasC && hasN) { source = 'NSDL/CDSL'; both++;     }
    else if (hasN)    { source = 'NSDL';       nsdlOnly++; }
    else              { source = 'CDSL';       cdslOnly++; }

    // Read a string field from ONE specific row pointer, scoped to this iteration.
    // Each helper is intentionally bound to only c or only n — never shared —
    // so a missing lookup on one side can never bleed into the other side's fields.
    const fromC = (field) => hasC ? String(c[field] ?? '').trim() : '';
    const fromN = (field) => hasN ? String(n[field] ?? '').trim() : '';

    // NSDL isinDescription is derived in deriveNsdlData as "${issuerName} ${isinShortName}".
    // CDSL isinDescription is the raw native column — no computation, passed through as-is.
    // NSDL wins; fall back to CDSL only when NSDL has no value for this ISIN.
    const isinDescription = fromN('isinDescription') || fromC('isinDescription');

    // securityType — NSDL raw code wins; map code → description.
    // CDSL's securityTypeDescription is already human-readable text (no mapping needed).
    const rawSecurityType = fromN('securityType') || fromC('securityTypeDescription');
    const securityType    = NSDL_SECURITY_TYPE[rawSecurityType] ?? rawSecurityType;

    const faceValue = fromN('faceValue') || fromC('parValue');

    // isinStatusNsdl — map raw 2-char NSDL code → description; warn on unknown codes.
    const rawIsinStatusNsdl = fromN('isinStatusNsdl');
    const isinStatusNsdl    = (() => {
      if (!rawIsinStatusNsdl) return '';
      const mapped = NSDL_ISIN_STATUS[rawIsinStatusNsdl];
      if (mapped !== undefined) return mapped;
      console.warn(`mergeIsinMaster: unrecognised isinStatusNsdl code "${rawIsinStatusNsdl}" for ISIN ${isin}`);
      return rawIsinStatusNsdl;
    })();

    merged.push({
      isin,
      isinDescription,
      securityType,
      // CDSL-only fields — blank when no CDSL row.
      // isinStatus uses isinStatusDescription (human-readable) not the raw code.
      isinStatus:             fromC('isinStatusDescription'),
      faceValue,
      paidupValue:            fromC('paidupValue'),
      issueDateCdsl:          fromC('issueDate'),
      convertDateCdsl:        fromC('conversionDate'),
      // NSDL-only fields — each independently guarded by hasN; blank when no NSDL row
      issueDateNsdl:          fromN('issueDateNsdl'),
      maturityDate:           fromN('maturityDate'),
      convertDateNsdl:        fromN('convertDateNsdl'),
      isinStatusNsdl,
      isinActivationDateNsdl: fromN('isinActivationDateNsdl'),
      source,
    });
  }

  return { merged, counts: { nsdlOnly, cdslOnly, both } };
}
