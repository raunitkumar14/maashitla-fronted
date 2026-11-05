import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api/axios';
import { hasPermission } from './auth';
import { listInward, exportInward, triggerDownload, getDocumentTypes, getUsersForDropdown } from './services/daakService';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import './DaakEntry.css';
import './UploadModal.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const STATUS_OPTIONS = [
  { value: 'RECEIVED',   label: 'Received'   },
  { value: 'IN_PROCESS', label: 'In Process' },
  { value: 'CLOSED',     label: 'Closed'     },
];

function fmtStatus(s) {
  if (s === 'RECEIVED')   return 'Received';
  if (s === 'IN_PROCESS') return 'In Process';
  if (s === 'CLOSED')     return 'Closed';
  return s ?? '—';
}

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

function DaakEntry() {
  const navigate   = useNavigate();
  const canCreate  = hasPermission('daak_inward:create');
  const canUpdate  = hasPermission('daak_inward:update');

  // ── Filter fields ──────────────────────────────────────────────────────────
  const [companyQuery,       setCompanyQuery]       = useState('');
  const [selectedCompCode,   setSelectedCompCode]   = useState('');
  const [selectedCompName,   setSelectedCompName]   = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showCompDrop,       setShowCompDrop]       = useState(false);
  const compWrapRef = useRef(null);

  const [daakId,          setDaakId]          = useState('');
  const [fromDate,        setFromDate]        = useState('');
  const [toDate,          setToDate]          = useState('');
  const [courierAwb,      setCourierAwb]      = useState('');
  const [fromRecvDate,    setFromRecvDate]    = useState('');
  const [toRecvDate,      setToRecvDate]      = useState('');
  const [drnFilter,       setDrnFilter]       = useState('');
  const [docTypeId,       setDocTypeId]       = useState('');
  const [statusFilter,    setStatusFilter]    = useState('');
  const [recvByUserId,    setRecvByUserId]    = useState('');

  // ── Master data ────────────────────────────────────────────────────────────
  const [documentTypes, setDocumentTypes] = useState([]);
  const [users,         setUsers]         = useState([]);

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

  // ── Load masters on mount ──────────────────────────────────────────────────
  useEffect(() => {
    getDocumentTypes()
      .then(dts => setDocumentTypes(Array.isArray(dts) ? dts : []))
      .catch(() => {});
    getUsersForDropdown()
      .then(result => setUsers(result))
      .catch(() => {});
  }, []);

  // ── Company autocomplete (debounced) ───────────────────────────────────────
  useEffect(() => {
    if (selectedCompCode) return;
    const q = companyQuery.trim();
    if (q.length < 2) { setCompanySuggestions([]); setShowCompDrop(false); return; }
    const timer = setTimeout(async () => {
      try {
        const [byName, byCode] = await Promise.allSettled([
          api.get('/admin/v1/issuers', { params: { issuerName: q, pageSize: 10 } }),
          api.get('/admin/v1/issuers', { params: { issuerCode: q, pageSize: 10 } }),
        ]);
        const seen = new Map();
        for (const r of [byName, byCode]) {
          if (r.status === 'fulfilled') {
            for (const item of (r.value.data?.data?.items ?? [])) {
              if (!seen.has(item.issuerCode)) seen.set(item.issuerCode, item);
            }
          }
        }
        setCompanySuggestions([...seen.values()].slice(0, 10));
        setShowCompDrop(true);
      } catch {
        setCompanySuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [companyQuery, selectedCompCode]);

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
      if (filters.companyCode)      params.companyCode      = filters.companyCode;
      if (filters.daakId)           params.daakId           = filters.daakId;
      if (filters.fromDate)         params.fromDate         = filters.fromDate;
      if (filters.toDate)           params.toDate           = filters.toDate;
      if (filters.courierAwb)       params.courierAwb       = filters.courierAwb;
      if (filters.fromReceivedDate) params.fromReceivedDate = filters.fromReceivedDate;
      if (filters.toReceivedDate)   params.toReceivedDate   = filters.toReceivedDate;
      if (filters.drn)              params.drn              = filters.drn;
      if (filters.documentTypeId)   params.documentTypeId   = filters.documentTypeId;
      if (filters.status)           params.status           = filters.status;
      if (filters.receivedByUserId) params.receivedByUserId = filters.receivedByUserId;
      const result = await listInward(params);
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
      companyCode:      selectedCompCode  || null,
      daakId:           daakId.trim()     || null,
      fromDate:         fromDate          || null,
      toDate:           toDate            || null,
      courierAwb:       courierAwb.trim() || null,
      fromReceivedDate: fromRecvDate      || null,
      toReceivedDate:   toRecvDate        || null,
      drn:              drnFilter.trim()  || null,
      documentTypeId:   docTypeId         || null,
      status:           statusFilter      || null,
      receivedByUserId: recvByUserId      || null,
    };
  }

  function handleSearch() {
    setCurrentPage(1);
    setAppliedFilters(collectFilters());
  }

  function buildExportParams(f) {
    const params = {};
    if (f.companyCode)      params.companyCode      = f.companyCode;
    if (f.daakId)           params.daakId           = f.daakId;
    if (f.fromDate)         params.fromDate         = f.fromDate;
    if (f.toDate)           params.toDate           = f.toDate;
    if (f.courierAwb)       params.courierAwb       = f.courierAwb;
    if (f.fromReceivedDate) params.fromReceivedDate = f.fromReceivedDate;
    if (f.toReceivedDate)   params.toReceivedDate   = f.toReceivedDate;
    if (f.drn)              params.drn              = f.drn;
    if (f.documentTypeId)   params.documentTypeId   = f.documentTypeId;
    if (f.status)           params.status           = f.status;
    if (f.receivedByUserId) params.receivedByUserId = f.receivedByUserId;
    return params;
  }

  function handleReset() {
    setCompanyQuery('');
    setSelectedCompCode('');
    setSelectedCompName('');
    setCompanySuggestions([]);
    setShowCompDrop(false);
    setDaakId('');
    setFromDate('');
    setToDate('');
    setCourierAwb('');
    setFromRecvDate('');
    setToRecvDate('');
    setDrnFilter('');
    setDocTypeId('');
    setStatusFilter('');
    setRecvByUserId('');
    setRows([]);
    setTotal(0);
    setCurrentPage(1);
    setAppliedFilters({});
    setFetchError('');
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
      <h1 className="page-heading">Daak Entry</h1>

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Daak Entry</span>
          {canCreate && (
            <button
              className="btn-upload"
              onClick={() => navigate('/daak-entry/add')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e83e6f' }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> ADD DAAK ENTRY
            </button>
          )}
        </div>

        <div className="dk-filter-grid">

          {/* ── Row 1 ── */}

          {/* Company Name */}
          <div className="benpos-field" ref={compWrapRef}>
            <label className="benpos-label">Company Name</label>
            <div className="dk-company-wrap">
              <input
                type="text"
                className="dk-company-input"
                value={selectedCompCode ? selectedCompName : companyQuery}
                placeholder="— type to search —"
                onChange={e => {
                  if (selectedCompCode) {
                    setSelectedCompCode('');
                    setSelectedCompName('');
                    setCompanyQuery('');
                  } else {
                    setCompanyQuery(e.target.value);
                  }
                }}
                onFocus={() => { if (companySuggestions.length > 0 && !selectedCompCode) setShowCompDrop(true); }}
                onBlur={e => {
                  if (!compWrapRef.current?.contains(e.relatedTarget)) {
                    setTimeout(() => setShowCompDrop(false), 150);
                  }
                }}
              />
              {showCompDrop && companySuggestions.length > 0 && (
                <ul className="dk-company-dropdown">
                  {companySuggestions.map(item => (
                    <li
                      key={item.issuerCode}
                      className="dk-company-opt"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setSelectedCompCode(item.issuerCode);
                        setSelectedCompName(item.issuerName || item.issuerCode);
                        setCompanyQuery('');
                        setShowCompDrop(false);
                      }}
                    >
                      <strong>{item.issuerCode}</strong> — {item.issuerName || ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Daak Id */}
          <div className="benpos-field">
            <label className="benpos-label">Daak Id</label>
            <input
              type="text"
              className="benpos-date-input"
              value={daakId}
              onChange={e => setDaakId(e.target.value)}
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

          {/* ── Row 2 ── */}

          {/* Courier AWB */}
          <div className="benpos-field">
            <label className="benpos-label">Courier AWB / Docket No</label>
            <input
              type="text"
              className="benpos-date-input"
              value={courierAwb}
              onChange={e => setCourierAwb(e.target.value)}
            />
          </div>

          {/* From Received Date */}
          <div className="benpos-field">
            <label className="benpos-label">From Received Date</label>
            <input
              type="date"
              className="benpos-date-input"
              value={fromRecvDate}
              onChange={e => setFromRecvDate(e.target.value)}
            />
          </div>

          {/* To Received Date */}
          <div className="benpos-field">
            <label className="benpos-label">To Received Date</label>
            <input
              type="date"
              className="benpos-date-input"
              value={toRecvDate}
              onChange={e => setToRecvDate(e.target.value)}
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

          {/* ── Row 3 ── */}

          {/* Document Type */}
          <div className="benpos-field">
            <label className="benpos-label">Document Type</label>
            <select
              className="benpos-select"
              value={docTypeId}
              onChange={e => setDocTypeId(e.target.value)}
            >
              <option value="">— select —</option>
              {documentTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="benpos-field">
            <label className="benpos-label">Status</label>
            <select
              className="benpos-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">— select —</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Received By */}
          <div className="benpos-field">
            <label className="benpos-label">Received By</label>
            <select
              className="benpos-select"
              value={recvByUserId}
              onChange={e => setRecvByUserId(e.target.value)}
            >
              <option value="">— select —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.username}</option>
              ))}
            </select>
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
          <span>Daak Entry List</span>
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
          <table className="im-table" style={{ minWidth: 1700 }}>
            <thead>
              <tr>
                <th style={{ width: 90  }}>ACTIONS</th>
                <th style={{ width: 70  }}>ID</th>
                <th style={{ width: 120 }}>RECEIVED DATE</th>
                <th style={{ width: 150 }}>RECEIVED BY</th>
                <th style={{ width: 110 }}>STATUS</th>
                <th style={{ width: 220 }}>COMPANY</th>
                <th style={{ width: 160 }}>DOCUMENT TYPE</th>
                <th style={{ width: 160 }}>SENDER NAME</th>
                <th style={{ width: 90  }}>ITEM COUNT</th>
                <th style={{ width: 160 }}>COURIER COMPANY</th>
                <th style={{ width: 150 }}>COURIER AWB</th>
                <th style={{ width: 120 }}>DRN</th>
                <th style={{ width: 200 }}>REMARKS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} className="im-empty-state">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={13} className="im-empty-state">No records found</td></tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      {canUpdate && (
                        <button
                          className="ca-edit-btn"
                          onClick={() => navigate(`/daak-entry/${row.id}`)}
                        >
                          EDIT
                        </button>
                      )}
                    </td>
                    <td>{row.id}</td>
                    <td>{fmtDate(row.receivedDate)}</td>
                    <td>{row.receivedByUserName ?? '—'}</td>
                    <td>{fmtStatus(row.status)}</td>
                    <td>{row.companyName ?? row.companyOtherName ?? '—'}</td>
                    <td>{row.documentTypeName ?? '—'}</td>
                    <td>{row.senderName ?? '—'}</td>
                    <td>{row.itemCount ?? '—'}</td>
                    <td>{row.courierName ?? '—'}</td>
                    <td>{row.courierAwb ?? '—'}</td>
                    <td>{row.drn ?? '—'}</td>
                    <td>{row.remarks ?? '—'}</td>
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

      {showExportModal && (
        <DaakExportModal
          title="Daak Entry"
          buildParams={() => buildExportParams(collectFilters())}
          exportFn={exportInward}
          filename="daak_inward"
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

export default DaakEntry;
