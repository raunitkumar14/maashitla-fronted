import { useState, useEffect } from 'react';
import './IsinMaster.css';
import './BenPos.css';
import UploadModal from './UploadModal';
import api from './api/axios';
import { parseCdslBenposZip } from './parseCdslBenposZip';
import { uploadCdslBenpos } from './uploadCdslBenpos';
import { parseNsdlBenpos } from './parseNsdlBenpos';
import { uploadNsdlBenpos } from './uploadNsdlBenpos';

// ── CDSL table column definitions (105 columns: 104 raw fields + derived) ─────

const CDSL_TABLE_COLS = [
  { header: 'ISIN',                              field: 'isin' },
  { header: 'Beneficiary Owner A/c No.',         field: 'beneficiaryOwnerAcNo' },
  { header: "First Holder's Name",               field: 'firstHolderName' },
  { header: "Second Holder's Name",              field: 'secondHolderName' },
  { header: "Third Holder's Name",               field: 'thirdHolderName' },
  { header: "Guardian's Name",                   field: 'guardianName' },
  { header: "Nominee's Name",                    field: 'nomineeName' },
  { header: 'Father/Husband Name',               field: 'fatherHusbandName' },
  { header: 'Sex of First Holder',               field: 'sexOfFirstHolder' },
  { header: 'Birth Date',                        field: 'birthDate' },
  { header: 'Account Status',                    field: 'accountStatus' },
  { header: 'BO Category',                       field: 'boCategory' },
  { header: 'BO Product',                        field: 'boProduct' },
  { header: 'Customer Type',                     field: 'customerType' },
  { header: 'BO Sub Status',                     field: 'boSubStatus' },
  { header: 'Occupation',                        field: 'occupation' },
  { header: 'PAN of Sole/First Holder',          field: 'panOfFirstHolder' },
  { header: 'PAN of Second Holder',              field: 'panOfSecondHolder' },
  { header: 'PAN of Third Holder',               field: 'panOfThirdHolder' },
  { header: 'BO Freeze Flag',                    field: 'boFreezeFlag' },
  { header: 'Freeze Reason Code',                field: 'freezeReasonCode' },
  { header: 'ISIN Status',                       field: 'isinStatus' },
  { header: 'A/C Opening Date',                  field: 'acOpeningDate' },
  { header: 'SEBI Registration No.',             field: 'sebiRegistrationNo' },
  { header: 'Stock Exchange ID',                 field: 'stockExchangeId' },
  { header: 'Clearing House/Corporation ID',     field: 'clearingHouseCorporationId' },
  { header: 'CM ID',                             field: 'cmId' },
  { header: 'Trading ID',                        field: 'tradingId' },
  { header: 'RBI Registration No.',              field: 'rbiRegistrationNo' },
  { header: 'RBI Approval Date',                 field: 'rbiApprovalDate' },
  { header: 'Tax Deduction Status',              field: 'taxDeductionStatus' },
  { header: 'Nationality',                       field: 'nationality' },
  { header: 'BO Correspondence Address 1',       field: 'boCorrespondenceAddress1' },
  { header: 'BO Correspondence Address 2',       field: 'boCorrespondenceAddress2' },
  { header: 'BO Correspondence Address 3',       field: 'boCorrespondenceAddress3' },
  { header: 'BO Correspondence City',            field: 'boCorrespondenceCity' },
  { header: 'BO Correspondence State',           field: 'boCorrespondenceState' },
  { header: 'BO Correspondence Country',         field: 'boCorrespondenceCountry' },
  { header: 'BO Correspondence Pin Code',        field: 'boCorrespondencePinCode' },
  { header: 'BO Permanent Address 1',            field: 'boPermanentAddress1' },
  { header: 'BO Permanent Address 2',            field: 'boPermanentAddress2' },
  { header: 'BO Permanent Address 3',            field: 'boPermanentAddress3' },
  { header: 'BO Permanent City',                 field: 'boPermanentCity' },
  { header: 'BO Permanent State',                field: 'boPermanentState' },
  { header: 'BO Permanent Country',              field: 'boPermanentCountry' },
  { header: 'BO Permanent Pin Code',             field: 'boPermanentPinCode' },
  { header: 'Primary Mobile Number',             field: 'primaryMobileNumber' },
  { header: 'Secondary Telephone Number',        field: 'secondaryTelephoneNumber' },
  { header: 'BO Fax Number',                     field: 'boFaxNumber' },
  { header: 'Primary Email',                     field: 'primaryEmail' },
  { header: 'ECS Mandate Flag',                  field: 'ecsMandateFlag' },
  { header: 'Dividend MICR No.',                 field: 'dividendMicrNo' },
  { header: 'Dividend Bank IFSC',                field: 'dividendBankIfsc' },
  { header: 'Bank Name',                         field: 'bankName' },
  { header: 'Bank Address 1',                    field: 'bankAddress1' },
  { header: 'Bank Address 2',                    field: 'bankAddress2' },
  { header: 'Bank Address 3',                    field: 'bankAddress3' },
  { header: 'Bank Address City',                 field: 'bankAddressCity' },
  { header: 'Bank Address State',                field: 'bankAddressState' },
  { header: 'Bank Address Country',              field: 'bankAddressCountry' },
  { header: 'Bank Address Zip',                  field: 'bankAddressZip' },
  { header: 'Dividend Bank Currency',            field: 'dividendBankCurrency' },
  { header: 'Dividend Bank Account Type',        field: 'dividendBankAccountType' },
  { header: 'Dividend Bank Account Number',      field: 'dividendBankAccountNumber' },
  { header: 'Total Holding',                     field: 'totalHolding' },
  { header: 'Total Lock-In',                     field: 'totalLockIn' },
  { header: 'Pledge Balance',                    field: 'pledgeBalance' },
  { header: 'Safe Keep Balance',                 field: 'safeKeepBalance' },
  { header: 'Earmark Balance',                   field: 'earmarkBalance' },
  { header: 'Pending Remat Confirmation',        field: 'pendingRematConfirmation' },
  { header: 'Free Balance',                      field: 'freeBalance' },
  { header: 'Pending Demat Verification',        field: 'pendingDematVerification' },
  { header: 'Pending Demat Confirmation',        field: 'pendingDematConfirmation' },
  { header: 'Date of BenPos',                    field: 'dateOfBenpos' },
  { header: 'Pledge Setup Balance',              field: 'pledgeSetupBalance' },
  { header: 'Remat Against Lock-In Balance',     field: 'rematAgainstLockInBalance' },
  { header: 'Annual Report Flag',                field: 'annualReportFlag' },
  { header: 'UID of First Holder',               field: 'uidOfFirstHolder' },
  { header: 'UID of Second Holder',              field: 'uidOfSecondHolder' },
  { header: 'UID of Third Holder',               field: 'uidOfThirdHolder' },
  { header: 'PAN of Guardian',                   field: 'panOfGuardian' },
  { header: 'UID of Guardian',                   field: 'uidOfGuardian' },
  { header: 'Custodian/PMS Email',               field: 'custodianPmsEmail' },
  { header: 'Legal Entity Identifier',           field: 'legalEntityIdentifier' },
  { header: 'Filler 1',                          field: 'filler1' },
  { header: 'Filler 2',                          field: 'filler2' },
  { header: 'BO RGESS Flag',                     field: 'boRgessFlag' },
  { header: 'Mode of Operation',                 field: 'modeOfOperation' },
  { header: 'Communication Preference',          field: 'communicationPreference' },
  { header: 'Filler 3',                          field: 'filler3' },
  { header: 'Filler 4',                          field: 'filler4' },
  { header: 'Nominee Guardian Name',             field: 'nomineeGuardianName' },
  { header: 'Nominee Relationship with BO',      field: 'nomineeRelationshipWithBo' },
  { header: 'Nominee % of Shares',               field: 'nomineePercentageOfShares' },
  { header: 'Second Nominee Name',               field: 'secondNomineeName' },
  { header: 'Second Nominee Guardian Name',      field: 'secondNomineeGuardianName' },
  { header: 'Second Nominee Relationship with BO', field: 'secondNomineeRelationshipWithBo' },
  { header: 'Second Nominee % of Shares',        field: 'secondNomineePercentageOfShares' },
  { header: 'Third Nominee Name',                field: 'thirdNomineeName' },
  { header: 'Third Nominee Guardian Name',       field: 'thirdNomineeGuardianName' },
  { header: 'Third Nominee Relationship with BO', field: 'thirdNomineeRelationshipWithBo' },
  { header: 'Third Nominee % of Shares',         field: 'thirdNomineePercentageOfShares' },
  { header: 'NDU Balance',                       field: 'nduBalance' },
  { header: 'Other Encumbered Balance',          field: 'otherEncumberedBalance' },
  { header: 'Beneficiary ISIN Date',             field: 'beneficiaryIsinDate' },
];

