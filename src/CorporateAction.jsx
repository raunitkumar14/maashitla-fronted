import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import { hasPermission } from './auth';
import { loadAllIsins } from './isinListCache';
import { listCas, exportCa, triggerDownload } from './services/corporateActionService';

const MAX_VISIBLE = 100;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function isinLabel(item) {
  return item.isinDescription
    ? `${item.isin} - ${item.isinDescription}`
    : item.isin;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const s = typeof iso === 'string' ? iso : new Date(iso).toISOString();
  if (s.length < 10) return s;
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
}

function fmtQty(n) {
  if (n == null) return '—';
  return Number(n).toFixed(3);
}

function fmtStatus(s) {
  if (s === 'PENDING')  return 'Pending';
  if (s === 'ACCEPTED') return 'Accepted';
  return s ?? '—';
}

function StatusBadge({ status }) {
  const cls = status === 'ACCEPTED' ? 'ca-status-badge ca-status-badge--accepted'
            : status === 'PENDING'  ? 'ca-status-badge ca-status-badge--pending'
            : 'ca-status-badge';
  return <span className={cls}>{fmtStatus(status)}</span>;
}

function CorporateAction() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const canCreate = hasPermission('corporate_action:create');

  // Success banner from Add page navigation
  const [successMsg, setSuccessMsg] = useState(() => location.state?.successMsg || '');

  // ISINs for combobox
  const [allIsins,     setAllIsins]     = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(true);
  const [isinsError,   setIsinsError]   = useState('');

  // ISIN combobox state
  const [selectedIsin,   setSelectedIsin]   = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // Filter fields
  const [depository, setDepository] = useState('');
  const [caSeqNo,    setCaSeqNo]    = useState('');
  const [status,     setStatus]     = useState('');
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');

  // Table / pagination
  const [rows,           setRows]           = useState([]);
  const [totalCount,     setTotalCount]     = useState(0);
  const [currentPage,    setCurrentPage]    = useState(1);
  const [pageSize,       setPageSize]       = useState(5);
  const [gotoPage,       setGotoPage]       = useState('');
  const [loading,        setLoading]        = useState(false);
  const [fetchError,     setFetchError]     = useState('');
  const [appliedFilters, setAppliedFilters] = useState({});
  const [exportingId,    setExportingId]    = useState(null);

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  useEffect(() => {
    loadAllIsins()
      .then(list => { setAllIsins(list); setIsinsLoading(false); })
      .catch(() => { setIsinsError('Could not load ISINs.'); setIsinsLoading(false); });
  }, []);

  // Clear success banner after 6 s and wipe navigation state
  useEffect(() => {
    if (!successMsg) return;
    navigate(location.pathname, { replace: true, state: {} });
    const t = setTimeout(() => setSuccessMsg(''), 6000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredIsins = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    if (!q) return allIsins;
    return allIsins.filter(item =>
      item.isin?.toUpperCase().includes(q) ||
      item.isinDescription?.toUpperCase().includes(q)
    );
  }, [allIsins, filterText]);

  const visibleIsins = filteredIsins.slice(0, MAX_VISIBLE);
  const hasMore      = filteredIsins.length > MAX_VISIBLE;
  const displayValue = selectedIsin ? isinLabel(selectedIsin) : '';

  function openDropdown() {
    setFilterText('');
    setIsOpen(true);
    setHighlightedIdx(-1);
    inputRef.current?.focus();
  }

  function closeDropdown() {
    setIsOpen(false);
    setFilterText('');
    setHighlightedIdx(-1);
  }

  function selectOption(item) {
    setSelectedIsin(item);
    setIsOpen(false);
    setFilterText('');
    setHighlightedIdx(-1);
  }

  useEffect(() => {
    if (!isOpen || !listRef.current || highlightedIdx < 0) return;
    listRef.current.children[highlightedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen]);

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, visibleIsins.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < visibleIsins.length) {
        selectOption(visibleIsins[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  }

  // Fetches using explicitly passed filters (not live UI state) so RESET works correctly.
  async function runFetch(filters, page, ps) {
    setLoading(true);
    setFetchError('');
    try {
      const params = { page, pageSize: ps };
      if (filters.isin)       params.isin       = filters.isin;
      if (filters.depository) params.depository = filters.depository;
      if (filters.caSeqNo)    params.caSeqNo    = filters.caSeqNo;
      if (filters.status)     params.status     = filters.status;
      if (filters.fromDate)   params.fromDate   = filters.fromDate;
      if (filters.toDate)     params.toDate     = filters.toDate;

      const result = await listCas(params);
      setRows(result.items);
      setTotalCount(result.pagination.total);
    } catch (err) {
      setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load records.');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch whenever appliedFilters, page, or pageSize changes (including on mount).
  useEffect(() => {
    runFetch(appliedFilters, currentPage, pageSize);
  }, [appliedFilters, currentPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    const filters = {
      isin:       selectedIsin?.isin  || '',
      depository: depository,
      caSeqNo:    caSeqNo.trim(),
      status:     status,
      fromDate:   fromDate,
      toDate:     toDate,
    };
    setCurrentPage(1);
    setAppliedFilters(filters);
  }

  function handleReset() {
    setSelectedIsin(null);
    setFilterText('');
    setIsOpen(false);
    setDepository('');
    setCaSeqNo('');
    setStatus('');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
    setAppliedFilters({});
  }

  function handlePageChange(page) {
    setCurrentPage(page);
  }

  function handlePageSizeChange(ps) {
    setPageSize(ps);
    setCurrentPage(1);
  }

  async function handleExport(row) {
    setExportingId(row.uploadNo);
    try {
      const res = await exportCa(row.uploadNo);
      const cd = res.headers?.['content-disposition'] ?? '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const fallback = row.depository === 'NSDL'
        ? `${row.uploadNo}.txt`
        : (row.fileName || `${row.uploadNo}.ipf`);
      triggerDownload(res.data, match?.[1] || fallback);
    } catch (err) {
      alert(err.response?.data?.error?.message ?? 'Export failed.');
    } finally {
      setExportingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startEntry = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry   = Math.min(currentPage * pageSize, totalCount);

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

  return (
    <div className="isin-master">
      <h1 className="page-heading">Corporate Action</h1>

      {successMsg && (
        <div className="im-banner im-banner--success" style={{ margin: '0 0 12px' }}>
          ✓ {successMsg}
        </div>
      )}

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Corporate Action</span>
          {canCreate && (
            <button
              className="btn-upload"
              onClick={() => navigate('/corporate-action/add')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e83e6f' }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> ADD ACTION
            </button>
          )}
        </div>

        <div className="ca-filter-grid">

          {/* Company — ISIN combobox */}
          <div className="benpos-field" ref={wrapRef}>
            <label className="benpos-label">Company</label>
            <div className="comp-combobox-wrap">
              <input
                ref={inputRef}
                className={`comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}`}
                type="text"
                value={isOpen ? filterText : displayValue}
                readOnly={!isOpen}
                placeholder={isOpen ? 'Type to filter…' : '— select ISIN —'}
                autoComplete="off"
                spellCheck={false}
                onChange={e => { if (!isOpen) return; setFilterText(e.target.value); setHighlightedIdx(-1); }}
                onClick={() => { if (!isOpen) openDropdown(); }}
                onKeyDown={handleKeyDown}
                onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget)) closeDropdown(); }}
              />
              <span
                className={`comp-combobox-arrow${isOpen ? ' comp-combobox-arrow--open' : ''}`}
                aria-hidden="true"
                onMouseDown={e => e.preventDefault()}
                onClick={() => (isOpen ? closeDropdown() : openDropdown())}
              >▾</span>
              {isOpen && (
                <ul className="comp-combobox-dropdown" ref={listRef}>
                  {isinsLoading ? (
                    <li className="comp-combobox-hint">Loading ISINs…</li>
                  ) : isinsError ? (
                    <li className="comp-combobox-hint comp-combobox-hint--error">{isinsError}</li>
                  ) : (
                    <>
                      {visibleIsins.map((item, i) => (
                        <li
                          key={item.isin}
                          className={`comp-combobox-option${i === highlightedIdx ? ' comp-combobox-option--highlighted' : ''}`}
                          onMouseDown={e => { e.preventDefault(); selectOption(item); }}
                          onMouseEnter={() => setHighlightedIdx(i)}
                        >
                          {isinLabel(item)}
                        </li>
                      ))}
                      {visibleIsins.length === 0 && (
                        <li className="comp-combobox-hint">No ISINs match</li>
                      )}
                      {hasMore && (
                        <li className="comp-combobox-hint">
                          Showing first {MAX_VISIBLE} of {filteredIsins.length.toLocaleString()} — type to narrow
                        </li>
                      )}
                    </>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Depository */}
          <div className="benpos-field">
            <label className="benpos-label">Depository</label>
            <select
              className="benpos-select"
              value={depository}
              onChange={e => setDepository(e.target.value)}
            >
              <option value="">— all —</option>
              <option value="NSDL">NSDL</option>
              <option value="CDSL">CDSL</option>
            </select>
          </div>

          {/* CA Seq No */}
          <div className="benpos-field">
            <label className="benpos-label">CA Seq No</label>
            <input
              type="text"
              className="benpos-date-input"
              value={caSeqNo}
              onChange={e => setCaSeqNo(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="benpos-field">
            <label className="benpos-label">Status</label>
            <select
              className="benpos-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="">— all —</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
            </select>
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

        </div>

        {/* Search / Reset buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px 26px', flexWrap: 'wrap' }}>
          <button
            className="btn-action btn-action--pink"
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: '11px 20px', fontSize: 12 }}
          >
            SEARCH
          </button>
          <button
            className="btn-action btn-action--white"
            onClick={handleReset}
            style={{ padding: '11px 20px', fontSize: 12 }}
          >
            RESET
          </button>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Corporate Action List</span>
          <div className="entries-label">
            Entries per page
            <select
              className="entries-select"
              value={pageSize}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {fetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '10px 20px 0' }}>
            ⚠ {fetchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table" style={{ minWidth: 1620 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>ACTIONS</th>
                <th style={{ width: 70  }}>ID</th>
                <th style={{ width: 200 }}>COMPANY</th>
                <th style={{ width: 130 }}>ISIN</th>
                <th style={{ width: 110 }}>CA SEQ NO</th>
                <th style={{ width: 100 }}>DEPOSITORY</th>
                <th style={{ width: 110 }}>TYPE</th>
                <th style={{ width: 95  }}>STATUS</th>
                <th style={{ width: 100 }}>TOTAL RECORDS</th>
                <th style={{ width: 140 }}>TOTAL CURRENT QTY</th>
                <th style={{ width: 80  }}>HAS DNR</th>
                <th style={{ width: 130 }}>CREATED BY</th>
                <th style={{ width: 110 }}>CREATED ON</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} className="im-empty-state">Loading…</td></tr>
              ) : fetchError ? (
                <tr><td colSpan={13} className="im-empty-state">—</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="im-empty-state">No records found</td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.uploadNo}>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          className="ca-edit-btn"
                          onClick={() => navigate(`/corporate-action/${row.uploadNo}`)}
                        >
                          ✏ EDIT
                        </button>
                        <button
                          className="ca-edit-btn"
                          style={{ background: '#f0f7ff', borderColor: '#2e86e0', color: '#1565c0' }}
                          disabled={exportingId === row.uploadNo}
                          onClick={() => handleExport(row)}
                        >
                          {exportingId === row.uploadNo ? '…' : (row.depository === 'NSDL' ? '↓ TXT' : '↓ IPF')}
                        </button>
                      </div>
                    </td>
                    <td>{row.uploadNo}</td>
                    <td>{row.companyName || '—'}</td>
                    <td>{row.isin}</td>
                    <td>{row.caSeqNo || '—'}</td>
                    <td>{row.depository}</td>
                    <td>{row.caTypeMode ? row.caTypeMode.charAt(0) + row.caTypeMode.slice(1).toLowerCase() : '—'}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.totalRecords}</td>
                    <td>{fmtQty(row.totalCurrentQty)}</td>
                    <td>{row.hasDnr ? 'Yes' : 'No'}</td>
                    <td>{row.createdByName || '—'}</td>
                    <td>{fmtDate(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="im-pagination">
          <div className="pagination-info">
            {totalCount === 0
              ? 'No entries'
              : `Showing ${startEntry} to ${endEntry} of ${totalCount} entries`}
          </div>
          <div className="pagination-controls">
            {pages.map(p => (
              <button
                key={p}
                className={`page-btn${p === currentPage ? ' page-btn--active' : ''}`}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </button>
            ))}
            {lastBtn < totalPages && (
              <>
                <span className="page-ellipsis">…</span>
                <button className="page-btn" onClick={() => handlePageChange(totalPages)}>
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
                  handlePageChange(p);
                  setGotoPage('');
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default CorporateAction;
