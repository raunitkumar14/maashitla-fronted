// ── Bank Account Type code → description mapping ─────────────────────────────
// Single table shared by CDSL, NSDL, and Physical (same codes across sources).
// Source: client Excel master file Bank_Account_Type.xlsx.

const BANK_ACCOUNT_TYPE = {
  '10': 'Savings Account',
  '11': 'Current Account',
  '13': 'Cash Credit (CC) Account / OD (Overdraft) Account',
};

// ── Unmapped-code accumulator ─────────────────────────────────────────────────
// Module-level so calls from both the export path and display components are
// accumulated across an entire build.  Use flushUnmappedBankAccountTypes() to
// collect and clear — same call pattern as flushUnmappedCodes() in
// occupationGenderMapping.js.

const _unmappedBankAccountType = new Set();

// ── Public helpers ────────────────────────────────────────────────────────────

// Returns the human-readable description for `rawCode`, or the trimmed raw
// value if the code is not in the table.  Empty / null input → null.
// `source` (e.g. 'CDSL', 'NSDL', 'PHYSICAL') is appended to unmapped entries
// so the caller can see which depository produced an unknown code.
// Lookup strategy:
//   1. Exact match on the trimmed string  ('10', '11', '13').
//   2. If not found, try numeric normalisation (String(Number(v))) to handle
//      leading zeros ('010' → '10') and number primitives (10 → '10').
export function mapBankAccountType(rawCode, source = '') {
  if (rawCode == null || rawCode === '') return null;
  const trimmed = String(rawCode).trim();
  if (!trimmed) return null;

  // 1. Exact match
  const exact = BANK_ACCOUNT_TYPE[trimmed];
  if (exact !== undefined) return exact;

  // 2. Numeric normalisation (leading-zero or number type)
  const num = Number(trimmed);
  if (!isNaN(num)) {
    const normKey = String(num);
    const normed  = BANK_ACCOUNT_TYPE[normKey];
    if (normed !== undefined) return normed;
  }

  _unmappedBankAccountType.add(source ? `${source}|${trimmed}` : trimmed);
  return trimmed;
}

// Returns the accumulated unmapped codes and clears the set.
// Call at the START of a build (ignore return) to discard stale leftovers,
// then at the END to log what the current build encountered.
export function flushUnmappedBankAccountTypes() {
  const codes = [..._unmappedBankAccountType];
  _unmappedBankAccountType.clear();
  return codes;
}
