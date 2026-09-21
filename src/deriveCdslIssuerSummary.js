/*
 * deriveCdslIssuerSummary — collapses a flat array of 87-field CDSL ISIN records
 * (output of parseCdslFile) into one row per issuer, containing 19 fields.
 *
 * This mirrors a pandas pipeline that looks like:
 *
 *   df = df[df['rta_id'] == 381]                       # filter
 *   df['issuer_code'] = df['isin_alpha_code'].str[3:7]  # derive key
 *   df['total_isin']  = df.groupby('issuer_code')['issuer_code'].transform('count')
 *   df = df.drop_duplicates(subset='issuer_code', keep='first')
 *   df = df[ISSUER_FIELDS + ['issuer_code', 'total_isin']]
 *
 * All output values are converted to String so the backend receives a uniform
 * shape with no null / boolean / number surprises.
 */

// The 17 issuer-level fields copied verbatim from each filtered record.
// Every ISIN belonging to the same issuer carries identical values for all 17 —
// only issuerCode and totalIsin differ, which is why deduplication is safe.
const ISSUER_FIELDS = [
  'issuerId',
  'issuerName',
  'issuerAddress1',
  'issuerAddress2',
  'issuerAddress3',
  'issuerCity',
  'issuerState',
  'issuerCountry',
  'issuerZipCode',
  'issuerPhone1',
  'issuerPhone2',
  'issuerEmail',
  'issuerContactPersonName',
  'contactPersonDesignation',
  'contactPersonPhone1',
  'contactPersonPhone2',
  'contactPersonEmail',
];

export function deriveCdslIssuerSummary(records) {
  // ── Step 1: FILTER ──────────────────────────────────────────────────────────
  // Keep only records where rtaId is 381 (our RTA).
  // parseCdslFile stores rtaId as a string (it is not in NUMBER_FIELDS), so we
  // coerce to Number before comparing — Number('381') === 381 is true.
  const filtered = records.filter((r) => Number(r.rtaId) === 381);

  // ── Step 2: DERIVE issuerCode ───────────────────────────────────────────────
  // Characters at index 3–6 of the ISIN alpha code identify the issuer.
  // e.g. "INE123A01011".slice(3, 7) → "123A"  (4 chars, 0-indexed positions 3,4,5,6)
  // isinAlphaCode itself will NOT appear in the final output.
  const withCode = filtered.map((r) => ({
    ...r,
    issuerCode: r.isinAlphaCode.slice(3, 7),
  }));

  // ── Step 3: COUNT occurrences per issuerCode (= totalIsin) ─────────────────
  // Equivalent to pandas groupby('issuer_code').size().
  // We build a plain object {issuerCode: count} so the lookup in step 5 is O(1).
  const countByCode = {};
  withCode.forEach((r) => {
    countByCode[r.issuerCode] = (countByCode[r.issuerCode] ?? 0) + 1;
  });

  // ── Step 4: DEDUPLICATE — keep first record per unique issuerCode ───────────
  // Equivalent to pandas drop_duplicates(subset='issuer_code', keep='first').
  // All 17 issuer-level fields are identical across every ISIN of the same issuer,
  // so the first occurrence carries the full picture — subsequent ones are redundant.
  const seen = new Set();
  const deduped = withCode.filter((r) => {
    if (seen.has(r.issuerCode)) return false;
    seen.add(r.issuerCode);
    return true;
  });

  // ── Step 5: BUILD final 19-field output rows ────────────────────────────────
  // Field order: issuerCode first, then the 17 issuer fields, then totalIsin.
  // String() wraps every value so the backend always receives strings.
  // null values (e.g. from empty date fields) become '' via the ?? '' guard
  // before String() — String(null) would produce the literal "null", not an
  // empty string, which would confuse downstream consumers.
  return deduped.map((r) => {
    const row = { issuerCode: String(r.issuerCode) };

    ISSUER_FIELDS.forEach((field) => {
      row[field] = String(r[field] ?? '');
    });

    // totalIsin: how many ISINs belong to this issuer in the filtered dataset
    row.totalIsin = String(countByCode[r.issuerCode]);

    return row;
  });
}
