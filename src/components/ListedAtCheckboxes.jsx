export const LISTING_AT_OPTIONS = ['NSE', 'BSE', 'MCX', 'IFSC', 'NSE SME', 'BSE SME'];

// Accepts the raw listingAt value (array, comma-string, or null/undefined).
export function parseListingAt(val) {
  if (Array.isArray(val)) return val;
  const s = String(val ?? '').trim();
  return s ? s.split(',').map(v => v.trim()).filter(Boolean) : [];
}

// selected   – string[] of checked option values
// onChange   – (newSelected: string[]) => void
// disabled   – bool
// legacyNote – string | null; read-only notice rendered below the checkboxes
export function ListedAtCheckboxes({ selected, onChange, disabled, legacyNote }) {
  function toggle(opt) {
    onChange(
      selected.includes(opt)
        ? selected.filter(x => x !== opt)
        : [...selected, opt]
    );
  }
  return (
    <div>
      <div className="im-edit-listing-checkboxes">
        {LISTING_AT_OPTIONS.map(opt => (
          <label key={opt} className="im-listing-cb-label">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              disabled={disabled}
            />
            {opt}
          </label>
        ))}
      </div>
      {legacyNote && (
        <p className="im-listing-legacy-note">{legacyNote}</p>
      )}
    </div>
  );
}
