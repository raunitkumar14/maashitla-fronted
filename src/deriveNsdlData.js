export function deriveNsdlCompanyTable(records) {
  const seen   = new Set();
  const result = [];
  for (const rec of records) {
    const issuerCode = rec.isin ? rec.isin.slice(3, 7).toUpperCase() : '';
    if (!issuerCode || seen.has(issuerCode)) continue;
    seen.add(issuerCode);
    result.push({ issuerCode, issuerName: rec.issuerName ?? '' });
  }
  return result;
}

export function deriveNsdlIsinTable(records) {
  return records.map(rec => {
    const issuerCode = rec.isin ? rec.isin.slice(3, 7).toUpperCase() : '';
    return {
      isin:                   rec.isin                   ?? '',
      isinShortName:          rec.isinShortName          ?? '',
      securityType:           rec.securityType           ?? '',
      issuerName:             rec.issuerName             ?? '',
      issueDateNsdl:          rec.issueDateNsdl          ?? null,
      maturityDate:           rec.maturityDate           ?? null,
      convertDateNsdl:        rec.convertDateNsdl        ?? null,
      faceValue:              rec.faceValue              ?? null,
      isinStatusNsdl:         rec.isinStatusNsdl         ?? '',
      isinActivationDateNsdl: rec.isinActivationDateNsdl ?? null,
      issuerCode,
      source:                 'NSDL',
      isinDescription:        `${rec.issuerName || ''} ${rec.isinShortName || ''}`.trim(),
    };
  });
}
