import mapping from './benpos_category_mapping.json';

console.log('[mapping] exact keys:', Object.keys(mapping.exact).length,
  '| unambiguous keys:', Object.keys(mapping.unambiguousByType).length,
  '| sample:', Object.keys(mapping.exact).slice(0, 3));

// Log once per depository so the console isn't flooded.
const _debugLogged = new Set();

export function deriveCategoryDescription(depository, categoryType, categorySubType) {
  if (categoryType == null || categoryType === '') return { description: null, subDescription: null, resolved: false };
  const type    = String(categoryType).trim();
  const subType = categorySubType != null && categorySubType !== '' ? String(categorySubType).trim() : null;

  if (!_debugLogged.has(depository)) {
    _debugLogged.add(depository);
    const exactKey = subType ? `${depository}|${type}|${subType}` : null;
    const typeKey  = `${depository}|${type}`;
    console.log(`[derive ${depository}] raw type:`, categoryType, `(${typeof categoryType})`,
      '→ trimmed:', JSON.stringify(type));
    console.log(`[derive ${depository}] raw subType:`, categorySubType, `(${typeof categorySubType})`,
      '→ trimmed:', JSON.stringify(subType));
    if (exactKey) console.log(`[derive ${depository}] exact key: "${exactKey}" →`, mapping.exact[exactKey]);
    console.log(`[derive ${depository}] byType key: "${typeKey}" →`, mapping.unambiguousByType[typeKey]);
  }

  if (subType) {
    const exact = mapping.exact[`${depository}|${type}|${subType}`];
    if (exact) return { description: exact.categoryTypeDescription, subDescription: exact.categorySubTypeDescription, resolved: true };
  }
  const byType = mapping.unambiguousByType[`${depository}|${type}`];
  if (byType) return { description: byType, subDescription: null, resolved: true };
  return { description: null, subDescription: null, resolved: false };
}
