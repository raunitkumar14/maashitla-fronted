/*
 * deriveCdslData — three-stage pipeline for transforming parseCdslFile() output
 * into two separate UI-ready tables.
 *
 * Call order:
 *   const master  = deriveCdslMasterRecords(parsedRecords);
 *   const isinRows    = deriveCdslIsinTable(master);    // Table A
 *   const companyRows = deriveCdslCompanyTable(master); // Table B
 */

// Fields selected for Table A — ISIN level, no dedup
const ISIN_TABLE_FIELDS = [
  'isinAlphaCode',
  'issuerName',               // needed by mergeIsinMaster for isinDescription
  'isinDescription',
  'securityTypeDescription',
  'isinStatusDescription',    // human-readable status; mergeIsinMaster uses this for isinStatus
  'parValue',
  'paidupValue',
  'issueDate',
  'conversionDate',
  'source',
  'issuerCode',
];

// Fields selected for Table B — issuer level, deduped by issuerCode
const COMPANY_TABLE_FIELDS = [
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
  'contactPersonAddress1',
  'contactPersonAddress2',
  'contactPersonEmail',
  'issuerCode',
  'totalIsin',
];

/*
 * deriveCdslMasterRecords — shared first step consumed by both Table A and Table B.
 *
 * Steps (mirrors a pandas pipeline):
 *   1. FILTER    — keep only rtaId === 381 records.
 *                  rtaId is stored as a string by parseCdslFile (not in NUMBER_FIELDS),
 *                  so Number(r.rtaId) === 381 handles the coercion.
 *   2. COUNT     — group by issuerCode, count occurrences → totalIsin per issuer.
 *                  Equivalent to pandas groupby('issuer_code').size().
 *   3. STRINGIFY — every field value becomes a String.
 *                  null values (e.g. empty date fields) are guarded with ?? '' so
 *                  String(null) → "null" is avoided; they become '' instead.
 *   4. ENRICH    — add source = 'CDSL', issuerCode, and totalIsin to each record.
 */
export function deriveCdslMasterRecords(records) {
  // Step 1: filter to our RTA
  const filtered = records.filter((r) => Number(r.rtaId) === 381);

  // Step 2: derive issuerCode (chars 3–6 of the ISIN) and tally per-issuer count
  const countByCode = {};
  filtered.forEach((r) => {
    const code = r.isinAlphaCode.slice(3, 7);
    countByCode[code] = (countByCode[code] ?? 0) + 1;
  });

  // Steps 3 & 4: stringify all existing fields, then attach the three derived fields
  return filtered.map((r) => {
    const issuerCode = r.isinAlphaCode.slice(3, 7);
    const master = {};
    Object.keys(r).forEach((key) => {
      master[key] = String(r[key] ?? '');
    });
    master.source     = 'CDSL';
    master.issuerCode = issuerCode;
    master.totalIsin  = String(countByCode[issuerCode]);
    return master;
  });
}

/*
 * deriveCdslIsinTable — Table A, one row per ISIN.
 *
 * NO deduplication is performed here. Each ISIN is a distinct financial instrument
 * with its own alpha code, status, face value, dates, and security type. Two ISINs
 * issued by the same company are still different securities — collapsing them would
 * hide individual ISIN data and defeat the purpose of this table.
 */
export function deriveCdslIsinTable(masterRecords) {
  return masterRecords.map((r) => {
    const row = {};
    ISIN_TABLE_FIELDS.forEach((field) => {
      row[field] = r[field];
    });
    return row;
  });
}

/*
 * deriveCdslCompanyTable — Table B, one row per issuer.
 *
 * Deduplicated by issuerCode (keep first occurrence only).
 * Every ISIN that belongs to the same issuer carries identical values for all
 * issuer-level fields (address, phone, email, contact person, etc.) — these
 * fields describe the legal entity, not the individual security. Keeping a
 * single representative row per issuer is safe; subsequent rows are exact
 * duplicates of the company-level columns and would only inflate the table.
 * Equivalent to pandas drop_duplicates(subset='issuer_code', keep='first').
 */
export function deriveCdslCompanyTable(masterRecords) {
  const seen = new Set();
  return masterRecords
    .filter((r) => {
      if (seen.has(r.issuerCode)) return false;
      seen.add(r.issuerCode);
      return true;
    })
    .map((r) => {
      const row = {};
      COMPANY_TABLE_FIELDS.forEach((field) => {
        row[field] = r[field];
      });
      return row;
    });
}
