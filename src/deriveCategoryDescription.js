import { getCategoryMap } from './categoryMappingCache';

export function deriveCategoryDescription(depository, categoryType, categorySubType) {
  if (categoryType == null || categoryType === '') return { description: null, subDescription: null, resolved: false };
  const mapping = getCategoryMap();
  const type    = String(categoryType).trim();
  const subType = categorySubType != null && categorySubType !== '' ? String(categorySubType).trim() : null;

  if (subType) {
    const exact = mapping.exact[`${depository}|${type}|${subType}`];
    if (exact) return { description: exact.categoryTypeDescription, subDescription: exact.categorySubTypeDescription, resolved: true };
  }
  const byType = mapping.unambiguousByType[`${depository}|${type}`];
  if (byType) return { description: byType, subDescription: null, resolved: true };
  return { description: null, subDescription: null, resolved: false };
}
