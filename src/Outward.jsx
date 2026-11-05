import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasPermission } from './auth';
import { listOutward, exportOutward, triggerDownload } from './services/daakService';
import OutwardUploadModal from './OutwardUploadModal';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import './DaakEntry.css';
import './UploadModal.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function fmtDate(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function DaakExportModal({ title, buildParams, exportFn, filename, onClose }) {
  const [phase,  setPhase]  = useState('choose');
  const [errMsg, setErrMsg] = useState('');

  async function runExport(mode) {
    setPhase('exporting');
    setErrMsg('');
    try {
      const params = mode === 'filtered' ? buildParams() : {};
      const res = await exportFn(params);
      triggerDownload(res.data, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      onClose();
    } catch (err) {
      setPhase('error');
      setErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
    }
  }

  return (
    <div className="upload-overlay" onClick={phase !== 'exporting' ? onClose : undefined}>
      <div className="im-export-modal" onClick={e => e.stopPropagation()}>
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
            </svg>
          </span>
          <span className="um-header-title">Export {title}</span>
          <button className="um-close-btn" onClick={onClose} disabled={phase === 'exporting'} aria-label="Close">&times;</button>
        </div>

        {phase === 'choose' && (
          <div className="im-export-body">
            <button className="im-export-option" onClick={() => runExport('filtered')}>
              <span className="im-export-option-title">&#8595; Export Filtered</span>
              <span className="im-export-option-desc">Export only rows matching the current search filters</span>
            </button>
            <button className="im-export-option" onClick={() => runExport('all')}>
              <span className="im-export-option-title">&#8595; Export All</span>
              <span className="im-export-option-desc">Export all records &mdash; current filters ignored</span>
            </button>
          </div>
        )}

        {phase === 'exporting' && (
          <div className="im-export-progress">
            <p className="im-export-progress-stage">Generating export&hellip;</p>
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

function Outward() {
  const navigate  = useNavigate();
  const canCreate = hasPermission('daak_outward:create');
  const canUpdate = hasPermission('daak_outward:update');

  // ── Filter fields ──────────────────────────────────────────────────────────
  const [outwardId,       setOutwardId]       = useState('');
  const [podNumber,       setPodNumber]       = useState('');
  const [drnFilter,       setDrnFilter]       = useState('');
  const [fromDate,        setFromDate]        = useState('');
  const [toDate,          setToDate]          = useState('');
  const [fromDispatch,    setFromDispatch]    = useState('');
  const [toDispatch,      setToDispatch]      = useState('');

  // ── Table / pagination ─────────────────────────────────────────────────────
  const [rows,        setRows]        = useState([]);
  const [total,       setTotal]       = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(5);
  const [gotoPage,    setGotoPage]    = useState('');
  const [loading,         setLoading]         = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [fetchError,      setFetchError]      = useState('');

  const [appliedFilters, setAppliedFilters] = useState({});

  // ── Upload modal ───────────────────────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);

  // ── Fetch when appliedFilters or pagination changes ────────────────────────
  useEffect(() => {
    runFetch(appliedFilters, currentPage, pageSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters, currentPage, pageSize]);

  async function runFetch(filters, page, ps) {
    setLoading(true);
    setFetchError('');
    try {
      const params = { page, pageSize: ps };
      if (filters.outwardId)    params.outwardId    = filters.outwardId;
      if (filters.podNumber)    params.podNumber    = filters.podNumber;
      if (filters.drn)          params.drn          = filters.drn;
      if (filters.fromDate)     params.fromDate     = filters.fromDate;
      if (filters.toDate)       params.toDate       = filters.toDate;
      if (filters.fromDispatch) params.fromDispatchDate = filters.fromDispatch;
      if (filters.toDispatch)   params.toDispatchDate   = filters.toDispatch;
      const result = await listOutward(params);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load records.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function collectFilters() {
    return {
      outwardId:    outwardId.trim()   || null,
      podNumber:    podNumber.trim()   || null,
      drn:          drnFilter.trim()   || null,
      fromDate:     fromDate           || null,
      toDate:       toDate             || null,
      fromDispatch: fromDispatch       || null,
      toDispatch:   toDispatch         || null,
    };
  }

  function handleSearch() {
    setCurrentPage(1);
    setAppliedFilters(collectFilters());
  }

  function buildExportParams(f) {
    const params = {};
    if (f.outwardId)    params.outwardId        = f.outwardId;
    if (f.podNumber)    params.podNumber        = f.podNumber;
    if (f.drn)          params.drn              = f.drn;
    if (f.fromDate)     params.fromDate         = f.fromDate;
    if (f.toDate)       params.toDate           = f.toDate;
    if (f.fromDispatch) params.fromDispatchDate = f.fromDispatch;
    if (f.toDispatch)   params.toDispatchDate   = f.toDispatch;
    return params;
  }

  function handleReset() {
    setOutwardId('');
    setPodNumber('');
    setDrnFilter('');
    setFromDate('');
    setToDate('');
    setFromDispatch('');
    setToDispatch('');
    setRows([]);
    setTotal(0);
    setCurrentPage(1);
    setAppliedFilters({});
    setFetchError('');
  }

  function handleUploadSuccess() {
    setShowUpload(false);
    runFetch(appliedFilters, currentPage, pageSize);
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startEntry = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry   = Math.min(currentPage * pageSize, total);

  function buildPageButtons() {
    const maxBtns = 5;
    let start = Math.max(1, currentPage - 2);
    let end   = Math.min(totalPages, start + maxBtns - 1);
    start     = Math.max(1, end - maxBtns + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return { pages, end };
  }

  const { pages, end: lastBtn } = buildPageButtons();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="isin-master">
      <h1 className="page-heading">Outward</h1>

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Outward</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-upload"
              onClick={() => setShowUpload(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e83e6f' }}
            >
              <span style={{ fontSize: 13 }}>↑</span> UPLOAD
            </button>
            {canCreate && (
              <button
                className="btn-upload"
                onClick={() => navigate('/outward/add')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e83e6f' }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> ADD
              </button>
            )}
          </div>
        </div>

        <div className="dk-filter-grid">

          {/* Row 1 */}

          {/* Outward Id */}
          <div className="benpos-field">
            <label className="benpos-label">Outward Id</label>
            <input
              type="text"
              className="benpos-date-input"
              value={outwardId}
              onChange={e => setOutwardId(e.target.value)}
            />
          </div>

          {/* Pod Number */}
          <div className="benpos-field">
            <label className="benpos-label">Pod Number</label>
            <input
              type="text"
              className="benpos-date-input"
              value={podNumber}
              onChange={e => setPodNumber(e.target.value)}
            />
          </div>

          {/* DRN */}
          <div className="benpos-field">
            <label className="benpos-label">DRN</label>
            <input
              type="text"
              className="benpos-date-input"
              value={drnFilter}
              onChange={e => setDrnFilter(e.target.value)}
            />
          </div>

          {/* From Date */}
          <div className="benpos-field">
            <label className="benpos-label">From Date</label>
            <input
              type="date"
              className="benpos-date-input"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
          </div>

          {/* Row 2 */}

          {/* To Date */}
          <div className="benpos-field">
            <label className="benpos-label">To Date</label>
            <input
              type="date"
              className="benpos-date-input"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
            />
          </div>

          {/* From Dispatch Date */}
          <div className="benpos-field">
            <label className="benpos-label">From Dispatch Date</label>
            <input
              type="date"
              className="benpos-date-input"
              value={fromDispatch}
              onChange={e => setFromDispatch(e.target.value)}
            />
          </div>

          {/* To Dispatch Date */}
          <div className="benpos-field">
            <label className="benpos-label">To Dispatch Date</label>
            <input
              type="date"
              className="benpos-date-input"
              value={toDispatch}
              onChange={e => setToDispatch(e.target.value)}
            />
          </div>

        </div>

        {/* Button row */}
        <div className="dk-filter-actions">
          <button
            className="btn-action btn-action--pink"
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: '10px 20px', fontSize: 12 }}
          >
            SEARCH
          </button>
          <button
            className="btn-action btn-action--pink"
            onClick={() => setShowExportModal(true)}
            style={{ padding: '10px 20px', fontSize: 12 }}
          >
            <span className="dk-dl-icon">↓</span>EXPORT
          </button>
          <button
            className="btn-action btn-action--white"
            onClick={handleReset}
            style={{ padding: '10px 20px', fontSize: 12 }}
          >
            RESET
          </button>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Outward List</span>
          <div className="entries-label">
            Entries per page
            <select
              className="entries-select"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {fetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '10px 20px 0' }}>⚠ {fetchError}</div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table" style={{ minWidth: 1800 }}>
            <thead>
              <tr>
                <th style={{ width: 90  }}>ACTIONS</th>
                <th style={{ width: 70  }}>ID</th>
                <th style={{ width: 120 }}>DISPATCH DATE</th>
                <th style={{ width: 200 }}>COMPANY</th>
                <th style={{ width: 140 }}>ISIN</th>
                <th style={{ width: 160 }}>DOCUMENT TYPE</th>
                <th style={{ width: 160 }}>RECIPIENT</th>
                <th style={{ width: 110 }}>CITY</th>
                <th style={{ width: 140 }}>COURIER</th>
                <th style={{ width: 120 }}>POD NUMBER</th>
                <th style={{ width: 90  }}>COST</th>
                <th style={{ width: 110 }}>STATUS</th>
                <th style={{ width: 120 }}>DRN</th>
                <th style={{ width: 140 }}>CREATED BY</th>
                <th style={{ width: 120 }}>CREATED ON</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={15} className="im-empty-state">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={15} className="im-empty-state">No records found</td></tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      {canUpdate && (
                        <button
                          className="ca-edit-btn"
                          onClick={() => navigate(`/outward/${row.id}`)}
                        >
                          EDIT
                        </button>
                      )}
                    </td>
                    <td>{row.id}</td>
                    <td>{fmtDate(row.dispatchDate)}</td>
                    <td>{row.companyName ?? row.companyOtherName ?? '—'}</td>
                    <td>{row.isin ?? '—'}</td>
                    <td>{row.documentTypeName ?? '—'}</td>
                    <td>{row.recipientName ?? '—'}</td>
                    <td>{row.city ?? '—'}</td>
                    <td>{row.courierName ?? '—'}</td>
                    <td>{row.podNumber ?? '—'}</td>
                    <td>{row.cost != null ? row.cost : '—'}</td>
                    <td>{row.status ?? '—'}</td>
                    <td>{row.drn ?? '—'}</td>
                    <td>{row.createdByName ?? '—'}</td>
                    <td>{fmtDate(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="im-pagination">
          <div className="pagination-info">
            {total === 0
              ? 'No entries'
              : `Showing ${startEntry} to ${endEntry} of ${total} entries`}
          </div>
          <div className="pagination-controls">
            {pages.map(p => (
              <button
                key={p}
                className={`page-btn${p === currentPage ? ' page-btn--active' : ''}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            ))}
            {lastBtn < totalPages && (
              <>
                <span className="page-ellipsis">…</span>
                <button className="page-btn" onClick={() => setCurrentPage(totalPages)}>
                  {totalPages}
                </button>
              </>
            )}
            <span className="goto-label">Go to:</span>
            <input
              type="text"
              className="goto-input"
              value={gotoPage}
              onChange={e => setGotoPage(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                const p = parseInt(gotoPage, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                  setCurrentPage(p);
                  setGotoPage('');
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Upload modal ── */}
      {showUpload && (
        <OutwardUploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {showExportModal && (
        <DaakExportModal
          title="Outward"
          buildParams={() => buildExportParams(collectFilters())}
          exportFn={exportOutward}
          filename="daak_outward"
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

export default Outward;
