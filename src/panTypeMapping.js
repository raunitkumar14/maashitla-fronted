// ── PAN type code → description mapping ────────────────────────────────────
// Single table shared by CDSL, NSDL, and Physical (same codes across sources).
// Source: client Excel master file Type_Of_Pan.xlsx.

export const PAN_TYPE = {
  A: 'Association of Persons',
  B: 'Body of Individuals',
  C: 'Corporate',
  E: 'Limited Liability Partnership',
  F: 'Partnership firm',
  // TODO: client master says "Government Agencie"; should it be "Government Agencies"? confirm
  G: 'Government Agencie',
  H: 'Hindu Undivided Family',
  J: 'Artificial Judicial Person',
  L: 'Local Authority',
  P: 'Individual',
  T: 'Trust',
};

// ── Unmapped-code accumulator ─────────────────────────────────────────────────
// Module-level so calls across an entire export build are accumulated.
// Use flushUnmappedPanTypes() to collect and clear — same call pattern as
// flushUnmappedCodes() in occupationGenderMapping.js.

const _unmappedPanType = new Set();

// ── Public helpers ────────────────────────────────────────────────────────────

// Returns the human-readable description for `rawValue`, or the trimmed raw
// value if the code is not in the table.  Empty / null input → null.
// `source` (e.g. 'CDSL', 'NSDL', 'PHYSICAL') is appended to unmapped entries.
export function mapPanType(rawValue, source = '') {
  if (rawValue == null || rawValue === '') return null;
  const key = String(rawValue).trim().toUpperCase();
  if (!key) return null;
  const found = PAN_TYPE[key];
  if (found !== undefined) return found;
  _unmappedPanType.add(source ? `${source}|${key}` : key);
  return String(rawValue).trim() || null;
}

// Returns the accumulated unmapped codes and clears the set.
// Call at the START of a build (ignore return) to discard stale leftovers,
// then at the END to log what the current build encountered.
export function flushUnmappedPanTypes() {
  const codes = [..._unmappedPanType];
  _unmappedPanType.clear();
  return codes;
}
