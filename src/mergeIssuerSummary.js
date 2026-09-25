/*
 * mergeIssuerSummary — outer-merges CDSL and NSDL issuer summaries into one
 * deduplicated-by-issuerCode list ready for uploadIssuers().
 *
 * cdslIssuerRows  — output of deriveCdslIssuerSummary()   { issuerCode, issuerName,
 *                   issuerId, address/phone/email/signatory fields, totalIsin }
 * nsdlIssuerRows  — output of deriveNsdlCompanyTable()    { issuerCode, issuerName }
 * mergedIsinRows  — output of mergeIsinMaster().merged    { isin, … } (no issuerCode field —
 *                   the backend derives it from isin; we do the same here for the count)
 *
 * Merge rules (mirror the ISIN master's NSDL-wins convention):
 *   issuerName  — NSDL value when present and non-empty; else CDSL.
 *   contact/address/phone/email fields — CDSL only; blank for NSDL-only issuers.
 *   totalIsin   — counted from the final merged ISIN dataset so it is never double-counted.
 *   source      — 'NSDL/CDSL' | 'NSDL' | 'CDSL'.
 */
export function mergeIssuerSummary(cdslIssuerRows, nsdlIssuerRows, mergedIsinRows) {
  const cdslMap = new Map(cdslIssuerRows.map(r => [r.issuerCode, r]));
  const nsdlMap = new Map(nsdlIssuerRows.map(r => [r.issuerCode, r]));

  // Count ISINs per issuerCode from the merged master.
  // mergedIsinRows carry no issuerCode field — derive it the same way the backend does.
  const isinCountMap = new Map();
  for (const row of mergedIsinRows) {
    const code = row.isin ? row.isin.slice(3, 7).toUpperCase() : '';
    if (code) isinCountMap.set(code, (isinCountMap.get(code) ?? 0) + 1);
  }

  const allCodes = new Set([...cdslMap.keys(), ...nsdlMap.keys()]);

  const result = [];
  for (const issuerCode of allCodes) {
    const cdsl  = cdslMap.get(issuerCode);
    const nsdl  = nsdlMap.get(issuerCode);
    const inC   = cdsl !== undefined;
    const inN   = nsdl !== undefined;

    const source = inC && inN ? 'NSDL/CDSL' : inN ? 'NSDL' : 'CDSL';

    const nsdlName  = nsdl?.issuerName?.trim() ?? '';
    const issuerName = nsdlName || (cdsl?.issuerName ?? '');

    result.push({
      issuerCode,
      issuerId:                 cdsl?.issuerId                 ?? '',
      issuerName,
      issuerAddress1:           cdsl?.issuerAddress1           ?? '',
      issuerAddress2:           cdsl?.issuerAddress2           ?? '',
      issuerAddress3:           cdsl?.issuerAddress3           ?? '',
      issuerCity:               cdsl?.issuerCity               ?? '',
      issuerState:              cdsl?.issuerState              ?? '',
      issuerCountry:            cdsl?.issuerCountry            ?? '',
      issuerZipCode:            cdsl?.issuerZipCode            ?? '',
      issuerPhone1:             cdsl?.issuerPhone1             ?? '',
      issuerPhone2:             cdsl?.issuerPhone2             ?? '',
      issuerEmail:              cdsl?.issuerEmail              ?? '',
      issuerContactPersonName:  cdsl?.issuerContactPersonName  ?? '',
      contactPersonDesignation: cdsl?.contactPersonDesignation ?? '',
      totalIsin:                String(isinCountMap.get(issuerCode) ?? 0),
      source,
    });
  }

  return result;
}
