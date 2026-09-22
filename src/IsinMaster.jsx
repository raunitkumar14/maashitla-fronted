import { useState, useEffect } from 'react';
import './IsinMaster.css';
import UploadModal from './UploadModal';
import api from './api/axios';
import {
  deriveCdslMasterRecords,
  deriveCdslIsinTable,
  deriveCdslCompanyTable,
} from './deriveCdslData';
import { deriveNsdlCompanyTable, deriveNsdlIsinTable } from './deriveNsdlData';
import { parseNsdlZip } from './parseNsdlZip';

// ── Column definitions ────────────────────────────────────────────────────────

const ISIN_COLUMNS = [
  { header: 'ISIN',                        field: 'isin',                   isDate: false },
  { header: 'ISIN Description',            field: 'isinDescription',        isDate: false },
  { header: 'Security Type',               field: 'securityType',           isDate: false },
  { header: 'ISIN Status (CDSL)',          field: 'isinStatus',             isDate: false },
  { header: 'Face Value',                  field: 'faceValue',              isDate: false },
  { header: 'Paidup Value',                field: 'paidupValue',            isDate: false },
  { header: 'Issue Date (CDSL)',           field: 'issueDateCdsl',          isDate: true  },
  { header: 'Convert Date (CDSL)',         field: 'convertDateCdsl',        isDate: true  },
  { header: 'Issue Date (NSDL)',           field: 'issueDateNsdl',          isDate: true  },
  { header: 'Maturity Date',               field: 'maturityDate',           isDate: true  },
  { header: 'Convert Date (NSDL)',         field: 'convertDateNsdl',        isDate: true  },
  { header: 'ISIN Status (NSDL)',          field: 'isinStatusNsdl',         isDate: false },
  { header: 'ISIN Activation Date (NSDL)', field: 'isinActivationDateNsdl', isDate: true  },
  { header: 'Issuer Code',                 field: 'issuerCode',             isDate: false },
  { header: 'Source',                      field: 'source',                 isDate: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/*
 * getPageRange — returns the sequence of page labels to render as buttons.
 *
 * Rules:
 *   • totalPages ≤ 7 → show every page number, no ellipsis.
 *   • Otherwise: always show page 1 and the last page; show a ±1 window
 *     around currentPage; insert '...' where there is a hidden gap.
 */
function getPageRange(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages       = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd   = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) pages.push('...');
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);
  if (windowEnd < totalPages - 1) pages.push('...');

  pages.push(totalPages);
  return pages;
}

