import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './BenPos.css';
import './CompanyDetail.css';
import { parsePhysicalBenpos } from './parsePhysicalBenpos';
import { uploadPhysicalBenpos } from './uploadPhysicalBenpos';
import { deriveCategoryDescription } from './deriveCategoryDescription';

// ── Pagination helpers ────────────────────────────────────────────────────────

function getPageRange(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages       = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd   = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2)            pages.push('...');
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
          max={totalPages || 1}
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

// ── Upload progress card (two-phase) ─────────────────────────────────────────

function UploadProgressCard({ progress }) {
  const processed = progress.phase === 'polling'
    ? progress.recordsBefore + (progress.currentBatchProcessed ?? 0)
    : progress.recordsBefore;
  const pct = progress.totalRecords > 0
    ? Math.min(100, Math.round((processed / progress.totalRecords) * 100))
    : 0;
  const phaseLabel = `Phase ${progress.uploadPhase}/2: ${progress.uploadPhaseLabel}`;
  return (
    <div className="im-card benpos-progress-card">
      <div className="benpos-progress-header">
        {progress.phase === 'posting'
          ? `${phaseLabel} — ⬆ Uploading batch ${progress.batchNum} of ${progress.totalBatches}…`
          : `${phaseLabel} — ⏳ Processing batch ${progress.batchNum} of ${progress.totalBatches}…`}
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

// ── Column definitions ────────────────────────────────────────────────────────

const SHAREHOLDER_COLS = [
  { header: 'Folio No.',               field: 'folioNo' },
  { header: 'Date of Incorporation',   field: 'dateOfIncorporation' },
  { header: 'Holder 1 Name',           field: 'holder1Name' },
  { header: 'Share Qty',               field: 'shareQty' },
  { header: 'Holder 1 PAN',            field: 'holder1Pan' },
  { header: 'Holder 1 Gender',         field: 'holder1Gender' },
  { header: 'Holder 1 Occupation',     field: 'holder1Occupation' },
  { header: 'Holder 1 Birth Date',     field: 'holder1BirthDate' },
  { header: 'Holder 1 Mobile',         field: 'holder1MobileNo' },
  { header: 'Holder 1 Email',          field: 'holder1EmailId' },
  { header: 'Father/Husband Name',     field: 'fatherHusbandName' },
  { header: 'Address 1',               field: 'address1' },
  { header: 'Address 2',               field: 'address2' },
  { header: 'Address 3',               field: 'address3' },
  { header: 'City',                    field: 'city' },
  { header: 'State',                   field: 'state' },
  { header: 'Pin Code',                field: 'pinCode' },
  { header: 'Country',                 field: 'country' },
  { header: 'Holder 2 Name',           field: 'holder2Name' },
  { header: 'Holder 2 PAN',            field: 'holder2Pan' },
  { header: 'Holder 3 Name',           field: 'holder3Name' },
  { header: 'Holder 3 PAN',            field: 'holder3Pan' },
  { header: 'Bank A/C No.',            field: 'bankAcNo' },
  { header: 'Bank Name',               field: 'bankName' },
  { header: 'Account Type',            field: 'accountType' },
  { header: 'IFSC Code',               field: 'ifscCode' },
  { header: 'Bank MICR Code',          field: 'bankMicrCode' },
  { header: 'Bank Address 1',          field: 'bankAddress1' },
  { header: 'Bank Address 2',          field: 'bankAddress2' },
  { header: 'Bank Address 3',          field: 'bankAddress3' },
  { header: 'Bank Address 4',          field: 'bankAddress4' },
  { header: 'Bank Address Pin',        field: 'bankAddressPinCode' },
  { header: 'Nominee Name',            field: 'nominationName' },
  { header: 'Relation w/ Holder',      field: 'relationWithHolder' },
  { header: 'Nominee PAN',             field: 'nominationPan' },
  { header: 'Nominee Gender',          field: 'nominationGender' },
  { header: 'Nominee Occupation',      field: 'nominationOccupation' },
  { header: 'Nominee Birth Date',      field: 'nominationBirthDate' },
  { header: 'Nominee Mobile',          field: 'nominationMobileNo' },
  { header: 'Nominee Email',           field: 'nominationEmailId' },
  { header: 'Nominee Address 1',       field: 'nomineeAddress1' },
  { header: 'Nominee Address 2',       field: 'nomineeAddress2' },
  { header: 'Nominee Address 3',       field: 'nomineeAddress3' },
  { header: 'Nominee City',            field: 'nomineeCity' },
  { header: 'Nominee State',           field: 'nomineeState' },
  { header: 'Nominee Pin Code',        field: 'nomineePinCode' },
  { header: 'Nominee Country',         field: 'nomineeCountry' },
  { header: 'Category',                field: 'category' },
  {
    header: 'Category Description',
    field:  'categoryDescription',
    renderFn: (row) => {
      const result = deriveCategoryDescription('PHYSICAL', row.category, row.subCategory);
      if (result.resolved) return result.description ?? '—';
      const raw = String(row.category ?? '').trim();
      if (!raw) return '—';
      return (
        <span title="Category code has multiple possible descriptions - couldn't resolve exactly with available data">
          {raw} ⚠
        </span>
      );
    },
  },
  { header: 'Sub Category',            field: 'subCategory' },
];

const SHAREHOLDING_COLS = [
  { header: 'Certificate No.',         field: 'certificateNo' },
  { header: 'Folio No.',               field: 'folioNo' },
  { header: 'Quantity',                field: 'quantity' },
  { header: 'Dist. No. From',          field: 'distinctiveNumberFrom' },
  { header: 'Dist. No. To',            field: 'distinctiveNumberTo' },
  { header: 'Date of Issuance',        field: 'dateOfIssuance' },
  { header: 'Lock-in Status',          field: 'lockInStatus' },
  { header: 'Lock-in Release Date',    field: 'lockInReleaseDate' },
  { header: 'Lock-in Reason',          field: 'lockInReason' },
];

// ── BenposSection — display-only, rows supplied by parent ────────────────────
// rows = null  → initial loading state (auto-load in progress)
// rows = []    → empty result; emptyMsg is shown
// rows = [...]  → paginated table
function BenposSection({ title, cols, rows, loading, emptyMsg }) {
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [goto,    setGoto]    = useState('');

  // Reset to page 1 whenever the result set changes.
  useEffect(() => { setPage(1); }, [rows]);

  const displayRows = rows ?? [];
  const totalCount  = displayRows.length;
  const totalPages  = Math.max(1, Math.ceil(totalCount / perPage));
  const pageRows    = displayRows.slice((page - 1) * perPage, page * perPage);

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  return (
    <div className="im-card">
      <div className="im-card-header">
        <span>{title}</span>
        <label className="entries-label">
          Entries per page
          <select
            className="entries-select"
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div className="im-table-wrapper">
        <table className="im-table">
          <thead>
            <tr>{cols.map((col) => <th key={col.field}>{col.header}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="im-empty-state" colSpan={cols.length}>Loading…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td className="im-empty-state" colSpan={cols.length}>{emptyMsg ?? 'No records found.'}</td></tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={`${row[cols[0].field] ?? ''}-${idx}`}>
                  {cols.map((col) => <td key={col.field}>{col.renderFn ? col.renderFn(row) : (row[col.field] ?? '—')}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}                               perPage={perPage}
        totalCount={rows === null ? 0 : totalCount} totalPages={rows === null ? 0 : totalPages}
        goto={goto}                               setPage={setPage}
        setGoto={setGoto}                         onGoto={handleGoto}
      />
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

function CompanyPhysical() {
  const { issuerCode } = useParams();
  const location       = useLocation();
  const fileInputRef   = useRef(null);

  // Mirror CompanyLayout.getIsinCode(): prefer navigation state (available on
  // first render, before CompanyLayout's useEffect has written to sessionStorage),
  // then fall back to sessionStorage for direct URL entry / page refresh.
  const isinCode = location.state?.isinCode
    ?? (() => { try { return sessionStorage.getItem(`co_isin_${issuerCode}`) ?? ''; } catch { return ''; } })();

  // ── Combined search inputs ──────────────────────────────────────────────────
  const [folioNoInput,    setFolioNoInput]    = useState('');
  const [holderNameInput, setHolderNameInput] = useState('');
  const [holderPanInput,  setHolderPanInput]  = useState('');
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [searchError,     setSearchError]     = useState('');

  // ── Search result rows ──────────────────────────────────────────────────────
  const [shareholderRows,  setShareholderRows]  = useState(null);
  const [shareholdingRows, setShareholdingRows] = useState(null);

  // ── Upload / parse state ────────────────────────────────────────────────────
  const [parseStatus,    setParseStatus]    = useState(null);
  const [parseMessage,   setParseMessage]   = useState('');
  const [uploadStatus,   setUploadStatus]   = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadSummary,  setUploadSummary]  = useState(null);
  const [uploadError,    setUploadError]    = useState('');

  const isBusy = parseStatus === 'parsing' || uploadStatus === 'uploading';

  // ── Core fetch — shared by auto-load and the Search button ──────────────────
  // extraFilters can add folioNo / holderName / holderPan on top of the base params.
  const fetchData = useCallback(async (extraFilters = {}) => {
    setSearchError('');
    setSearchLoading(true);
    setShareholderRows(null);
    setShareholdingRows(null);

    try {
      const shParams = { pageSize: 500, page: 1 };
      if (issuerCode) shParams.issuerCode = issuerCode;
      if (isinCode)   shParams.isin       = isinCode;
      Object.assign(shParams, extraFilters);

      const shRes = await api.get('/admin/v1/benpos-physical-shareholder', { params: shParams });
      const allShareholders = shRes.data?.data?.items ?? [];
      // Temporary client-side ISIN filter: backend currently ignores the ?isin param.
      // Keep only rows matching this page's ISIN; harmless once the backend filters properly.
      const isinFiltered = isinCode
        ? allShareholders.filter(r => r.isin === isinCode)
        : allShareholders;
      const holderNameQ = extraFilters.holderName?.toLowerCase();
      const holderPanQ  = extraFilters.holderPan?.toLowerCase();
      // Filter out placeholder rows; apply client-side name/PAN filters because
      // the backend currently ignores those query params (same issue as ?isin).
      const shareholders = isinFiltered.filter(r => {
        if (!r.holder1Name?.trim()) return false;
        if (holderNameQ && !r.holder1Name?.toLowerCase().includes(holderNameQ)) return false;
        if (holderPanQ  && !r.holder1Pan?.toLowerCase().includes(holderPanQ))   return false;
        return true;
      });
      setShareholderRows(shareholders);

      // Fetch all shareholdings and filter client-side: the backend doesn't support
      // multi-value folioNo params, and folioIsinIncorpDate is always "folio|isin|date",
      // so matching on the ISIN substring is reliable and needs no backend change.
      const shingRes = await api.get('/admin/v1/benpos-physical-shareholding', {
        params: { pageSize: 500, page: 1 },
      });
      const allShareholdings = shingRes.data?.data?.items ?? [];
      const shareholdings = isinCode
        ? allShareholdings.filter(r => r.folioIsinIncorpDate?.includes(isinCode))
        : allShareholdings;
      setShareholdingRows(shareholdings);

    } catch (err) {
      setSearchError(err.response?.data?.error?.message ?? err.message ?? 'Search failed.');
      setShareholderRows([]);
      setShareholdingRows([]);
    } finally {
      setSearchLoading(false);
    }
  }, [issuerCode, isinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-load on page entry ─────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Search button — re-fetches with any filter inputs the user has typed ────
  function handleSearch() {
    const extra = {};
    if (folioNoInput.trim())    extra.folioNo    = folioNoInput.trim();
    if (holderNameInput.trim()) extra.holderName = holderNameInput.trim();
    if (holderPanInput.trim())  extra.holderPan  = holderPanInput.trim();
    fetchData(extra);
  }

  // ── File picker triggered by UPLOAD button ───────────────────────────────────
  function handleUploadClick() {
    if (!isBusy) fileInputRef.current.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    setParseStatus('parsing');
    setParseMessage('Parsing Physical BenPos CSV file…');
    setUploadStatus(null);
    setUploadSummary(null);
    setUploadError('');
    setUploadProgress(null);

    let shareholders, shareholdings;
    try {
      const result = await parsePhysicalBenpos(file);
      ({ shareholders, shareholdings } = result);
      setParseStatus('done');
      setParseMessage(
        `${shareholders.length.toLocaleString()} shareholders (deduplicated), ` +
        `${shareholdings.length.toLocaleString()} shareholding records parsed`
      );
    } catch (err) {
      setParseStatus('error');
      setParseMessage(`Parse failed: ${err.message}`);
      return;
    }

    setUploadStatus('uploading');
    try {
      const summary = await uploadPhysicalBenpos(shareholders, shareholdings, setUploadProgress);
      setUploadSummary(summary);
      setUploadStatus('done');
      // Reload the table to reflect newly uploaded data
      fetchData();
    } catch (err) {
      setUploadError(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      setUploadStatus('error');
    }
    setUploadProgress(null);
  }

  // ── Empty-state messages ────────────────────────────────────────────────────
  const hasFilters = folioNoInput.trim() || holderNameInput.trim() || holderPanInput.trim();
  const shEmptyMsg  = hasFilters
    ? 'No shareholders match these filters.'
    : 'No physical records found for this ISIN.';
  const shingEmptyMsg = hasFilters
    ? 'No shareholding records match these filters.'
    : 'No physical shareholding records found for this ISIN.';

  return (
    <div className="isin-master">

      {/* ── Combined search + upload card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Physical</span>
          <div className="im-header-actions">
            <button className="btn-action btn-action--white">⬇ Sample</button>
            <button
              className="btn-upload"
              onClick={handleUploadClick}
              disabled={isBusy}
            >
              {isBusy ? '⏳ Processing…' : '↑ UPLOAD'}
            </button>
          </div>
        </div>

        <div className="cp-filter-body">
          <div className="cp-filter-row">
            <div className="benpos-field cp-search-field">
              <label className="benpos-label">Folio No</label>
              <input
                className="cp-folio-input"
                value={folioNoInput}
                onChange={(e) => setFolioNoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="benpos-field cp-search-field">
              <label className="benpos-label">Holder Name</label>
              <input
                className="cp-folio-input"
                value={holderNameInput}
                onChange={(e) => setHolderNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="benpos-field cp-search-field">
              <label className="benpos-label">Holder PAN</label>
              <input
                className="cp-folio-input"
                value={holderPanInput}
                onChange={(e) => setHolderPanInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button
              className="btn-action btn-action--pink cp-search-btn"
              onClick={handleSearch}
              disabled={searchLoading}
            >
              {searchLoading ? '⏳ Searching…' : 'SEARCH'}
            </button>
          </div>
          {searchError && (
            <div className="im-banner im-banner--error" style={{ marginTop: 10 }}>
              {searchError}
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input — triggered by UPLOAD button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        multiple={false}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Upload / parse status banners ── */}
      {parseStatus === 'parsing' && (
        <div className="im-banner im-banner--info">⏳ {parseMessage}</div>
      )}
      {parseStatus === 'done' && (
        <div className="im-banner im-banner--success">✓ Physical BenPos — {parseMessage}</div>
      )}
      {parseStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ Physical BenPos — {parseMessage}</div>
      )}

      {uploadStatus === 'uploading' && uploadProgress && (
        <UploadProgressCard progress={uploadProgress} />
      )}

      {uploadStatus === 'done' && uploadSummary && (
        <div className="im-banner im-banner--success">
          ✓ Upload complete —{' '}
          {uploadSummary.shareholders.totalSucceeded.toLocaleString()} shareholders succeeded
          {uploadSummary.shareholders.totalFailed > 0
            ? `, ${uploadSummary.shareholders.totalFailed.toLocaleString()} failed`
            : ''}
          {' | '}
          {uploadSummary.shareholdings.totalSucceeded.toLocaleString()} shareholdings succeeded
          {uploadSummary.shareholdings.totalFailed > 0
            ? `, ${uploadSummary.shareholdings.totalFailed.toLocaleString()} failed`
            : ''}
        </div>
      )}
      {uploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ Upload failed: {uploadError}</div>
      )}

      {/* ── Benpos Physical Shareholder table ── */}
      <BenposSection
        title="Benpos Physical Shareholder"
        cols={SHAREHOLDER_COLS}
        rows={shareholderRows}
        loading={searchLoading}
        emptyMsg={shEmptyMsg}
      />

      {/* ── Benpos Physical Shareholding table ── */}
      <BenposSection
        title="Benpos Physical Shareholding"
        cols={SHAREHOLDING_COLS}
        rows={shareholdingRows}
        loading={searchLoading}
        emptyMsg={shingEmptyMsg}
      />

    </div>
  );
}

export default CompanyPhysical;
