import api from './api/axios';

// Map<issuerCode, Map<PAN, promoterType>>  — module-level, reset before each export.
const _cache = new Map();

export function resetPromoterCache() {
  _cache.clear();
}

// Fetch promoter data for the given issuerCodes in chunks of 50.
// Populates _cache; safe to call with an empty array (no-op).
export async function loadPromoters(issuerCodes) {
  if (!issuerCodes.length) return;
  const CHUNK = 50;
  for (let i = 0; i < issuerCodes.length; i += CHUNK) {
    const chunk = issuerCodes.slice(i, i + CHUNK);
    const res = await api.get('/admin/v1/promoter-master/bulk', {
      params: { issuers: chunk.join(',') },
    });
    for (const p of res.data?.data?.promoters ?? []) {
      const pan = String(p.pan ?? '').trim().toUpperCase();
      if (!pan) continue;
      if (!_cache.has(p.issuerCode)) _cache.set(p.issuerCode, new Map());
      _cache.get(p.issuerCode).set(pan, p.promoterType);
    }
  }
}

// Sync lookup. isin.slice(3,7) is the issuerCode.
// Returns promoterType string or null (null = no data → caller keeps existing value).
export function getPromoterType(isin, pan) {
  if (!isin || !pan) return null;
  const issuerCode = String(isin).slice(3, 7);
  const panNorm = String(pan).trim().toUpperCase();
  return _cache.get(issuerCode)?.get(panNorm) ?? null;
}
