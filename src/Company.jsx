import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './Company.css';
import './UploadModal.css';
import { useColumnVisibility } from './hooks/useColumnVisibility';
import { ColumnSelector } from './components/ColumnSelector';
import { buildXlsxBlob } from './xlsxStream';

// ── Column definitions ────────────────────────────────────────────────────────

const COMPANY_COLUMNS = [
  { field: 'issuerId',   header: 'Issuer ID',   render: row => row.issuerId   ?? '—' },
  { field: 'issuerCode', header: 'Issuer Code',  render: row => row.issuerCode         },
  { field: 'issuerName', header: 'Issuer Name',  render: row => row.issuerName || '—' },
  { field: 'totalIsin',  header: 'Total ISIN',   render: row => row.totalIsin          },
  { field: 'source',     header: 'Source',       render: row => row.source             },
];

// Stable reference — never recreated across renders.
const VISIBILITY_COLUMNS = COMPANY_COLUMNS.map(col => ({
  key:            col.field,
  label:          col.header,
  defaultVisible: true,
  locked:         col.field === 'issuerCode',
}));

// ── Export helpers ────────────────────────────────────────────────────────────

function fmtExportDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function renderExportCell(col, row) {
  const val = row[col.field];
  return val == null ? '' : String(val);
}

// ── ExportModal ───────────────────────────────────────────────────────────────

function ExportModal({ appliedFilters, visibleCols, onClose }) {
  const [phase,  setPhase]  = useState('choose'); // choose | fetching | error
  const [errMsg, setErrMsg] = useState('');

  const isFetching = phase === 'fetching';

  const colCountLabel = `${visibleCols.length} of ${COMPANY_COLUMNS.length} columns`;

  const filterDesc = (() => {
    const parts = [];
    if (appliedFilters.issuerCode) parts.push(`Issuer Code = "${appliedFilters.issuerCode}"`);
    if (appliedFilters.issuerId)   parts.push(`Issuer ID = "${appliedFilters.issuerId}"`);
    if (appliedFilters.issuerName) parts.push(`Issuer Name ⊇ "${appliedFilters.issuerName}"`);
    if (appliedFilters.source)     parts.push(`Source = "${appliedFilters.source}"`);
    return parts.length ? parts.join(', ') : 'No filter active';
  })();

  async function runExport(mode) {
    setPhase('fetching');
    setErrMsg('');
    try {
      const params = {};
      if (mode === 'search') {
        if (appliedFilters.issuerId)   params.issuerId   = appliedFilters.issuerId;
        if (appliedFilters.issuerCode) params.issuerCode = appliedFilters.issuerCode;
        if (appliedFilters.issuerName) params.issuerName = appliedFilters.issuerName;
        if (appliedFilters.source)     params.source     = appliedFilters.source;
      }
      const res = await api.get('/admin/v1/issuers', { params });
      const rows = res.data.data.items ?? [];

      const headers  = visibleCols.map(c => c.header);
      const dataRows = rows.map(row => visibleCols.map(col => renderExportCell(col, row)));

      const blob     = await buildXlsxBlob(headers, dataRows, { sheetName: 'Company List' });
      const filename = mode === 'all'
        ? `Company_All_${fmtExportDate()}.xlsx`
        : `Company_List_${fmtExportDate()}.xlsx`;
      downloadBlob(blob, filename);
      onClose();
    } catch (err) {
      setPhase('error');
      setErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
    }
  }

  return (
    <div className="upload-overlay" onClick={!isFetching ? onClose : undefined}>
      <div className="im-export-modal" onClick={e => e.stopPropagation()}>

        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
            </svg>
          </span>
          <span className="um-header-title">Export Company</span>
          <button className="um-close-btn" onClick={onClose} disabled={isFetching} aria-label="Close">
            &times;
          </button>
        </div>

        {phase === 'choose' && (
          <div className="im-export-body">
            <button className="im-export-option" onClick={() => runExport('search')}>
              <span className="im-export-option-title">&#8595; Export search results</span>
              <span className="im-export-option-desc">{filterDesc} · {colCountLabel}</span>
            </button>
            <button className="im-export-option" onClick={() => runExport('all')}>
              <span className="im-export-option-title">&#8595; Export all data</span>
              <span className="im-export-option-desc">Full company list &mdash; current filter ignored · {colCountLabel}</span>
            </button>
          </div>
        )}

        {phase === 'fetching' && (
          <div className="im-export-progress">
            <p className="im-export-progress-stage">Fetching records&hellip;</p>
            <div className="um-spinner" />
          </div>
        )}

        {phase === 'error' && (
          <div className="im-export-error">
            <p className="im-export-error-text">&#9888; {errMsg}</p>
            <button className="im-export-retry-btn" onClick={onClose}>Close</button>
          </div>
        )}

      </div>
    </div>
  );
}

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