// buildSummaryRows is still used by the upload pipeline to produce the
// per-issuer payload for POST /admin/v1/issuers/bulk.
function buildSummaryRows(companyRows, isinRows, source) {
  const countMap = isinRows.reduce((acc, row) => {
    const key = String(row.issuerCode ?? '').trim().toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return companyRows.map((row) => ({
    issuerId:   row.issuerId   ?? '',
    issuerCode: row.issuerCode,
    totalIsin:  countMap[String(row.issuerCode ?? '').trim().toUpperCase()] || 0,
    source,
  }));
}

// Converts an ISO timestamp or date string to DD-MM-YYYY; returns — for null/empty.
function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return String(val);
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

function renderCell(col, row) {
  const val = row[col.field];
  if (col.isDate) return formatDate(val);
  return (val == null || val === '') ? '—' : val;
}

// ── PaginationBar — server-side (uses totalCount/totalPages from the API) ─────

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

// ── Page component ────────────────────────────────────────────────────────────

function IsinMaster() {
  // Filter field state — bound to the input boxes (draft values)
  const [isin,        setIsin]        = useState('');
  const [issuerCode,  setIssuerCode]  = useState('');
  const [companyName, setCompanyName] = useState('');

  // Applied filters — only updated on SEARCH / RESET, drives the API call
  const [appliedFilters, setAppliedFilters] = useState({ isin: '', issuerCode: '', companyName: '' });

  // Upload flow state
  const [showUploadModal,    setShowUploadModal]    = useState(false);
  const [uploadStatus,       setUploadStatus]       = useState(null);
  const [uploadMessage,      setUploadMessage]      = useState('');
  const [nsdlUploadStatus,   setNsdlUploadStatus]   = useState(null);
  const [nsdlUploadMessage,  setNsdlUploadMessage]  = useState('');

  // ISIN table state
  const [isinPage,        setIsinPage]        = useState(1);
  const [isinPerPage,     setIsinPerPage]      = useState(10);
  const [isinGoto,        setIsinGoto]         = useState('');
  const [isinData,        setIsinData]         = useState([]);
  const [isinTotalCount,  setIsinTotalCount]   = useState(0);
  const [isinTotalPages,  setIsinTotalPages]   = useState(0);
  const [isinLoading,     setIsinLoading]      = useState(false);
  const [isinFetchError,  setIsinFetchError]   = useState('');
  // Incrementing this triggers a re-fetch without changing page/perPage.
  const [isinRefetchKey,  setIsinRefetchKey]   = useState(0);

  // ── Fetch ISIN table from the backend ────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsinLoading(true);
      setIsinFetchError('');
      try {
        const params = { page: isinPage, pageSize: isinPerPage };
        if (appliedFilters.isin)        params.isin        = appliedFilters.isin;
        if (appliedFilters.issuerCode)  params.issuerCode  = appliedFilters.issuerCode;
        if (appliedFilters.companyName) params.companyName = appliedFilters.companyName;
        const res = await api.get('/admin/v1/isins', { params });
        if (cancelled) return;
        const { items, totalCount, totalPages } = res.data.data;
        setIsinData(items);
        setIsinTotalCount(totalCount);
        setIsinTotalPages(totalPages);
      } catch {
        if (!cancelled) {
          setIsinFetchError('Failed to load ISIN data. Please try again.');
          setIsinData([]);
        }
      } finally {
        if (!cancelled) setIsinLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isinPage, isinPerPage, isinRefetchKey, appliedFilters]);

  // ── Upload functions ─────────────────────────────────────────────────────────

  async function uploadToBackend(summaryRows, isinRows) {
    const issuerPayload = summaryRows
      .map(row => ({
        issuerId:   row.issuerId  ?? '',
        issuerCode: String(row.issuerCode ?? ''),
        totalIsin:  Number(row.totalIsin) || 0,
        source:     String(row.source ?? ''),
      }))
      .filter((rec, i) => {
        if (!rec.issuerCode) {
          console.warn(`[CDSL] Skipping issuer at index ${i}: issuerCode is empty`, rec);
          return false;
        }
        return true;
      });

    const isinPayload = isinRows
      .map(row => ({
        isin:                   row.isinAlphaCode || '',
        isinDescription:        row.isinDescription || '',
        securityType:           row.securityTypeDescription || '',
        isinStatus:             row.isinStatus || null,
        faceValue:              row.parValue || null,
        paidupValue:            row.paidupValue || null,
        issueDateCdsl:          row.issueDate || null,
        convertDateCdsl:        row.conversionDate || null,
        issueDateNsdl:          null,
        maturityDate:           null,
        convertDateNsdl:        null,
        isinStatusNsdl:         null,
        isinActivationDateNsdl: null,
        issuerCode:             row.issuerCode || '',
        source:                 'CDSL',
      }))
      .filter(r => r.isin);

    setUploadStatus('uploading');
    setUploadMessage('Uploading to server...');

    try {
      await Promise.all([
        api.post('/admin/v1/issuers/bulk', issuerPayload),
        api.post('/admin/v1/isins/bulk', isinPayload),
      ]);
      setUploadStatus('success');
      setUploadMessage(`${issuerPayload.length} issuers and ${isinPayload.length} ISINs saved to database.`);
      setIsinRefetchKey((k) => k + 1);
    } catch (err) {
      console.error('[CDSL] Upload failed:', err);
      setUploadStatus('error');
      setUploadMessage(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
    }
  }

  async function uploadNsdlToBackend(summaryRows, isinRows) {
    const issuerPayload = summaryRows
      .map(row => ({
        issuerId:   '',
        issuerCode: String(row.issuerCode ?? ''),
        totalIsin:  Number(row.totalIsin) || 0,
        source:     'NSDL',
      }))
      .filter((rec, i) => {
        if (!rec.issuerCode) {
          console.warn(`[NSDL] Skipping issuer at index ${i}: issuerCode is empty`, rec);
          return false;
        }
        return true;
      });

    const isinPayload = isinRows
      .map(row => ({
        isin:                   row.isin || '',
        isinDescription:        row.isinDescription || '',
        securityType:           row.securityType || '',
        isinStatus:             null,
        faceValue:              row.faceValue != null ? String(row.faceValue) : null,
        paidupValue:            null,
        issueDateCdsl:          null,
        convertDateCdsl:        null,
        issueDateNsdl:          row.issueDateNsdl || null,
        maturityDate:           row.maturityDate || null,
        convertDateNsdl:        row.convertDateNsdl || null,
        isinStatusNsdl:         row.isinStatusNsdl || null,
        isinActivationDateNsdl: row.isinActivationDateNsdl || null,
        issuerCode:             row.issuerCode || '',
        source:                 'NSDL',
      }))
      .filter(r => r.isin);

    setNsdlUploadStatus('uploading');
    setNsdlUploadMessage('Uploading NSDL data to server...');

    try {
      await Promise.all([
        api.post('/admin/v1/issuers/bulk', issuerPayload),
        api.post('/admin/v1/isins/bulk', isinPayload),
      ]);
      setNsdlUploadStatus('success');
      setNsdlUploadMessage(`${issuerPayload.length} issuers and ${isinPayload.length} ISINs saved to database.`);
      setIsinRefetchKey((k) => k + 1);
    } catch (err) {
      console.error('[NSDL] Upload failed:', err);
      setNsdlUploadStatus('error');
      setNsdlUploadMessage(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCdslParsed(records) {
    const master      = deriveCdslMasterRecords(records);
    const companyRows = deriveCdslCompanyTable(master);
    const isinRows    = deriveCdslIsinTable(master);
    const summaryRows = buildSummaryRows(companyRows, isinRows, 'CDSL');
    setShowUploadModal(false);
    uploadToBackend(summaryRows, isinRows);
  }

  async function handleNsdlParsed(zipFile) {
    const records     = await parseNsdlZip(zipFile);
    const companyRows = deriveNsdlCompanyTable(records);
    const isinRows    = deriveNsdlIsinTable(records);
    const summaryRows = buildSummaryRows(companyRows, isinRows, 'NSDL');
    setShowUploadModal(false);
    uploadNsdlToBackend(summaryRows, isinRows);
  }

  function handleIsinPerPageChange(e) {
    setIsinPerPage(Number(e.target.value));
    setIsinPage(1);
  }

  function handleIsinGoto() {
    const target = parseInt(isinGoto, 10);
    if (!isNaN(target) && target >= 1 && target <= isinTotalPages) setIsinPage(target);
    setIsinGoto('');
  }

  function handleSearch(e) {
    e.preventDefault();
    setAppliedFilters({ isin, issuerCode, companyName });
    setIsinPage(1);
  }

  function handleReset() {
    setIsin('');
    setIssuerCode('');
    setCompanyName('');
    setAppliedFilters({ isin: '', issuerCode: '', companyName: '' });
    setIsinPage(1);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">

      {/* ── Page heading ── */}
      <h1 className="page-heading">IsinMaster</h1>

      {/* ══════════════════════════════════════════════
          TOP CARD — header bar + filter row
         ══════════════════════════════════════════════ */}
      <div className="im-card">
        <div className="im-card-header">
          <span>ISIN Master</span>
          <button
            className="btn-upload"
            onClick={() => setShowUploadModal(true)}
            disabled={uploadStatus === 'uploading' || nsdlUploadStatus === 'uploading'}
          >
            {(uploadStatus === 'uploading' || nsdlUploadStatus === 'uploading')
              ? '⏳ Uploading…'
              : '⬆ UPLOAD'}
          </button>
        </div>

        <form className="im-filter-row" onSubmit={handleSearch}>
          <input
            className="im-input"
            placeholder="ISIN"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
          />
          <input
            className="im-input"
            placeholder="Issuer Code"
            value={issuerCode}
            onChange={(e) => setIssuerCode(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <button type="submit"  className="btn-action btn-action--pink">🔍 SEARCH</button>
          <button type="button"  className="btn-action btn-action--pink">⬇ EXPORT</button>
          <button type="button"  className="btn-action btn-action--white" onClick={handleReset}>
            RESET
          </button>
        </form>
      </div>

      {/* ══════════════════════════════════════════════
          Upload status banners
         ══════════════════════════════════════════════ */}
      {uploadStatus === 'uploading' && (
        <div className="im-banner im-banner--info">{uploadMessage}</div>
      )}
      {uploadStatus === 'success' && (
        <div className="im-banner im-banner--success">✓ {uploadMessage}</div>
      )}
      {uploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ {uploadMessage}</div>
      )}

      {nsdlUploadStatus === 'uploading' && (
        <div className="im-banner im-banner--info">[NSDL] {nsdlUploadMessage}</div>
      )}
      {nsdlUploadStatus === 'success' && (
        <div className="im-banner im-banner--success">✓ [NSDL] {nsdlUploadMessage}</div>
      )}
      {nsdlUploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ [NSDL] {nsdlUploadMessage}</div>
      )}

      {/* ══════════════════════════════════════════════
          ISIN Master List — server-side paginated table
         ══════════════════════════════════════════════ */}
      <div className="im-card">
        <div className="im-card-header">
          <span>ISIN Master List</span>
          <label className="entries-label">
            Entries per page
            <select
              className="entries-select"
              value={isinPerPage}
              onChange={handleIsinPerPageChange}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        {isinFetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {isinFetchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {ISIN_COLUMNS.map((col) => (
                  <th key={col.field}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isinLoading ? (
                <tr>
                  <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                    Loading…
                  </td>
                </tr>
              ) : isinData.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                    No data available. Click UPLOAD to import CDSL or NSDL files.
                  </td>
                </tr>
              ) : (
                isinData.map((row, idx) => (
                  <tr key={row.isin || idx}>
                    {ISIN_COLUMNS.map((col) => (
                      <td key={col.field}>{renderCell(col, row)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={isinPage}
          perPage={isinPerPage}
          totalCount={isinTotalCount}
          totalPages={isinTotalPages}
          goto={isinGoto}
          setPage={setIsinPage}
          setGoto={setIsinGoto}
          onGoto={handleIsinGoto}
        />
      </div>

      {/* ══════════════════════════════════════════════
          Upload overlay — NSDL + CDSL modals side by side
         ══════════════════════════════════════════════ */}
      {showUploadModal && (
        <div className="upload-overlay">
          <UploadModal
            title="Upload NSDL ISIN Master"
            depository="NSDL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleNsdlParsed}
          />
          <UploadModal
            title="Upload CDSL ISIN Master"
            depository="CDSL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleCdslParsed}
          />
        </div>
      )}

    </div>
  );
}

export default IsinMaster;