// ── NSDL table column definitions (78 columns: 75 raw + isin + date + dpBenIsinDate) ──

const NSDL_TABLE_COLS = [
  { header: 'Record Type',                                        field: 'recordType' },
  { header: 'Line Number',                                        field: 'lineNumber' },
  { header: 'DP ID',                                              field: 'dpId' },
  { header: 'Beneficiary Account Number',                         field: 'beneficiaryAccountNumber' },
  { header: 'Beneficiary Type',                                   field: 'beneficiaryType' },
  { header: 'Beneficiary Sub Type',                               field: 'beneficiarySubType' },
  { header: 'Beneficiary Account Category',                       field: 'beneficiaryAccountCategory' },
  { header: 'Beneficiary Occupation',                             field: 'beneficiaryOccupation' },
  { header: 'First Holder Name',                                  field: 'firstHolderName' },
  { header: 'First Holder Father/Husband Name',                   field: 'firstHolderFatherHusbandName' },
  { header: 'Beneficiary Address 1',                              field: 'beneficiaryAddress1' },
  { header: 'Beneficiary Address 2',                              field: 'beneficiaryAddress2' },
  { header: 'Beneficiary Address 3',                              field: 'beneficiaryAddress3' },
  { header: 'Beneficiary Address 4',                              field: 'beneficiaryAddress4' },
  { header: 'Beneficiary Pin Code',                               field: 'beneficiaryPinCode' },
  { header: 'Beneficiary Phone Number',                           field: 'beneficiaryPhoneNumber' },
  { header: 'Beneficiary Fax Number',                             field: 'beneficiaryFaxNumber' },
  { header: 'Second Holder Name',                                 field: 'secondHolderName' },
  { header: 'Second Holder Father/Husband Name',                  field: 'secondHolderFatherHusbandName' },
  { header: 'Third Holder Name',                                  field: 'thirdHolderName' },
  { header: 'Third Holder Father/Husband Name',                   field: 'thirdHolderFatherHusbandName' },
  { header: 'Filler 1',                                           field: 'filler1' },
  { header: 'Filler 2',                                           field: 'filler2' },
  { header: 'First Holder PAN',                                   field: 'firstHolderPan' },
  { header: 'Second Holder PAN',                                  field: 'secondHolderPan' },
  { header: 'Third Holder PAN',                                   field: 'thirdHolderPan' },
  { header: 'Nominee/Guardian Indicator',                         field: 'nomineeGuardianIndicator' },
  { header: 'Nominee/Guardian Name',                              field: 'nomineeGuardianName' },
  { header: 'Nominee/Guardian Address 1',                         field: 'nomineeGuardianAddress1' },
  { header: 'Nominee/Guardian Address 2',                         field: 'nomineeGuardianAddress2' },
  { header: 'Nominee/Guardian Address 3',                         field: 'nomineeGuardianAddress3' },
  { header: 'Nominee/Guardian Address 4',                         field: 'nomineeGuardianAddress4' },
  { header: 'Nominee/Guardian Pin Code',                          field: 'nomineeGuardianPinCode' },
  { header: 'Minor Date of Birth',                                field: 'minorDateOfBirth' },
  { header: 'Minor Indicator',                                    field: 'minorIndicator' },
  { header: 'Beneficiary Bank Account Number',                    field: 'beneficiaryBankAccountNumber' },
  { header: 'Bank Name and Branch',                               field: 'bankNameAndBranch' },
  { header: 'Bank Address 1',                                     field: 'bankAddress1' },
  { header: 'Bank Address 2',                                     field: 'bankAddress2' },
  { header: 'Bank Address 3',                                     field: 'bankAddress3' },
  { header: 'Bank Address 4',                                     field: 'bankAddress4' },
  { header: 'Bank Address Pin Code',                              field: 'bankAddressPinCode' },
  { header: 'RBI Reference Number',                               field: 'rbiReferenceNumber' },
  { header: 'RBI Approval Date',                                  field: 'rbiApprovalDate' },
  { header: 'SEBI Registration Number',                           field: 'sebiRegistrationNumber' },
  { header: 'Beneficiary Tax Deduction Status',                   field: 'beneficiaryTaxDeductionStatus' },
  { header: 'Beneficiary Status',                                 field: 'beneficiaryStatus' },
  { header: 'Beneficiary Free Positions',                         field: 'beneficiaryFreePositions' },
  { header: 'Beneficiary Lock-In Positions',                      field: 'beneficiaryLockInPositions' },
  { header: 'Beneficiary Block Positions',                        field: 'beneficiaryBlockPositions' },
  { header: 'Beneficiary Pledged Positions',                      field: 'beneficiaryPledgedPositions' },
  { header: 'Beneficiary Pledged with Lock-In Positions',         field: 'beneficiaryPledgedWithLockInPositions' },
  { header: 'Beneficiary Pledged Unconfirmed Positions',          field: 'beneficiaryPledgedUnconfirmedPositions' },
  { header: 'Beneficiary Unconfirmed Pledged with Lock-In Pos.',  field: 'beneficiaryUnconfirmedPledgedWithLockInPositions' },
  { header: 'Beneficiary Remat Positions',                        field: 'beneficiaryRematPositions' },
  { header: 'Beneficiary Remat Lock-In Positions',                field: 'beneficiaryRematLockInPositions' },
  { header: 'Beneficiary CM IDD Positions',                       field: 'beneficiaryCmIddPositions' },
  { header: 'CM Pool Positions',                                  field: 'cmPoolPositions' },
  { header: 'CC Settlement Positions',                            field: 'ccSettlementPositions' },
  { header: 'MICR Code',                                          field: 'micrCode' },
  { header: 'IFSC',                                               field: 'ifsc' },
  { header: 'Bank Account Type',                                  field: 'bankAccountType' },
  { header: 'Filler 3',                                           field: 'filler3' },
  { header: 'First Holder MAPIN ID',                              field: 'firstHolderMapinId' },
  { header: 'Second Holder MAPIN ID',                             field: 'secondHolderMapinId' },
  { header: 'Third Holder MAPIN ID',                              field: 'thirdHolderMapinId' },
  { header: 'First Holder Email ID',                              field: 'firstHolderEmailId' },
  { header: 'Second Holder Email ID',                             field: 'secondHolderEmailId' },
  { header: 'Third Holder Email ID',                              field: 'thirdHolderEmailId' },
  { header: 'RGESS Flag',                                         field: 'rgessFlag' },
  { header: 'Beneficiary Free Positions Hold NDU',                field: 'beneficiaryFreePositionsHoldNdu' },
  { header: 'Beneficiary Lock-In Positions Hold NDU',             field: 'beneficiaryLockInPositionsHoldNdu' },
  { header: 'Beneficiary Unconfirmed Free Positions Hold NDU',    field: 'beneficiaryUnconfirmedFreePositionsHoldNdu' },
  { header: 'Beneficiary Unconfirmed Lock-In Positions Hold NDU', field: 'beneficiaryUnconfirmedLockInPositionsHoldNdu' },
  { header: 'Filler 4',                                           field: 'filler4' },
  { header: 'ISIN',                                               field: 'isin' },
  { header: 'Date',                                               field: 'date' },
  { header: 'DP Ben ISIN Date',                                   field: 'dpBenIsinDate' },
];

