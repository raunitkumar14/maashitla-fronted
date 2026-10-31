// Parses a date cell from an Excel upload to canonical YYYY-MM-DD.
// Accepts: JS Date object (cellDates:true), DD-MM-YYYY, DD/MM/YYYY,
//          D-M-YYYY, D/M/YYYY, YYYY-MM-DD.
// NIL stays 'NIL' (Table V). Empty becomes ''. Anything else: returned as-is.
export function parseDateCell(val) {
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (s.toUpperCase() === 'NIL') return 'NIL';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (parts) {
    return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return s;
}

// Converts a YYYY-MM-DD string from the API to DD-MM-YYYY for display.
// No timezone shift — interprets the string as a literal date.
export function displayDate(s) {
  if (!s) return '—';
  if (s === 'NIL') return 'NIL';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
  }
  return String(s);
}
