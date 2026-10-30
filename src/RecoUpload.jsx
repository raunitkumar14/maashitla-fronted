import { useState, useEffect, useCallback, useRef } from 'react';
import api from './api/axios';
import './IsinMaster.css';
import './RecoUpload.css';
import RecoUploadModal from './RecoUploadModal';

// ── Column definitions ────────────────────────────────────────────────────────

const CDSL_COLS = [
  { header: 'ISIN',              field: 'isin' },
  { header: 'ISIN Description',  field: 'isinDescription' },
  { header: 'Free Positions',    field: 'freePosition',  numeric: true },
  { header: 'Lock Positions',    field: 'lockPosition',  numeric: true },
  { header: 'CDSL Positions',    field: 'cdslPosition',  numeric: true },
];

const NSDL_COLS = [
  { header: 'ISIN',                       field: 'isin' },
  { header: 'ISIN Short Name',            field: 'isinShortName' },
  { header: 'Company Name',               field: 'companyName' },
  { header: 'Flag Decimal ISIN',          field: 'flagDecimalIsin' },
  { header: 'Free Positions',             field: 'freePosition',             numeric: true },
  { header: 'Lock Positions',             field: 'lockPosition',             numeric: true },
  { header: 'Unlock Balance',             field: 'unlockBalance',            numeric: true },
  { header: 'Lock Balance',               field: 'lockBalance',              numeric: true },
  { header: 'Pending Demat Balance',      field: 'pendingDematBalance',      numeric: true },
  { header: 'Pending Remat Free Balance', field: 'pendingRematFreeBalance',  numeric: true },
  { header: 'Pending Remat Lock Balance', field: 'pendingRematLockBalance',  numeric: true },
  { header: 'Delivery Transit Balance',   field: 'deliveryTransitBalance',   numeric: true },
  { header: 'Receipt Transit Balance',    field: 'receiptTransitBalance',    numeric: true },
  { header: 'Security Type',              field: 'securityType' },
];

// ── Number formatter ──────────────────────────────────────────────────────────

function fmtNum(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  if (isNaN(n)) return val;
  return n.toLocaleString('en-IN');
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function getPageRange(current, total) {
  if (total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  if (start > 2)       pages.push('...');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('...');
  pages.push(total);
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
            ? <span key={`e-${idx}`} className="page-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`page-btn${item === page ? ' page-btn--active' : ''}`}
                onClick={() => setPage(item)}
              >{item}</button>
            )
        )}
        <span className="goto-label">Go to:</span>
        <input
          className="goto-input"
          type="number"
          min={1}
          max={totalPages || 1}
          value={goto}
          onChange={e => setGoto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>&rarr;</button>
      </div>
    </div>
  );
}

// ── Toast builder from upload response ───────────────────────────────────────

function buildUploadToast(data) {
  const parts = [];
  if (data?.cdsl?.rows != null)              parts.push(`CDSL: ${data.cdsl.rows} rows`);
  if (data?.nsdl?.rows != null)              parts.push(`NSDL: ${data.nsdl.rows} rows`);
  if (data?.reconciliation?.created != null) parts.push(`Reconciliation: ${data.reconciliation.created} created`);
  if (data?.skippedNotInIsinMaster)          parts.push(`${data.skippedNotInIsinMaster} skipped (not in ISIN Master)`);
  if (data?.withoutTotalIssued)              parts.push(`${data.withoutTotalIssued} without total issued`);
  if (data?.replaced)                        parts.push('Existing records replaced');
  if (data?.laterDatesExist)                 parts.push('Note: later dates already exist');
  return parts.length ? parts.join(' · ') : 'Upload successful';
}

// ── RecoUpload page ───────────────────────────────────────────────────────────

