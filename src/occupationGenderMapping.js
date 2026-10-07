// ── Occupation and gender code → description mappings ────────────────────────
// CDSL and NSDL use SEPARATE namespaces — always look up via the right table.
// Source: client Excel master files.

const CDSL_OCCUPATION = {
  PV:  'Private Sector Service',
  R:   'Retired',
  B:   'Business',
  ST:  'Student',
  H:   'Housewife',
  S:   'Service',
  PS:  'Public Sector Employee',
  P:   'Professional',
  O:   'Others',
  GS:  'Government Service',
  F:   'Farmer',
};

const NSDL_OCCUPATION = {
  '1': 'Service',
  '2': 'Student',
  '3': 'Housewife',
  '4': 'Landlord',
  '5': 'Business',
  '6': 'Professional',
  '7': 'Agriculture',
  '8': 'Others',
};

const GENDER = {
  M: 'Male',
  F: 'Female',
};

// Reverse look-up: 'MALE' → 'Male', 'FEMALE' → 'Female'.
// Used so that physical records that already carry text values are normalised to
// canonical casing without being logged as unmapped.
const GENDER_TEXT = Object.fromEntries(
  Object.values(GENDER).map(v => [v.toUpperCase(), v])
);

// ── Unmapped-code accumulators ────────────────────────────────────────────────
// These are module-level so that mapOccupation / mapGender can record misses
// across an entire export build.  Callers use flushUnmappedCodes() to collect
// and clear them.

const _unmappedOccupation = new Set();
const _unmappedGender     = new Set();

// ── Public helpers ────────────────────────────────────────────────────────────

// Returns the human-readable description for `rawCode`, or the trimmed raw
// value if the code is not in the table.  Empty / null input → null.
// depository must be 'CDSL' or 'NSDL' (anything else falls through to CDSL).
export function mapOccupation(depository, rawCode) {
  if (rawCode == null || rawCode === '') return null;
  const key = String(rawCode).trim().toUpperCase();
  if (!key) return null;
  const table = depository === 'NSDL' ? NSDL_OCCUPATION : CDSL_OCCUPATION;
  const found = table[key];
  if (found !== undefined) return found;
  _unmappedOccupation.add(`${depository}|${key}`);
  return String(rawCode).trim() || null;
}

// Returns 'Male' / 'Female' for M/F codes (case-insensitive).
// Also normalises already-text values ('Male', 'FEMALE', etc.) to canonical
// casing, so physical records that carry text don't show up as unmapped.
// Empty / null input → null.
export function mapGender(rawCode) {
  if (rawCode == null || rawCode === '') return null;
  const trimmed = String(rawCode).trim();
  if (!trimmed) return null;
  const key = trimmed.toUpperCase();
  const fromCode = GENDER[key];
  if (fromCode !== undefined) return fromCode;
  const fromText = GENDER_TEXT[key];
  if (fromText !== undefined) return fromText;
  _unmappedGender.add(key);
  return trimmed;
}

// Returns the accumulated unmapped codes and clears the sets.
// Call at the START of a build (ignore return) to discard cross-call leftovers,
// then call at the END to log what the current build encountered.
export function flushUnmappedCodes() {
  const occupation = [..._unmappedOccupation];
  const gender     = [..._unmappedGender];
  _unmappedOccupation.clear();
  _unmappedGender.clear();
  return { occupation, gender };
}