function Company() {
  const navigate = useNavigate();

  const [showExportModal, setShowExportModal] = useState(false);

  // ── Search input state (not applied until SEARCH is clicked) ─────────────
  const [issuerId,   setIssuerId]   = useState('');
  const [issuerCode, setIssuerCode] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [source,     setSource]     = useState('');

  // ── Committed filters — only updated on SEARCH / RESET ───────────────────
  const [appliedFilters, setAppliedFilters] = useState({
    issuerId: '', issuerCode: '', issuerName: '', source: '',
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page,   setPage]   = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [goto,    setGoto]   = useState('');

  // ── Table data ────────────────────────────────────────────────────────────
  const [issuers,    setIssuers]    = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  // ── Column visibility ─────────────────────────────────────────────────────

  const { visibleKeys, isVisible, toggle, setAll, reset: resetColumns } =
    useColumnVisibility('company', VISIBILITY_COLUMNS);

  const visibleCols = COMPANY_COLUMNS.filter(col => isVisible(col.field));

  // ── Fetch: runs when page, perPage, or committed filters change ───────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const params = { page, pageSize: perPage };
        if (appliedFilters.issuerId)   params.issuerId   = appliedFilters.issuerId;
        if (appliedFilters.issuerCode) params.issuerCode = appliedFilters.issuerCode;
        if (appliedFilters.issuerName) params.issuerName = appliedFilters.issuerName;
        if (appliedFilters.source)     params.source     = appliedFilters.source;
        const res = await api.get('/admin/v1/issuers', { params });
        if (cancelled) return;
        const { items, totalCount, totalPages } = res.data.data;
        setIssuers(items);
        setTotalCount(totalCount);
        setTotalPages(totalPages);
      } catch {
        if (!cancelled) {
          setFetchError('Failed to load companies. Please try again.');
          setIssuers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [page, perPage, appliedFilters]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1);
  }

  function handleGoto() {
    const target = parseInt(goto, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) setPage(target);
    setGoto('');
  }

  function handleSearch(e) {
    e.preventDefault();
    setAppliedFilters({
      issuerId:   issuerId.trim(),
      issuerCode: issuerCode.trim(),
      issuerName: issuerName.trim(),
      source:     source.trim(),
    });
    setPage(1);
  }

  function handleReset() {
    setIssuerId('');
    setIssuerCode('');
    setIssuerName('');
    setSource('');
    setAppliedFilters({ issuerId: '', issuerCode: '', issuerName: '', source: '' });
    setPage(1);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">Company</h1>

      {/* ── Right-aligned action row ── */}
      <div className="company-action-row">
        <button className="btn-action btn-action--white">
          ⬇ Sample
        </button>
        <button className="btn-action btn-action--grey" disabled>
          UPLOAD DENIED
        </button>
        <button className="btn-action btn-action--pink">
          + ADD COMPANY
        </button>
      </div>

      {/* ── Company List card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Company List</span>
          <div className="im-header-actions">
            <ColumnSelector
              columns={VISIBILITY_COLUMNS}
              visibleKeys={visibleKeys}
              onToggle={toggle}
              onSetAll={setAll}
              onReset={resetColumns}
            />
            <label className="entries-label">
              Entries per page
              <select className="entries-select" value={perPage} onChange={handlePerPageChange}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </div>

        <form className="im-filter-row" onSubmit={handleSearch}>
          <input
            className="im-input im-input--wide"
            placeholder="Issuer Code"
            value={issuerCode}
            onChange={(e) => setIssuerCode(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Issuer ID"
            value={issuerId}
            onChange={(e) => setIssuerId(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Issuer Name"
            value={issuerName}
            onChange={(e) => setIssuerName(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <button type="submit"  className="btn-action btn-action--pink">&#128269; SEARCH</button>
          <button type="button"  className="btn-action btn-action--pink" onClick={() => setShowExportModal(true)}>&#8681; EXPORT</button>
          <button type="button"  className="btn-action btn-action--white" onClick={handleReset}>RESET</button>
        </form>

        {fetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {fetchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {visibleCols.map(col => <th key={col.field}>{col.header}</th>)}
                <th>View ISIN</th>
                <th>View Company Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="im-empty-state" colSpan={visibleCols.length + 2}>Loading…</td>
                </tr>
              ) : issuers.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={visibleCols.length + 2}>No data available.</td>
                </tr>
              ) : (
                issuers.map((row, idx) => (
                  <tr key={row.issuerCode || idx}>
                    {visibleCols.map(col => (
                      <td key={col.field}>{col.render(row)}</td>
                    ))}
                    <td className="company-action-cell">
                      <button
                        className="company-icon-btn"
                        title="View ISIN"
                        onClick={() => navigate(`/company/${row.issuerCode}/isins`, { state: { companyRow: row } })}
                      >
                        →
                      </button>
                    </td>
                    <td className="company-action-cell">
                      <button
                        className="company-icon-btn"
                        title="View Company Details"
                        onClick={() => navigate(`/company/${row.issuerCode}/details`)}
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          totalPages={totalPages}
          goto={goto}
          setPage={setPage}
          setGoto={setGoto}
          onGoto={handleGoto}
        />
      </div>
      {showExportModal && (
        <ExportModal
          appliedFilters={appliedFilters}
          visibleCols={visibleCols}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

export default Company;
