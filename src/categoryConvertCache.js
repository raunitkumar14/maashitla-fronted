import api from './api/axios';

// Map<issuerCode, Map<"PAN|DEP|TYPE|SUB", { typeDescription, subTypeDescription }>>
// Reset before each export run.
const _cache = new Map();

export function resetCategoryConvertCache() {
  _cache.clear();
}

// Fetch category convert data for the given issuerCodes in chunks of 50.
// Populates _cache; safe to call with an empty array (no-op).
export async function loadCategoryConvert(issuerCodes) {
  if (!issuerCodes.length) return;
  const CHUNK = 50;
  for (let i = 0; i < issuerCodes.length; i += CHUNK) {
    const chunk = issuerCodes.slice(i, i + CHUNK);
    const res = await api.get('/admin/v1/category-convert/bulk', {
      params: { issuers: chunk.join(',') },
    });
    for (const c of res.data?.data?.conversions ?? []) {
      const pan = String(c.pan ?? '').trim().toUpperCase();
      const dep = String(c.srcDepository ?? '').trim().toUpperCase();
      const type = String(c.srcCategoryType ?? '').trim();
      const sub  = String(c.srcCategorySubType ?? '').trim();
      if (!pan || !dep) continue;
      const mapKey = `${pan}|${dep}|${type}|${sub}`;
      if (!_cache.has(c.issuerCode)) _cache.set(c.issuerCode, new Map());
      _cache.get(c.issuerCode).set(mapKey, {
        typeDescription:    c.categoryTypeDescription,
        subTypeDescription: c.categorySubTypeDescription,
      });
    }
  }
}

// Sync lookup: (isin, pan, depository, categoryType, categorySubType) → { typeDescription, subTypeDescription } | null.
// isin.slice(3,7) is the issuerCode. Returns null when not found — caller keeps existing value.
export function getCategoryConvert(isin, pan, depository, type, sub) {
  if (!isin || !pan) return null;
  const issuerCode = String(isin).slice(3, 7);
  const panNorm    = String(pan).trim().toUpperCase();
  const depNorm    = String(depository ?? '').trim().toUpperCase();
  const typeNorm   = String(type ?? '').trim();
  const subNorm    = String(sub ?? '').trim();
  const mapKey = `${panNorm}|${depNorm}|${typeNorm}|${subNorm}`;
  return _cache.get(issuerCode)?.get(mapKey) ?? null;
}
