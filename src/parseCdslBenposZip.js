import JSZip from 'jszip';

export const BENPOS_CDSL_FIELDS = [
  'isin', 'beneficiaryOwnerAcNo', 'firstHolderName', 'secondHolderName', 'thirdHolderName',
  'guardianName', 'nomineeName', 'fatherHusbandName', 'sexOfFirstHolder', 'birthDate',
  'accountStatus', 'boCategory', 'boProduct', 'customerType', 'boSubStatus',
  'occupation', 'panOfFirstHolder', 'panOfSecondHolder', 'panOfThirdHolder', 'boFreezeFlag',
  'freezeReasonCode', 'isinStatus', 'acOpeningDate', 'sebiRegistrationNo', 'stockExchangeId',
  'clearingHouseCorporationId', 'cmId', 'tradingId', 'rbiRegistrationNo', 'rbiApprovalDate',
  'taxDeductionStatus', 'nationality', 'boCorrespondenceAddress1', 'boCorrespondenceAddress2', 'boCorrespondenceAddress3',
  'boCorrespondenceCity', 'boCorrespondenceState', 'boCorrespondenceCountry', 'boCorrespondencePinCode', 'boPermanentAddress1',
  'boPermanentAddress2', 'boPermanentAddress3', 'boPermanentCity', 'boPermanentState', 'boPermanentCountry',
  'boPermanentPinCode', 'primaryMobileNumber', 'secondaryTelephoneNumber', 'boFaxNumber', 'primaryEmail',
  'ecsMandateFlag', 'dividendMicrNo', 'dividendBankIfsc', 'bankName', 'bankAddress1',
  'bankAddress2', 'bankAddress3', 'bankAddressCity', 'bankAddressState', 'bankAddressCountry',
  'bankAddressZip', 'dividendBankCurrency', 'dividendBankAccountType', 'dividendBankAccountNumber', 'totalHolding',
  'totalLockIn', 'pledgeBalance', 'safeKeepBalance', 'earmarkBalance', 'pendingRematConfirmation',
  'freeBalance', 'pendingDematVerification', 'pendingDematConfirmation', 'dateOfBenpos', 'pledgeSetupBalance',
  'rematAgainstLockInBalance', 'annualReportFlag', 'uidOfFirstHolder', 'uidOfSecondHolder', 'uidOfThirdHolder',
  'panOfGuardian', 'uidOfGuardian', 'custodianPmsEmail', 'legalEntityIdentifier', 'filler1',
  'filler2', 'boRgessFlag', 'modeOfOperation', 'communicationPreference', 'filler3',
  'filler4', 'nomineeGuardianName', 'nomineeRelationshipWithBo', 'nomineePercentageOfShares', 'secondNomineeName',
  'secondNomineeGuardianName', 'secondNomineeRelationshipWithBo', 'secondNomineePercentageOfShares', 'thirdNomineeName', 'thirdNomineeGuardianName',
  'thirdNomineeRelationshipWithBo', 'thirdNomineePercentageOfShares', 'nduBalance', 'otherEncumberedBalance',
];

/*
 * parseCdslBenposZip — unzips a CDSL BenPos zip file and parses every part file.
 *
 * Part files live at any folder depth inside the zip and are named with a
 * numeric suffix (.1, .2, .3 …). We collect all of them, sort by that suffix
 * so they are processed in order, then parse each line as 104 tilde-separated
 * fields (no header row).
 */
export async function parseCdslBenposZip(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const partFiles = Object.values(zip.files)
    .filter(f => !f.dir && /\.\d+$/.test(f.name))
    .sort((a, b) => {
      const numA = parseInt(a.name.match(/\.(\d+)$/)[1], 10);
      const numB = parseInt(b.name.match(/\.(\d+)$/)[1], 10);
      return numA - numB;
    });

  if (partFiles.length === 0) {
    throw new Error('No part files found in zip (expected files with numeric suffix like .1, .2, …).');
  }

  const allRecords = [];

  for (const entry of partFiles) {
    const text  = await entry.async('string');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const values = line.split('~');
      // Lines shorter than 104 fields are header/footer markers — skip them.
      if (values.length < BENPOS_CDSL_FIELDS.length) continue;
      const row = {};
      for (let i = 0; i < BENPOS_CDSL_FIELDS.length; i++) {
        row[BENPOS_CDSL_FIELDS[i]] = values[i] ?? '';
      }
      row.beneficiaryIsinDate =
        `${row.isin}_${row.beneficiaryOwnerAcNo}_${row.dateOfBenpos}`;
      allRecords.push(row);
    }
  }

  return { records: allRecords, fileCount: partFiles.length };
}
