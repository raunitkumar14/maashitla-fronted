// Dropdown options for Corporate Action forms.
// Values extracted from the mockup HTML design files (Chitragupt Corporate Action).
// Only options visible in the mockup are listed here — full NSDL code lists
// must be provided by the backend team and added before production use.

// CA Type: only 'Normal' visible in mockup; full list needed from backend
export const CA_TYPE_OPTIONS = ['Normal'];

// CA Type Code: NSDL corporate action type codes.
// Only '0005 - Rights' is visible in the mockup; full NSDL list needed from backend.
export const CA_TYPE_CODE_OPTIONS = ['0005 - Rights'];

// CA Sub Type: NSDL sub-type codes.
// Only '0023 - Rights Issue' is visible in the mockup; full list needed from backend.
export const CA_SUB_TYPE_OPTIONS = ['0023 - Rights Issue'];

// Indicator: only 'Credit' visible in mockup; additional values (e.g. Debit) needed from backend
export const INDICATOR_OPTIONS = ['Credit'];

// Stamp Duty Payable: only 'Yes' visible in mockup; 'No' and other values needed from backend
export const STAMP_DUTY_PAYABLE_OPTIONS = ['Yes'];

// Calculation of Stamp Duty: two options visible in the mockup
export const CALC_STAMP_DUTY_OPTIONS = [
  '00 - Not applicable',
  '01 - Issued Amount to be considered as consideration for Stamp Duty',
];

// EBP Name: only '00 - Not applicable' visible in mockup; full list needed from backend
export const EBP_NAME_OPTIONS = ['00 - Not applicable'];

// Funds Collected: only '00 - Not applicable' visible in mockup; full list needed from backend
export const FUNDS_COLLECTED_OPTIONS = ['00 - Not applicable'];

export const DEPOSITORY_OPTIONS = ['NSDL', 'CDSL'];