// ── Pagination helpers ────────────────────────────────────────────────────────

function getPageRange(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages       = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd   = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2)          pages.push('...');
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);
  if (windowEnd < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function PaginationBar({ page, perPage, totalCount, totalPages, goto, setPage, setGoto, onGoto }) {
  const first = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const last  = Math.min(page * perPage, totalCount);
  return (
    <div className="im-pagination">
      <span className="pagination-info">
        {totalCount === 0
          ? 'Showing 0 entries'
          : `Showing ${first} to ${last} of ${totalCount} entries`}
      </span>
      <div className="pagination-controls">
        {getPageRange(page, totalPages).map((item, idx) =>
          item === '...'
            ? <span key={`ellipsis-${idx}`} className="page-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`page-btn${item === page ? ' page-btn--active' : ''}`}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            )
        )}
        <span className="goto-label">Go to:</span>
        <input
          className="goto-input"
          type="number"
          min={1}
          max={totalPages}
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

// ── Progress card (shared between CDSL and NSDL upload) ───────────────────────

function UploadProgressCard({ progress }) {
  const processed = progress.phase === 'polling'
    ? progress.recordsBefore + (progress.currentBatchProcessed ?? 0)
    : progress.recordsBefore;
  const pct = progress.totalRecords > 0
    ? Math.min(100, Math.round((processed / progress.totalRecords) * 100))
    : 0;
  return (
    <div className="im-card benpos-progress-card">
      <div className="benpos-progress-header">
        {progress.phase === 'posting'
          ? `⬆ Uploading batch ${progress.batchNum} of ${progress.totalBatches}…`
          : `⏳ Processing batch ${progress.batchNum} of ${progress.totalBatches}…`}
      </div>
      <div className="benpos-progress-counts">
        {progress.phase === 'polling'
          ? `Batch rows: ${(progress.currentBatchProcessed ?? 0).toLocaleString()} / ${(progress.currentBatchTotal ?? 0).toLocaleString()} — Overall: ${processed.toLocaleString()} / ${progress.totalRecords.toLocaleString()} records`
          : `${processed.toLocaleString()} / ${progress.totalRecords.toLocaleString()} records sent`}
      </div>
      <div className="benpos-progress-bar-wrap">
        <div className="benpos-progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}


// ── Main component ────────────────────────────────────────────────────────────

function BenPos() {
  const [company,         setCompany]         = useState('all');
  const [issuer,          setIssuer]          = useState('');
  const [date,            setDate]            = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // ── CDSL upload/parse state ─────────────────────────────────────────────────

  const [cdslParseStatus,    setCdslParseStatus]    = useState(null);
  const [cdslParseMessage,   setCdslParseMessage]   = useState('');
  const [cdslUploadStatus,   setCdslUploadStatus]   = useState(null);
  const [cdslUploadProgress, setCdslUploadProgress] = useState(null);
  const [cdslUploadSummary,  setCdslUploadSummary]  = useState(null);
  const [cdslUploadError,    setCdslUploadError]    = useState('');

  // ── NSDL upload/parse state ─────────────────────────────────────────────────

  const [nsdlParseStatus,    setNsdlParseStatus]    = useState(null);
  const [nsdlParseMessage,   setNsdlParseMessage]   = useState('');
  const [nsdlUploadStatus,   setNsdlUploadStatus]   = useState(null);
  const [nsdlUploadProgress, setNsdlUploadProgress] = useState(null);
  const [nsdlUploadSummary,  setNsdlUploadSummary]  = useState(null);
  const [nsdlUploadError,    setNsdlUploadError]    = useState('');

  // ── View Uploaded Data: shared tab ─────────────────────────────────────────

  const [viewTab, setViewTab] = useState('cdsl');

  // ── View Uploaded Data: CDSL tab state ─────────────────────────────────────

  const [cdslViewPage,       setCdslViewPage]       = useState(1);
  const [cdslViewPerPage,    setCdslViewPerPage]     = useState(25);
  const [cdslViewGoto,       setCdslViewGoto]        = useState('');
  const [cdslViewSearch,     setCdslViewSearch]      = useState('');
  const [cdslViewDebSearch,  setCdslViewDebSearch]   = useState('');
  const [cdslViewData,       setCdslViewData]        = useState([]);
  const [cdslViewTotalCount, setCdslViewTotalCount]  = useState(0);
  const [cdslViewTotalPages, setCdslViewTotalPages]  = useState(0);
  const [cdslViewLoading,    setCdslViewLoading]     = useState(false);
  const [cdslViewError,      setCdslViewError]       = useState('');
  const [cdslViewRefetchKey, setCdslViewRefetchKey]  = useState(0);

  // ── View Uploaded Data: NSDL tab state ─────────────────────────────────────

  const [nsdlViewPage,       setNsdlViewPage]       = useState(1);
  const [nsdlViewPerPage,    setNsdlViewPerPage]     = useState(25);
  const [nsdlViewGoto,       setNsdlViewGoto]        = useState('');
  const [nsdlViewSearch,     setNsdlViewSearch]      = useState('');
  const [nsdlViewDebSearch,  setNsdlViewDebSearch]   = useState('');
  const [nsdlViewData,       setNsdlViewData]        = useState([]);
  const [nsdlViewTotalCount, setNsdlViewTotalCount]  = useState(0);
  const [nsdlViewTotalPages, setNsdlViewTotalPages]  = useState(0);
  const [nsdlViewLoading,    setNsdlViewLoading]     = useState(false);
  const [nsdlViewError,      setNsdlViewError]       = useState('');
  const [nsdlViewRefetchKey, setNsdlViewRefetchKey]  = useState(0);

  // ── Search debounce: CDSL view ────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setCdslViewDebSearch(cdslViewSearch);
      setCdslViewPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [cdslViewSearch]);

  // ── Search debounce: NSDL view ────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setNsdlViewDebSearch(nsdlViewSearch);
      setNsdlViewPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [nsdlViewSearch]);

  // ── Fetch CDSL view data ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCdslViewLoading(true);
      setCdslViewError('');
      try {
        const params = { page: cdslViewPage, pageSize: cdslViewPerPage };
        if (cdslViewDebSearch) params.isin = cdslViewDebSearch;
        const res = await api.get('/admin/v1/benpos-cdsl', { params });
        if (cancelled) return;
        const { items, totalCount, totalPages } = res.data.data;
        setCdslViewData(items);
        setCdslViewTotalCount(totalCount);
        setCdslViewTotalPages(totalPages);
      } catch {
        if (!cancelled) {
          setCdslViewError('Failed to load CDSL BenPos data. Please try again.');
          setCdslViewData([]);
        }
      } finally {
        if (!cancelled) setCdslViewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cdslViewPage, cdslViewPerPage, cdslViewDebSearch, cdslViewRefetchKey]);

  // ── Fetch NSDL view data ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNsdlViewLoading(true);
      setNsdlViewError('');
      try {
        const params = { page: nsdlViewPage, pageSize: nsdlViewPerPage };
        if (nsdlViewDebSearch) params.isin = nsdlViewDebSearch;
        const res = await api.get('/admin/v1/benpos-nsdl', { params });
        if (cancelled) return;
        const { items, totalCount, totalPages } = res.data.data;
        setNsdlViewData(items);
        setNsdlViewTotalCount(totalCount);
        setNsdlViewTotalPages(totalPages);
      } catch {
        if (!cancelled) {
          setNsdlViewError('Failed to load NSDL BenPos data. Please try again.');
          setNsdlViewData([]);
        }
      } finally {
        if (!cancelled) setNsdlViewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [nsdlViewPage, nsdlViewPerPage, nsdlViewDebSearch, nsdlViewRefetchKey]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleDownload() {
    // TODO: wire to API
  }

  async function handleCdslParsed(file) {
    setShowUploadModal(false);
    setCdslParseStatus('parsing');
    setCdslParseMessage('Parsing CDSL BenPos zip file…');
    setCdslUploadStatus(null);
    setCdslUploadSummary(null);
    setCdslUploadError('');
    setCdslUploadProgress(null);

    let records;
    try {
      const { records: parsed, fileCount: fc } = await parseCdslBenposZip(file);
      records = parsed;
      setCdslParseStatus('done');
      setCdslParseMessage(
        `${records.length.toLocaleString()} records parsed from ${fc} file${fc !== 1 ? 's' : ''}.`
      );
    } catch (err) {
      setCdslParseStatus('error');
      setCdslParseMessage(`Parse failed: ${err.message}`);
      return;
    }

    setCdslUploadStatus('uploading');
    try {
      const summary = await uploadCdslBenpos(records, setCdslUploadProgress);
      setCdslUploadSummary(summary);
      setCdslUploadStatus('done');
      setViewTab('cdsl');
      setCdslViewRefetchKey((k) => k + 1);
    } catch (err) {
      setCdslUploadError(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      setCdslUploadStatus('error');
    }
    setCdslUploadProgress(null);
  }

  async function handleNsdlParsed(file) {
    setShowUploadModal(false);
    setNsdlParseStatus('parsing');
    setNsdlParseMessage('Parsing NSDL BenPos zip file…');
    setNsdlUploadStatus(null);
    setNsdlUploadSummary(null);
    setNsdlUploadError('');
    setNsdlUploadProgress(null);

    let records;
    try {
      const { records: parsed, fileCount: fc } = await parseNsdlBenpos(file);
      records = parsed;
      setNsdlParseStatus('done');
      setNsdlParseMessage(
        `${records.length.toLocaleString()} records parsed from ${fc} file${fc !== 1 ? 's' : ''}.`
      );
    } catch (err) {
      setNsdlParseStatus('error');
      setNsdlParseMessage(`Parse failed: ${err.message}`);
      return;
    }

    setNsdlUploadStatus('uploading');
    try {
      const summary = await uploadNsdlBenpos(records, setNsdlUploadProgress);
      setNsdlUploadSummary(summary);
      setNsdlUploadStatus('done');
      setViewTab('nsdl');
      setNsdlViewRefetchKey((k) => k + 1);
    } catch (err) {
      setNsdlUploadError(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      setNsdlUploadStatus('error');
    }
    setNsdlUploadProgress(null);
  }

  // View tab pagination handlers
  function handleCdslViewPerPageChange(e) { setCdslViewPerPage(Number(e.target.value)); setCdslViewPage(1); }
  function handleCdslViewGoto() {
    const t = parseInt(cdslViewGoto, 10);
    if (!isNaN(t) && t >= 1 && t <= cdslViewTotalPages) setCdslViewPage(t);
    setCdslViewGoto('');
  }
  function handleNsdlViewPerPageChange(e) { setNsdlViewPerPage(Number(e.target.value)); setNsdlViewPage(1); }
  function handleNsdlViewGoto() {
    const t = parseInt(nsdlViewGoto, 10);
    if (!isNaN(t) && t >= 1 && t <= nsdlViewTotalPages) setNsdlViewPage(t);
    setNsdlViewGoto('');
  }

  const isBusy =
    cdslParseStatus === 'parsing' || cdslUploadStatus === 'uploading' ||
    nsdlParseStatus === 'parsing' || nsdlUploadStatus === 'uploading';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">BenPos</h1>

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Beneficiary Position</span>
          <button
            className="btn-upload"
            onClick={() => setShowUploadModal(true)}
            disabled={isBusy}
          >
            {isBusy ? '⏳ Processing…' : '↑ UPLOAD'}
          </button>
        </div>

        <div className="benpos-filter-body">
          <div className="benpos-filter-row">
            <div className="benpos-field benpos-field--half">
              <label className="benpos-label">Company</label>
              <select
                className="benpos-select"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="all">All</option>
              </select>
            </div>
            <div className="benpos-field benpos-field--half">
              <label className="benpos-label">Issuer</label>
              <select
                className="benpos-select"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              >
                <option value="">-- Select --</option>
              </select>
            </div>
          </div>

          <div className="benpos-filter-row benpos-filter-row--actions">
            <div className="benpos-field benpos-field--date">
              <label className="benpos-label">Date</label>
              <select
                className="benpos-select"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              >
                <option value="">-- Select --</option>
              </select>
            </div>
            <button
              className="btn-action btn-action--pink benpos-download-btn"
              onClick={handleDownload}
            >
              ↑ DOWNLOAD
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════ CDSL UPLOAD STATUS ════════════════ */}

      {cdslParseStatus === 'parsing' && (
        <div className="im-banner im-banner--info">⏳ {cdslParseMessage}</div>
      )}
      {cdslParseStatus === 'done' && (
        <div className="im-banner im-banner--success">✓ CDSL — {cdslParseMessage}</div>
      )}
      {cdslParseStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ CDSL — {cdslParseMessage}</div>
      )}

      {cdslUploadStatus === 'uploading' && cdslUploadProgress && (
        <UploadProgressCard progress={cdslUploadProgress} />
      )}

      {cdslUploadStatus === 'done' && cdslUploadSummary && (
        <div className="im-banner im-banner--success">
          ✓ CDSL upload complete — {cdslUploadSummary.totalSucceeded.toLocaleString()} succeeded
          {cdslUploadSummary.totalFailed > 0 && `, ${cdslUploadSummary.totalFailed.toLocaleString()} failed`}
          {cdslUploadSummary.errors.length > 0 && (
            <div className="benpos-error-list">
              {cdslUploadSummary.errors.slice(0, 3).map((e, i) => (
                <div key={i} className="benpos-error-item">• {String(e?.message ?? e)}</div>
              ))}
              {cdslUploadSummary.errors.length > 3 && (
                <div className="benpos-error-item">…and {cdslUploadSummary.errors.length - 3} more errors</div>
              )}
            </div>
          )}
        </div>
      )}

      {cdslUploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ CDSL upload failed: {cdslUploadError}</div>
      )}

      {/* ════════════════ NSDL UPLOAD STATUS ════════════════ */}

      {nsdlParseStatus === 'parsing' && (
        <div className="im-banner im-banner--info">⏳ {nsdlParseMessage}</div>
      )}
      {nsdlParseStatus === 'done' && (
        <div className="im-banner im-banner--success">✓ NSDL — {nsdlParseMessage}</div>
      )}
      {nsdlParseStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ NSDL — {nsdlParseMessage}</div>
      )}

      {nsdlUploadStatus === 'uploading' && nsdlUploadProgress && (
        <UploadProgressCard progress={nsdlUploadProgress} />
      )}

      {nsdlUploadStatus === 'done' && nsdlUploadSummary && (
        <div className="im-banner im-banner--success">
          ✓ NSDL upload complete — {nsdlUploadSummary.totalSucceeded.toLocaleString()} succeeded
          {nsdlUploadSummary.totalFailed > 0 && `, ${nsdlUploadSummary.totalFailed.toLocaleString()} failed`}
          {nsdlUploadSummary.errors.length > 0 && (
            <div className="benpos-error-list">
              {nsdlUploadSummary.errors.slice(0, 3).map((e, i) => (
                <div key={i} className="benpos-error-item">• {String(e?.message ?? e)}</div>
              ))}
              {nsdlUploadSummary.errors.length > 3 && (
                <div className="benpos-error-item">…and {nsdlUploadSummary.errors.length - 3} more errors</div>
              )}
            </div>
          )}
        </div>
      )}

      {nsdlUploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ NSDL upload failed: {nsdlUploadError}</div>
      )}

      {/* ════════════════ VIEW UPLOADED DATA ════════════════ */}

      <div className="im-card">
        <div className="im-card-header">
          <span>View Uploaded Data</span>
          <label className="entries-label">
            Entries per page
            <select
              className="entries-select"
              value={viewTab === 'cdsl' ? cdslViewPerPage : nsdlViewPerPage}
              onChange={viewTab === 'cdsl' ? handleCdslViewPerPageChange : handleNsdlViewPerPageChange}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>

        {/* Tab toggle */}
        <div className="benpos-tab-row">
          <button
            className={`benpos-tab-btn${viewTab === 'cdsl' ? ' benpos-tab-btn--active' : ''}`}
            onClick={() => setViewTab('cdsl')}
          >
            CDSL Data
          </button>
          <button
            className={`benpos-tab-btn${viewTab === 'nsdl' ? ' benpos-tab-btn--active' : ''}`}
            onClick={() => setViewTab('nsdl')}
          >
            NSDL Data
          </button>
        </div>

        {/* Search */}
        <div className="benpos-search-row">
          {viewTab === 'cdsl' ? (
            <input
              className="im-input"
              placeholder="Search by ISIN…"
              value={cdslViewSearch}
              onChange={(e) => setCdslViewSearch(e.target.value)}
            />
          ) : (
            <input
              className="im-input"
              placeholder="Search by ISIN…"
              value={nsdlViewSearch}
              onChange={(e) => setNsdlViewSearch(e.target.value)}
            />
          )}
        </div>

        {/* Error banners */}
        {viewTab === 'cdsl' && cdslViewError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {cdslViewError}
          </div>
        )}
        {viewTab === 'nsdl' && nsdlViewError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {nsdlViewError}
          </div>
        )}

        {/* CDSL view table */}
        {viewTab === 'cdsl' && (
          <>
            <div className="im-table-wrapper">
              <table className="im-table">
                <thead>
                  <tr>{CDSL_TABLE_COLS.map((col) => <th key={col.field}>{col.header}</th>)}</tr>
                </thead>
                <tbody>
                  {cdslViewLoading ? (
                    <tr>
                      <td className="im-empty-state" colSpan={CDSL_TABLE_COLS.length}>Loading…</td>
                    </tr>
                  ) : cdslViewData.length === 0 ? (
                    <tr>
                      <td className="im-empty-state" colSpan={CDSL_TABLE_COLS.length}>
                        No data available.
                      </td>
                    </tr>
                  ) : (
                    cdslViewData.map((row, idx) => (
                      <tr key={row.beneficiaryIsinDate || idx}>
                        {CDSL_TABLE_COLS.map((col) => (
                          <td key={col.field}>
                            {row[col.field] != null && row[col.field] !== '' ? row[col.field] : '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={cdslViewPage} perPage={cdslViewPerPage}
              totalCount={cdslViewTotalCount} totalPages={cdslViewTotalPages}
              goto={cdslViewGoto} setPage={setCdslViewPage}
              setGoto={setCdslViewGoto} onGoto={handleCdslViewGoto}
            />
          </>
        )}

        {/* NSDL view table */}
        {viewTab === 'nsdl' && (
          <>
            <div className="im-table-wrapper">
              <table className="im-table">
                <thead>
                  <tr>{NSDL_TABLE_COLS.map((col) => <th key={col.field}>{col.header}</th>)}</tr>
                </thead>
                <tbody>
                  {nsdlViewLoading ? (
                    <tr>
                      <td className="im-empty-state" colSpan={NSDL_TABLE_COLS.length}>Loading…</td>
                    </tr>
                  ) : nsdlViewData.length === 0 ? (
                    <tr>
                      <td className="im-empty-state" colSpan={NSDL_TABLE_COLS.length}>
                        No data available.
                      </td>
                    </tr>
                  ) : (
                    nsdlViewData.map((row, idx) => (
                      <tr key={row.dpBenIsinDate || idx}>
                        {NSDL_TABLE_COLS.map((col) => (
                          <td key={col.field}>
                            {row[col.field] != null && row[col.field] !== '' ? row[col.field] : '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={nsdlViewPage} perPage={nsdlViewPerPage}
              totalCount={nsdlViewTotalCount} totalPages={nsdlViewTotalPages}
              goto={nsdlViewGoto} setPage={setNsdlViewPage}
              setGoto={setNsdlViewGoto} onGoto={handleNsdlViewGoto}
            />
          </>
        )}
      </div>

      {/* ── Upload overlay — NSDL + CDSL modals side by side ── */}
      {showUploadModal && (
        <div className="upload-overlay">
          <UploadModal
            title="Upload NSDL Benpos"
            depository="NSDL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleNsdlParsed}
            passRawFile
          />
          <UploadModal
            title="Upload CDSL Benpos"
            depository="CDSL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleCdslParsed}
            passRawFile
          />
        </div>
      )}

    </div>
  );
}

export default BenPos;
