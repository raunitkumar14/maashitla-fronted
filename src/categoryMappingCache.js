import api from './api/axios';

// ── Key normalization ─────────────────────────────────────────────────────────
// Used for physicalByDescription keys so that minor whitespace / casing
// differences between the master sheet and physical shareholder record text
// never break a lookup.

export function normCategoryDesc(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Normalise a category type/subtype code for numeric-equal comparison.
// "01" and "1" both normalise to "1"; non-numeric strings are lowercased only.
export function normCode(s) {
  const t = String(s ?? '').trim();
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? String(n) : t.toLowerCase();
}

// ── Normalise the physicalByDescription section of any map object ─────────────

function normalizePhysicalKeys(map) {
  const phys = map.physicalByDescription;
  if (!phys) return map;
  const out = {};
  for (const [k, v] of Object.entries(phys)) {
    const [t, s = ''] = k.split('|');
    out[`${normCategoryDesc(t)}|${normCategoryDesc(s)}`] = v;
  }
  return { ...map, physicalByDescription: out };
}

// ── Build a map object from the raw API items array ───────────────────────────

function buildCategoryMap(items) {
  // Group CDSL/NSDL items by (depository, categoryType, categorySubType).
  // PHYSICAL rows go into physicalByDescription keyed by their text descriptions.
  const groups = {};          // "DEP|type|sub" -> item[]
  const physicalItems = [];

  for (const item of items) {
    const dep  = String(item.depository    ?? '').trim();
    const type = String(item.categoryType  ?? '').trim();
    const sub  = String(item.categorySubType ?? '').trim();

    if (dep === 'PHYSICAL') {
      physicalItems.push(item);
    } else {
      const key = `${dep}|${type}|${sub}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
  }

  // exact: deduplicate by sorting on categoryKey ascending and taking the first.
  // Several CDSL codes have multiple categoryTypeDescription variants; all share
  // the same categorySubTypeDescription and regulation31TypePublic, so only
  // categoryTypeDescription differs. Taking the smallest categoryKey gives a
  // deterministic result (to be confirmed with the client for those 7 codes).
  const exact = {};
  for (const [key, group] of Object.entries(groups)) {
    group.sort((a, b) =>
      String(a.categoryKey ?? '').localeCompare(
        String(b.categoryKey ?? ''), undefined, { numeric: true }
      )
    );
    const first = group[0];
    exact[key] = {
      categoryTypeDescription:    String(first.categoryTypeDescription    ?? ''),
      categorySubTypeDescription: String(first.categorySubTypeDescription ?? ''),
      regulation31TypePublic:     first.regulation31TypePublic ?? null,
      investorType:               first.investorType ?? null,
      promoter:                   first.promoter ?? null,
      regulation31TypePromoter:   first.regulation31TypePromoter ?? null,
      shpPromoterCode:            first.shpPromoterCode ?? null,
      shpPublicCode:              first.shpPublicCode ?? null,
      foreignOwnership:           first.foreignOwnership ?? null,
    };
  }

  // exactByDescription: keyed by "DEP|normDesc(typeDesc)|normDesc(subTypeDesc)"
  // Allows Category Convert lookups by description when numeric codes are unavailable.
  // Duplicates resolved by sorting by the original exact key, taking first.
  const exactDescGroups = {};
  for (const [exactKey, entry] of Object.entries(exact)) {
    const dep     = exactKey.split('|')[0];
    const descKey = `${dep}|${normCategoryDesc(entry.categoryTypeDescription)}|${normCategoryDesc(entry.categorySubTypeDescription)}`;
    if (!exactDescGroups[descKey]) exactDescGroups[descKey] = [];
    exactDescGroups[descKey].push({ exactKey, entry });
  }
  const exactByDescription = {};
  for (const [descKey, group] of Object.entries(exactDescGroups)) {
    group.sort((a, b) => a.exactKey.localeCompare(b.exactKey, undefined, { numeric: true }));
    exactByDescription[descKey] = group[0].entry;
  }

  // unambiguousByType: "DEP|type" -> description, only when all subtypes of
  // that (dep, type) pair share the same categoryTypeDescription.
  const typeDescSets = {};
  for (const [fullKey, val] of Object.entries(exact)) {
    const [dep, type] = fullKey.split('|');
    const tk = `${dep}|${type}`;
    if (!typeDescSets[tk]) typeDescSets[tk] = new Set();
    typeDescSets[tk].add(val.categoryTypeDescription);
  }
  const unambiguousByType = {};
  for (const [k, descSet] of Object.entries(typeDescSets)) {
    if (descSet.size === 1) unambiguousByType[k] = [...descSet][0];
  }

  // physicalByDescription: keyed by normalised "typeDesc|subTypeDesc"
  const physicalByDescription = {};
  for (const item of physicalItems) {
    const typeDesc = String(item.categoryTypeDescription    ?? '').trim();
    const subDesc  = String(item.categorySubTypeDescription ?? '').trim();
    if (!typeDesc || !subDesc) continue;
    physicalByDescription[`${normCategoryDesc(typeDesc)}|${normCategoryDesc(subDesc)}`] = {
      regulation31TypePublic:   item.regulation31TypePublic ?? null,
      investorType:             item.investorType ?? null,
      promoter:                 item.promoter ?? null,
      regulation31TypePromoter: item.regulation31TypePromoter ?? null,
      shpPromoterCode:          item.shpPromoterCode ?? null,
      shpPublicCode:            item.shpPublicCode ?? null,
      foreignOwnership:         item.foreignOwnership ?? null,
    };
  }

  // physicalByCode: keyed by normCode(categoryType)|normCode(categorySubType)
  // Used as a fallback when the uploaded type/subType are numeric codes, not descriptions.
  const physicalByCode = {};
  for (const item of physicalItems) {
    const type = normCode(item.categoryType    ?? '');
    const sub  = normCode(item.categorySubType ?? '');
    if (!type) continue;
    const key = `${type}|${sub}`;
    if (!physicalByCode[key]) {
      physicalByCode[key] = {
        regulation31TypePublic:   item.regulation31TypePublic ?? null,
        investorType:             item.investorType ?? null,
        promoter:                 item.promoter ?? null,
        regulation31TypePromoter: item.regulation31TypePromoter ?? null,
        shpPromoterCode:          item.shpPromoterCode ?? null,
        shpPublicCode:            item.shpPublicCode   ?? null,
        foreignOwnership:         item.foreignOwnership ?? null,
        categoryTypeDescription:  String(item.categoryTypeDescription ?? ''),
      };
    }
  }

  return { exact, unambiguousByType, physicalByDescription, physicalByCode, exactByDescription };
}

// ── Module-level cache ────────────────────────────────────────────────────────
// _map starts as the bundled fallback (with normalised physical keys) so that
// synchronous callers (Company detail pages) always have data, even before any
// async fetch completes.

let _map     = { exact: {}, unambiguousByType: {}, physicalByDescription: {}, physicalByCode: {}, exactByDescription: {} };
let _promise = null;

export function getCategoryMap() {
  return _map;
}

// loadCategoryMapping() is idempotent: the first call fetches and caches;
// subsequent calls return the same resolved promise immediately.
// Throws if the API call fails or returns an empty list — callers that want
// graceful degradation (screens) should .catch(() => {}) on their own.
export async function loadCategoryMapping() {
  if (_promise) return _promise;
  _promise = (async () => {
    let items;
    try {
      const res = await api.get('/admin/v1/category-mapping');
      items = res.data?.data?.items ?? res.data?.items ?? [];
    } catch (err) {
      _promise = null; // allow retry on next call
      throw new Error('Category mapping could not be loaded. Please try again.');
    }
    if (items.length === 0) {
      _promise = null;
      throw new Error('Category mapping could not be loaded. Please try again.');
    }
    _map = buildCategoryMap(items);
  })();
  return _promise;
}
