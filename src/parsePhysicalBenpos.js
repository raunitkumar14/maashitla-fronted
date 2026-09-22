// CSV column names (snake_case) → camelCase keys for the shareholder object
const SHAREHOLDER_FIELD_MAP = {
  folio_isin_incorp_date: 'folioIsinIncorpDate',
  isin:                   'isin',
  folio_no:               'folioNo',
  date_of_incorporation:  'dateOfIncorporation',
  holder1_name:           'holder1Name',
  share_qty:              'shareQty',
  holder1_pan:            'holder1Pan',
  holder1_gender:         'holder1Gender',
  holder1_occupation:     'holder1Occupation',
  holder1_birth_date:     'holder1BirthDate',
  holder1_mobile_no:      'holder1MobileNo',
  holder1_email_id:       'holder1EmailId',
  father_husband_name:    'fatherHusbandName',
  address1:               'address1',
  address2:               'address2',
  address3:               'address3',
  city:                   'city',
  state:                  'state',
  pin_code:               'pinCode',
  country:                'country',
  holder2_name:           'holder2Name',
  holder2_pan:            'holder2Pan',
  holder3_name:           'holder3Name',
  holder3_pan:            'holder3Pan',
  bank_ac_no:             'bankAcNo',
  bank_name:              'bankName',
  account_type:           'accountType',
  ifsc_code:              'ifscCode',
  bank_micr_code:         'bankMicrCode',
  bank_address1:          'bankAddress1',
  bank_address2:          'bankAddress2',
  bank_address3:          'bankAddress3',
  bank_address4:          'bankAddress4',
  bank_address_pin_code:  'bankAddressPinCode',
  nomination_name:        'nominationName',
  relation_with_holder:   'relationWithHolder',
  nomination_pan:         'nominationPan',
  nomination_gender:      'nominationGender',
  nomination_occupation:  'nominationOccupation',
  nomination_birth_date:  'nominationBirthDate',
  nomination_mobile_no:   'nominationMobileNo',
  nomination_email_id:    'nominationEmailId',
  nominee_address1:       'nomineeAddress1',
  nominee_address2:       'nomineeAddress2',
  nominee_address3:       'nomineeAddress3',
  nominee_city:           'nomineeCity',
  nominee_state:          'nomineeState',
  nominee_pin_code:       'nomineePinCode',
  nominee_country:        'nomineeCountry',
  category:               'category',
  sub_category:           'subCategory',
};

// CSV column names (snake_case) → camelCase keys for the shareholding object
const SHAREHOLDING_FIELD_MAP = {
  certificate_no:          'certificateNo',
  folio_isin_incorp_date:  'folioIsinIncorpDate',
  distinctive_number_from: 'distinctiveNumberFrom',
  distinctive_number_to:   'distinctiveNumberTo',
  lock_in_status:          'lockInStatus',
  lock_in_reason:          'lockInReason',
  quantity:                'quantity',
  date_of_issuance:        'dateOfIssuance',
  lock_in_release_date:    'lockInReleaseDate',
};

// ── CSV parser ────────────────────────────────────────────────────────────────
// Single-pass character scanner — handles double-quoted fields containing
// commas and "" escaped quotes correctly.

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row = [];

    while (i < n) {
      let field = '';

      if (text[i] === '"') {
        i++; // skip opening quote
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; } // "" → "
            else { i++; break; }                               // closing quote
          } else {
            field += text[i++];
          }
        }
      } else {
        while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++];
        }
      }

      row.push(field);

      if (i < n && text[i] === ',') {
        i++; // another field follows
      } else {
        break; // newline or EOF — row is complete
      }
    }

    // Consume CRLF or LF
    if (i < n && text[i] === '\r') i++;
    if (i < n && text[i] === '\n') i++;

    // Skip rows where every field is blank (trailing newlines, etc.)
    if (row.some((f) => f !== '')) rows.push(row);
  }

  return rows;
}

// ── Main export ───────────────────────────────────────────────────────────────

/*
 * parsePhysicalBenpos — reads a plain CSV File and produces two arrays:
 *   shareholders  — one object per unique folioIsinIncorpDate (first row wins)
 *   shareholdings — one object per row (every certificate is distinct)
 *
 * Column mapping is header-name driven (case-insensitive, trimmed), so column
 * order in the file doesn't matter.  Unrecognised columns are silently ignored.
 *
 * Returns { shareholders, shareholdings, totalRowsParsed }.
 */
export async function parsePhysicalBenpos(file) {
  let text = await file.text();
  // Strip UTF-8 BOM that Excel sometimes prepends
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = parseCSV(text);
  if (rows.length === 0) throw new Error('File is empty.');

  // Build column-name → array-index map from the header row
  const headerRow = rows[0];
  const colIndex  = {};
  for (let i = 0; i < headerRow.length; i++) {
    colIndex[headerRow[i].trim().toLowerCase()] = i;
  }

  const shareholderMap = new Map(); // keyed by folioIsinIncorpDate — deduplication
  const shareholdings  = [];

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const cols = rows[rowIdx];

    // ── Build shareholder object ─────────────────────────────────────────────
    const sh = {};
    for (const [csvCol, camelKey] of Object.entries(SHAREHOLDER_FIELD_MAP)) {
      const idx    = colIndex[csvCol];
      sh[camelKey] = idx !== undefined ? (cols[idx] ?? '') : '';
    }

    // Deduplicate: keep only the first occurrence of each folioIsinIncorpDate
    const key = sh.folioIsinIncorpDate;
    if (key && !shareholderMap.has(key)) {
      shareholderMap.set(key, sh);
    }

    // ── Build shareholding object ────────────────────────────────────────────
    const holding = {};
    for (const [csvCol, camelKey] of Object.entries(SHAREHOLDING_FIELD_MAP)) {
      const idx         = colIndex[csvCol];
      holding[camelKey] = idx !== undefined ? (cols[idx] ?? '') : '';
    }
    // folioNo is the FK that references BenposPhysicalShareholder.folioIsinIncorpDate
    holding.folioNo = holding.folioIsinIncorpDate;
    shareholdings.push(holding);
  }

  return {
    shareholders:    [...shareholderMap.values()],
    shareholdings,
    totalRowsParsed: rows.length - 1, // header row excluded
  };
}
