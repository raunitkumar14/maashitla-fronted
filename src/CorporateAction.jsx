import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import { loadAllIsins } from './isinListCache';

const MAX_VISIBLE = 100;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function isinLabel(item) {
  return item.isinDescription
    ? `${item.isin} - ${item.isinDescription}`
    : item.isin;
}

// TODO: Replace with real API call when backend is ready.
// filters: { isin, depository, corporateActionId, internalRefNo, fromDate, toDate, page, pageSize }
// Returns: { items: Array<CorporateActionRow>, totalCount: number }
async function fetchCorporateActions(/* filters */) {
  return { items: [], totalCount: 0 };
}

function CorporateAction() {
  const navigate = useNavigate();

  // ── ISIN list ──────────────────────────────────────────────────────────────
  const [allIsins,     setAllIsins]     = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(true);
  const [isinsError,   setIsinsError]   = useState('');

  // ── ISIN combobox (filter) ─────────────────────────────────────────────────
  const [selectedIsin,   setSelectedIsin]   = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // ── Other filter fields ────────────────────────────────────────────────────
  const [depository,        setDepository]        = useState('');
  const [corporateActionId, setCorporateActionId] = useState('');
  const [internalRefNo,     setInternalRefNo]     = useState('');
  const [fromDate,          setFromDate]          = useState('');
  const [toDate,            setToDate]            = useState('');

  // ── Table / pagination ─────────────────────────────────────────────────────
  const [rows,        setRows]        = useState([]);
  const [totalCount,  setTotalCount]  = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(5);
  const [gotoPage,    setGotoPage]    = useState('');
  const [loading,     setLoading]     = useState(false);

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  useEffect(() => {
    loadAllIsins()
      .then(list => { setAllIsins(list); setIsinsLoading(false); })
      .catch(() => { setIsinsError('Could not load ISINs.'); setIsinsLoading(false); });
  }, []);

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

  async function runSearch(page, ps) {
    setLoading(true);
    try {
      const result = await fetchCorporateActions({
        isin:               selectedIsin?.isin ?? null,
        depository:         depository || null,
        corporateActionId:  corporateActionId.trim() || null,
        internalRefNo:      internalRefNo.trim() || null,
        fromDate:           fromDate || null,
        toDate:             toDate || null,
        page,
        pageSize:           ps,
      });
      setRows(result.items);
      setTotalCount(result.totalCount);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    setCurrentPage(1);
    runSearch(1, pageSize);
  }

  function handleReset() {
    setSelectedIsin(null);
    setFilterText('');
    setIsOpen(false);
    setDepository('');
    setCorporateActionId('');
    setInternalRefNo('');
    setFromDate('');
    setToDate('');
    setRows([]);
    setTotalCount(0);
    setCurrentPage(1);
  }

  function handlePageChange(page) {
    setCurrentPage(page);
    runSearch(page, pageSize);
  }

  function handlePageSizeChange(ps) {
    setPageSize(ps);
    setCurrentPage(1);
    runSearch(1, ps);
  }

  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize));
  const startEntry  = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry    = Math.min(currentPage * pageSize, totalCount);

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

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Corporate Action</span>
          <button
            className="btn-upload"
            onClick={() => navigate('/corporate-action/add')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e83e6f' }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> ADD ACTION
          </button>
        </div>

        <div className="ca-filter-grid">

          {/* Company — ISIN searchable combobox */}
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
              <option value="">— select —</option>
              <option value="NSDL">NSDL</option>
              <option value="CDSL">CDSL</option>
            </select>
          </div>

          {/* Corporate Action Id */}
          <div className="benpos-field">
            <label className="benpos-label">Corporate Action Id</label>
            <input
              type="text"
              className="benpos-date-input"
              value={corporateActionId}
              onChange={e => setCorporateActionId(e.target.value)}
            />
          </div>

          {/* Internal Reference No */}
          <div className="benpos-field">
            <label className="benpos-label">Internal Reference No</label>
            <input
              type="text"
              className="benpos-date-input"
              value={internalRefNo}
              onChange={e => setInternalRefNo(e.target.value)}
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

        <div className="im-table-wrapper">
          <table className="im-table" style={{ minWidth: 1650 }}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>ACTIONS</th>
                <th style={{ width: 80 }}>ID</th>
                <th style={{ width: 150 }}>ISIN</th>
                <th style={{ width: 300 }}>COMPANY NAME</th>
                <th style={{ width: 140 }}>INTERNAL REFERENCE NO</th>
                <th style={{ width: 120 }}>DEPOSITORY</th>
                <th style={{ width: 130 }}>EXECUTION DATE</th>
                <th style={{ width: 130 }}>ALLOTMENT DATE</th>
                <th style={{ width: 170 }}>CREATED ON</th>
                <th style={{ width: 110 }}>CREATED BY</th>
                <th style={{ width: 170 }}>UPDATED ON</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="im-empty-state">No records found</td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <button
                        className="ca-edit-btn"
                        onClick={() => navigate(`/corporate-action/${row.id}`)}
                      >
                        ✏ EDIT
                      </button>
                    </td>
                    <td>{row.id}</td>
                    <td>{row.isin}</td>
                    <td>{row.companyName}</td>
                    <td>{row.internalRefNo}</td>
                    <td>{row.depository}</td>
                    <td>{row.executionDate}</td>
                    <td>{row.allotmentDate}</td>
                    <td>{row.createdOn}</td>
                    <td>{row.createdBy}</td>
                    <td>{row.updatedOn}</td>
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