function RecoUpload() {
  // Filters
  const [selectedIssuer, setSelectedIssuer] = useState(null); // {issuerCode, issuerName}
  const [depository,     setDepository]     = useState('CDSL');
  const [selectedDate,   setSelectedDate]   = useState('');
  const [search,         setSearch]         = useState('');

  // Issuer autocomplete
  const [issuerQuery,        setIssuerQuery]        = useState('');
  const [issuerSuggestions,  setIssuerSuggestions]  = useState([]);
  const [issuerLoading,      setIssuerLoading]      = useState(false);
  const [showIssuerDropdown, setShowIssuerDropdown] = useState(false);
  const [suggPage,           setSuggPage]           = useState(1);
  const [suggTotalPages,     setSuggTotalPages]     = useState(1);
  const firstPageCacheRef = useRef(null);
  const issuerTimerRef    = useRef(null);

  // Date dropdown
  const [dates, setDates] = useState([]); // [{reconDate, count}]

  // Table state
  const [rows,       setRows]       = useState(null);
  const [totals,     setTotals]     = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Pagination
  const [page,     setPageRaw] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [goto,     setGoto]    = useState('');

  // Modal + toast
  const [showModal, setShowModal] = useState(false);
  const [toast,     setToast]     = useState('');
  const toastTimerRef  = useRef(null);
  const searchTimerRef = useRef(null);
  const [appliedSearch, setAppliedSearch] = useState('');

  // ── Issuer autocomplete helpers ───────────────────────────────────────────

  async function fetchIssuers(query, fetchPage, append) {
    setIssuerLoading(true);
    try {
      const params = { pageSize: 50, page: fetchPage };
      if (query) params.issuerName = query;
      const res = await api.get('/admin/v1/issuers', { params });
      const { items = [], totalPages: tp = 1 } = res.data?.data ?? {};
      if (!query && fetchPage === 1) firstPageCacheRef.current = { items, totalPages: tp };
      setIssuerSuggestions(prev => append ? [...prev, ...items] : items);
      setSuggTotalPages(tp);
      setSuggPage(fetchPage);
    } catch {
      // non-fatal
    } finally {
      setIssuerLoading(false);
    }
  }

  function openIssuerDropdown() {
    setShowIssuerDropdown(true);
    if (!issuerQuery) {
      if (firstPageCacheRef.current) {
        setIssuerSuggestions(firstPageCacheRef.current.items);
        setSuggTotalPages(firstPageCacheRef.current.totalPages);
        setSuggPage(1);
      } else {
        fetchIssuers('', 1, false);
      }
    }
  }

  function handleIssuerQueryChange(e) {
    const q = e.target.value;
    setIssuerQuery(q);
    setShowIssuerDropdown(true);
    if (!q) {
      // Revert to cached first page immediately
      if (firstPageCacheRef.current) {
        setIssuerSuggestions(firstPageCacheRef.current.items);
        setSuggTotalPages(firstPageCacheRef.current.totalPages);
        setSuggPage(1);
      } else {
        fetchIssuers('', 1, false);
      }
    }
  }

  // Debounced search when user types (non-empty query)
  useEffect(() => {
    if (!issuerQuery) return;
    clearTimeout(issuerTimerRef.current);
    issuerTimerRef.current = setTimeout(() => {
      fetchIssuers(issuerQuery.trim(), 1, false);
    }, 400);
    return () => clearTimeout(issuerTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerQuery]);

  function selectIssuer(item) {
    setSelectedIssuer(item);
    setIssuerQuery('');
    setIssuerSuggestions([]);
    setShowIssuerDropdown(false);
    setPageRaw(1);
  }

  function clearIssuer() {
    setSelectedIssuer(null);
    setIssuerQuery('');
    setPageRaw(1);
  }

  // ── Load dates when depository changes ────────────────────────────────────

  useEffect(() => {
    if (depository === 'IDT') { setDates([]); setSelectedDate(''); return; }
    api.get('/admin/v1/reconciliations/imports/dates', { params: { depository } })
      .then(res => {
        const d = res.data?.data?.dates ?? res.data?.dates ?? [];
        setDates(d);
        setSelectedDate(d.length > 0 ? d[0].reconDate : '');
      })
      .catch(() => { setDates([]); setSelectedDate(''); });
  }, [depository]);

  // ── Debounce search input ─────────────────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setAppliedSearch(search);
      setPageRaw(1);
    }, 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // ── Load table rows ───────────────────────────────────────────────────────

  const issuerCode = selectedIssuer?.issuerCode ?? '';

  const loadRows = useCallback(() => {
    if (depository === 'IDT') { setRows([]); setTotals(null); setTotalCount(0); setTotalPages(0); return; }
    if (!selectedDate) { setRows([]); setTotals(null); setTotalCount(0); setTotalPages(0); return; }

    setLoading(true);
    setFetchError('');

    const params = {
      depository,
      reconDate: selectedDate,
      page,
      limit: pageSize,
    };
    if (appliedSearch) params.search     = appliedSearch;
    if (issuerCode)    params.issuerCode = issuerCode;

    api.get('/admin/v1/reconciliations/imports', { params })
      .then(res => {
        const d = res.data?.data ?? res.data ?? {};
        setRows(d.items ?? []);
        setTotals(d.totals ?? null);
        setTotalCount(d.total ?? 0);
        setTotalPages(d.totalPages ?? 0);
      })
      .catch(err => {
        setFetchError(err.response?.data?.message || err.message || 'Failed to load data');
        setRows([]);
        setTotals(null);
      })
      .finally(() => setLoading(false));
  }, [depository, selectedDate, page, pageSize, appliedSearch, issuerCode]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setPage(p) { setPageRaw(p); setGoto(''); }

  function onGoto() {
    const p = parseInt(goto, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) setPage(p);
    setGoto('');
  }

  function showToast(msg) {
    clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 6000);
  }

  function handleUploadSuccess(data) {
    setShowModal(false);
    showToast(buildUploadToast(data));
    if (depository !== 'IDT') {
      api.get('/admin/v1/reconciliations/imports/dates', { params: { depository } })
        .then(res => {
          const d = res.data?.data?.dates ?? res.data?.dates ?? [];
          setDates(d);
          if (d.length > 0) {
            setSelectedDate(d[0].reconDate);
            setPageRaw(1);
          }
        })
        .catch(() => {});
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const cols  = depository === 'NSDL' ? NSDL_COLS : CDSL_COLS;
  const isIDT = depository === 'IDT';

  function renderTotalsRow() {
    if (!totals || isIDT) return null;
    if (depository === 'CDSL') {
      return (
        <div className="reco-totals-bar">
          <span>Totals —</span>
          <span>Free: <strong>{fmtNum(totals.totalFree)}</strong></span>
          <span>Lock: <strong>{fmtNum(totals.totalLock)}</strong></span>
          <span>Position: <strong>{fmtNum(totals.totalPosition)}</strong></span>
        </div>
      );
    }
    return (
      <div className="reco-totals-bar">
        <span>Totals —</span>
        <span>Free: <strong>{fmtNum(totals.totalFree)}</strong></span>
        <span>Lock: <strong>{fmtNum(totals.totalLock)}</strong></span>
        <span>Unlock Bal: <strong>{fmtNum(totals.totalUnlock)}</strong></span>
        <span>Lock Bal: <strong>{fmtNum(totals.totalLockBalance)}</strong></span>
        <span>Pending Demat: <strong>{fmtNum(totals.totalPendingDemat)}</strong></span>
        <span>Delivery Transit: <strong>{fmtNum(totals.totalDeliveryTransit)}</strong></span>
        <span>Receipt Transit: <strong>{fmtNum(totals.totalReceiptTransit)}</strong></span>
      </div>
    );
  }

  function renderBody() {
    if (isIDT) {
      return (
        <tr><td colSpan={cols.length}>
          <div className="reco-empty-state">
            <div className="reco-empty-circle">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="#90caf9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"/>
                <rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </div>
            <p className="reco-empty-text">IDT upload coming soon</p>
          </div>
        </td></tr>
      );
    }
    if (!selectedDate) {
      return (
        <tr><td colSpan={cols.length}>
          <div className="reco-empty-state">
            <div className="reco-empty-circle">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="#90caf9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"/>
                <rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </div>
            <p className="reco-empty-text">Select a date to view data</p>
          </div>
        </td></tr>
      );
    }
    if (loading) {
      return (
        <tr><td colSpan={cols.length}
          style={{ textAlign: 'center', padding: '24px', color: '#888', fontSize: '13px' }}>
          Loading…
        </td></tr>
      );
    }
    if (fetchError) {
      return (
        <tr><td colSpan={cols.length}
          style={{ textAlign: 'center', padding: '24px', color: '#c62828', fontSize: '13px' }}>
          {fetchError}
        </td></tr>
      );
    }
    if (!rows || rows.length === 0) {
      return (
        <tr><td colSpan={cols.length}>
          <div className="reco-empty-state">
            <div className="reco-empty-circle">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="#90caf9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"/>
                <rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </div>
            <p className="reco-empty-text">No data available</p>
          </div>
        </td></tr>
      );
    }
    return rows.map((row, i) => (
      <tr key={row.id ?? i}>
        {cols.map(col => (
          <td key={col.field} style={col.numeric ? { textAlign: 'right' } : {}}>
            {col.numeric ? fmtNum(row[col.field]) : (row[col.field] ?? '')}
          </td>
        ))}
      </tr>
    ));
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">Upload</h1>

      {/* ── Card 1: Reconciliation Upload ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Reconciliation Upload</span>
          <button className="btn-upload" onClick={() => setShowModal(true)}>
            &#8679;&nbsp;UPLOAD
          </button>
        </div>

        <div className="reco-filter-row">
          {/* Company — searchable autocomplete */}
          <div className="reco-field reco-field--company">
            <label className="reco-label">Company</label>
            {selectedIssuer ? (
              <div className="reco-issuer-selected">
                <span title={selectedIssuer.issuerCode}>
                  {selectedIssuer.issuerName || selectedIssuer.issuerCode}
                </span>
                <button
                  type="button"
                  className="reco-issuer-clear"
                  onClick={clearIssuer}
                  aria-label="Clear company filter"
                >×</button>
              </div>
            ) : (
              <div className="reco-issuer-wrap">
                <input
                  className="reco-issuer-input"
                  type="text"
                  placeholder="All companies…"
                  value={issuerQuery}
                  onChange={handleIssuerQueryChange}
                  onFocus={openIssuerDropdown}
                  onBlur={() => setTimeout(() => setShowIssuerDropdown(false), 150)}
                  autoComplete="off"
                />
                {issuerLoading && <span className="reco-issuer-spinner">…</span>}
                {showIssuerDropdown && (
                  <ul className="reco-issuer-dropdown">
                    <li
                      className="reco-issuer-option reco-issuer-option--all"
                      onMouseDown={e => { e.preventDefault(); clearIssuer(); setShowIssuerDropdown(false); }}
                    >
                      All companies
                    </li>
                    {issuerSuggestions.map(item => (
                      <li
                        key={item.issuerCode}
                        className="reco-issuer-option"
                        onMouseDown={e => { e.preventDefault(); selectIssuer(item); }}
                      >
                        <span className="reco-issuer-name">{item.issuerName || '—'}</span>
                        <span className="reco-issuer-code">{item.issuerCode}</span>
                      </li>
                    ))}
                    {!issuerLoading && issuerSuggestions.length === 0 && (
                      <li className="reco-issuer-empty">No results</li>
                    )}
                    {!issuerLoading && suggPage < suggTotalPages && (
                      <li
                        className="reco-issuer-load-more"
                        onMouseDown={e => { e.preventDefault(); fetchIssuers(issuerQuery, suggPage + 1, true); }}
                      >
                        Load more…
                      </li>
                    )}
                    {issuerLoading && (
                      <li className="reco-issuer-loading">Loading…</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Depository */}
          <div className="reco-field">
            <label className="reco-label">Depository</label>
            <select
              className="reco-select"
              value={depository}
              onChange={e => { setDepository(e.target.value); setSelectedDate(''); setPage(1); }}
            >
              <option value="CDSL">CDSL</option>
              <option value="NSDL">NSDL</option>
              <option value="IDT">IDT</option>
            </select>
          </div>

          {/* Select Date */}
          <div className="reco-field">
            <label className="reco-label">Select Date</label>
            <select
              className="reco-select"
              value={selectedDate}
              disabled={isIDT || dates.length === 0}
              onChange={e => { setSelectedDate(e.target.value); setPage(1); }}
            >
              {dates.length === 0 && <option value="">No dates available</option>}
              {dates.map(d => (
                <option key={d.reconDate} value={d.reconDate}>
                  {d.reconDate}{d.count != null ? ` (${d.count})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Card 2: Reconciliation Import Data ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Reconciliation Import Data</span>
          <div className="im-header-actions">
            <input
              className="im-input"
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginRight: 8 }}
            />
            <label className="entries-label">
              Entries per page
              <select
                className="entries-select"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {renderTotalsRow()}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {cols.map(col => (
                  <th key={col.field} style={col.numeric ? { textAlign: 'right' } : {}}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderBody()}
            </tbody>
          </table>
        </div>

        {!isIDT && selectedDate && !loading && rows && rows.length > 0 && (
          <PaginationBar
            page={page}
            perPage={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            goto={goto}
            setPage={setPage}
            setGoto={setGoto}
            onGoto={onGoto}
          />
        )}
      </div>

      {/* ── Upload modal ── */}
      {showModal && (
        <RecoUploadModal
          onClose={() => setShowModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div className="reco-toast reco-toast--info">{toast}</div>}
    </div>
  );
}

export default RecoUpload;
