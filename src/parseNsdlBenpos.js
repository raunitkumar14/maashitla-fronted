import JSZip from 'jszip';

export const BENPOS_NSDL_FIELDS = [
  'recordType', 'lineNumber', 'dpId', 'beneficiaryAccountNumber', 'beneficiaryType',
  'beneficiarySubType', 'beneficiaryAccountCategory', 'beneficiaryOccupation', 'firstHolderName', 'firstHolderFatherHusbandName',
  'beneficiaryAddress1', 'beneficiaryAddress2', 'beneficiaryAddress3', 'beneficiaryAddress4', 'beneficiaryPinCode',
  'beneficiaryPhoneNumber', 'beneficiaryFaxNumber', 'secondHolderName', 'secondHolderFatherHusbandName', 'thirdHolderName',
  'thirdHolderFatherHusbandName', 'filler1', 'filler2', 'firstHolderPan', 'secondHolderPan',
  'thirdHolderPan', 'nomineeGuardianIndicator', 'nomineeGuardianName', 'nomineeGuardianAddress1', 'nomineeGuardianAddress2',
  'nomineeGuardianAddress3', 'nomineeGuardianAddress4', 'nomineeGuardianPinCode', 'minorDateOfBirth', 'minorIndicator',
  'beneficiaryBankAccountNumber', 'bankNameAndBranch', 'bankAddress1', 'bankAddress2', 'bankAddress3',
  'bankAddress4', 'bankAddressPinCode', 'rbiReferenceNumber', 'rbiApprovalDate', 'sebiRegistrationNumber',
  'beneficiaryTaxDeductionStatus', 'beneficiaryStatus', 'beneficiaryFreePositions', 'beneficiaryLockInPositions', 'beneficiaryBlockPositions',
  'beneficiaryPledgedPositions', 'beneficiaryPledgedWithLockInPositions', 'beneficiaryPledgedUnconfirmedPositions', 'beneficiaryUnconfirmedPledgedWithLockInPositions', 'beneficiaryRematPositions',
  'beneficiaryRematLockInPositions', 'beneficiaryCmIddPositions', 'cmPoolPositions', 'ccSettlementPositions', 'micrCode',
  'ifsc', 'bankAccountType', 'filler3', 'firstHolderMapinId', 'secondHolderMapinId',
  'thirdHolderMapinId', 'firstHolderEmailId', 'secondHolderEmailId', 'thirdHolderEmailId', 'rgessFlag',
  'beneficiaryFreePositionsHoldNdu', 'beneficiaryLockInPositionsHoldNdu', 'beneficiaryUnconfirmedFreePositionsHoldNdu', 'beneficiaryUnconfirmedLockInPositionsHoldNdu', 'filler4',
];

const FILENAME_PATTERN = /BENPOS_FULL_DTL_([A-Z0-9]+)_(\d{2}-[A-Z]{3}-\d{2})_/;

/*
 * parseNsdlBenpos — unzips an NSDL BenPos zip and parses every per-ISIN .txt file.
 *
 * Files are named BENPOS_FULL_DTL_<ISIN>_<DD-MMM-YY>_<timestamp>.txt.
 * Only lines whose first "##"-delimited field equals "02" are data rows.
 * Each row is mapped to 75 positional fields; isin, date, and dpBenIsinDate are
 * appended from the filename so they are always present.
 */
export async function parseNsdlBenpos(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const txtFiles = Object.values(zip.files)
    .filter(f => !f.dir && FILENAME_PATTERN.test(f.name));

  if (txtFiles.length === 0) {
    throw new Error(
      'No matching NSDL BenPos files found in zip ' +
      '(expected BENPOS_FULL_DTL_<ISIN>_<DD-MMM-YY>_<timestamp>.txt).'
    );
  }

  const allRecords = [];

  for (const entry of txtFiles) {
    const match = entry.name.match(FILENAME_PATTERN);
    if (!match) continue;
    const isin = match[1];
    const date = match[2];

    const text  = await entry.async('string');
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim()) continue;
      const rawFields = line.split('##');
      if (rawFields[0] !== '02') continue;

      // Pad or trim to exactly 75 fields
      const fields = rawFields.slice(0, 75);
      while (fields.length < 75) fields.push('');

      const row = {};
      for (let i = 0; i < BENPOS_NSDL_FIELDS.length; i++) {
        row[BENPOS_NSDL_FIELDS[i]] = fields[i] ?? '';
      }

      row.isin          = isin;
      row.date          = date;
      row.dpBenIsinDate = `${row.dpId}_${row.beneficiaryAccountNumber}_${isin}_${date}`;

      allRecords.push(row);
    }
  }

  return { records: allRecords, fileCount: txtFiles.length };
}
