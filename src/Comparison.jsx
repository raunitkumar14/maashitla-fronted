import { useState, useEffect, useRef, useMemo } from 'react';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import { loadAllIsins } from './isinListCache';
import api from './api/axios';
import { downloadComparisonReport } from './comparisonExport';

const MAX_VISIBLE = 100;

function fmtDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function DateDropdown({ label, value, onChange, options, loading }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);

  function close() { setIsOpen(false); }
  function select(v) { onChange(v); setIsOpen(false); }

  return (
    <div className="benpos-field benpos-field--date" ref={wrapRef}>
      <label className="benpos-label">{label}</label>
      <div className="comp-combobox-wrap">
        <div
          className={`comp-datesel-display comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}${loading ? ' comp-combobox-input--disabled' : ''}`}
          tabIndex={loading ? -1 : 0}
          onClick={() => { if (!loading) setIsOpen(o => !o); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!loading) setIsOpen(true); }
            else if (e.key === 'Escape') close();
          }}
          onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget)) close(); }}
        >
          <span style={!value ? { color: '#aaa' } : {}}>
            {loading ? 'Loading…' : value ? fmtDDMMYYYY(value) : '— select —'}
          </span>
        </div>
        <span
          className={`comp-combobox-arrow${isOpen ? ' comp-combobox-arrow--open' : ''}`}
          aria-hidden="true"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { if (!loading) setIsOpen(o => !o); }}
        >▾</span>
        {isOpen && (
          <ul className="comp-combobox-dropdown">
            {options.length === 0 ? (
              <li className="comp-combobox-hint">No dates available</li>
            ) : options.map(d => (
              <li
                key={d}
                className={`comp-combobox-option${d === value ? ' comp-combobox-option--highlighted' : ''}`}
                onMouseDown={e => { e.preventDefault(); select(d); }}
              >
                {fmtDDMMYYYY(d)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function isinLabel(item) {
  return item.isinDescription
    ? `${item.isin} - ${item.isinDescription}`
    : item.isin;
}

function Comparison() {
  // ── ISIN list (module-level cache) ────────────────────────────────────────
  const [allIsins,     setAllIsins]     = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(true);
  const [isinsError,   setIsinsError]   = useState('');

  // ── Combobox state ────────────────────────────────────────────────────────
  const [selectedIsin,   setSelectedIsin]   = useState(null); // null = "All"
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1); // -1=All, 0..n-1=isins

  // ── Other fields ──────────────────────────────────────────────────────────
  const [fromDate,    setFromDate]    = useState('');
  const [toDate,      setToDate]      = useState('');
  const [downloading, setDownloading] = useState(false);
  const [message,     setMessage]     = useState('');
  const [error,       setError]       = useState('');

  // ── BenPos date list for dropdowns ────────────────────────────────────────
  const [benposDates,  setBenposDates]  = useState([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError,   setDatesError]   = useState('');

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Load all ISINs once on mount
  useEffect(() => {
    loadAllIsins()
      .then(list => { setAllIsins(list); setIsinsLoading(false); })
      .catch(() => { setIsinsError('Could not load ISINs.'); setIsinsLoading(false); });
  }, []);

  // Reload BenPos dates whenever the selected ISIN changes (also runs on mount)
  useEffect(() => {
    const isinParam = selectedIsin ? selectedIsin.isin : 'ALL';
    setDatesLoading(true);
    setDatesError('');
    setBenposDates([]);
    setFromDate('');
    setToDate('');
    api.get('/admin/v1/benpos/comparison/dates', { params: { isin: isinParam } })
      .then(res => {
        setBenposDates(res.data?.data?.dates ?? []);
        setDatesLoading(false);
      })
      .catch(err => {
        setDatesError(err.response?.data?.error?.message ?? err.message ?? 'Could not load dates.');
        setDatesLoading(false);
      });
  }, [selectedIsin]);

  // ── In-memory filter ──────────────────────────────────────────────────────
  const filteredIsins = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    if (!q) return allIsins;
    return allIsins.filter(item =>
      item.isin?.toUpperCase().includes(q) ||
      item.isinDescription?.toUpperCase().includes(q)
    );
  }, [allIsins, filterText]);

  const showAllOption = !filterText.trim(); // "All" only visible when no filter text
  const visibleIsins  = filteredIsins.slice(0, MAX_VISIBLE);
  const hasMore       = filteredIsins.length > MAX_VISIBLE;

  // Date dropdown options: filter each list to exclude invalid pairings
  const fromDateOptions = toDate   ? benposDates.filter(d => d < toDate)   : benposDates;
  const toDateOptions   = fromDate ? benposDates.filter(d => d > fromDate) : benposDates;

  // ── Display value when closed ─────────────────────────────────────────────
  const displayValue = selectedIsin ? isinLabel(selectedIsin) : 'All';

  // ── Combobox controls ─────────────────────────────────────────────────────
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

  function selectOption(item) { // item = null → "All"
    setSelectedIsin(item);
    setIsOpen(false);
    setFilterText('');
    setHighlightedIdx(-1);
  }

  // ── Scroll highlighted option into view ───────────────────────────────────
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    // "All" is the first <li> when shown; isins follow after it
    const offset = showAllOption ? 1 : 0;
    const liIdx  = highlightedIdx === -1 ? 0 : highlightedIdx + offset;
    listRef.current.children[liIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen, showAllOption]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  function handleKeyDown(e) {
    // If closed, a few keys can open it
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => {
        if (showAllOption && prev === -1) return visibleIsins.length > 0 ? 0 : -1;
        return Math.min(prev + 1, visibleIsins.length - 1);
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => {
        if (prev <= 0) return showAllOption ? -1 : 0;
        return prev - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx === -1 && showAllOption) {
        selectOption(null);
      } else if (highlightedIdx >= 0 && highlightedIdx < visibleIsins.length) {
        selectOption(visibleIsins[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  }

  // ── DOWNLOAD ──────────────────────────────────────────────────────────────
  async function handleDownload() {
    setMessage('');
    setError('');

    if (!fromDate) { setError('From Date is required.'); return; }
    if (!toDate)   { setError('To Date is required.');   return; }
    if (fromDate >= toDate) { setError('From Date must be before To Date.'); return; }

    const isinParam = selectedIsin ? selectedIsin.isin : 'ALL';

    setDownloading(true);
    try {
      const res = await api.get('/admin/v1/benpos/comparison', {
        params: { isin: isinParam, fromDate, toDate },
      });
      const data = res.data?.data;
      if (!data || data.totalRows === 0) {
        setMessage('No change in holdings between the two dates.');
        return;
      }
      await downloadComparisonReport(data);
    } catch (err) {
      const msg = err.response?.data?.error?.message
        ?? err.response?.data?.message
        ?? err.message
        ?? 'Download failed.';
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="isin-master">
      <h1 className="page-heading">Comparison Report</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>Comparison Report</span>
        </div>

        <div className="benpos-filter-body">
          <div className="benpos-filter-row">

            {/* ── ISIN combobox ── */}
            <div className="benpos-field comp-isin-field" ref={wrapRef}>
              <label className="benpos-label">ISIN</label>
              <div className="comp-combobox-wrap">

                {/* Input — read-only when closed; editable when open for filtering */}
                <input
                  ref={inputRef}
                  className={`comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}`}
                  type="text"
                  value={isOpen ? filterText : displayValue}
                  readOnly={!isOpen}
                  placeholder={isOpen ? 'Type to filter…' : ''}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={e => {
                    if (!isOpen) return;
                    const v = e.target.value;
                    setFilterText(v);
                    // When user starts typing reset highlight:
                    // filtered mode → first isin; blank → All option
                    setHighlightedIdx(v.trim() ? 0 : -1);
                  }}
                  onClick={() => { if (!isOpen) openDropdown(); }}
                  onKeyDown={handleKeyDown}
                  onBlur={e => {
                    // Close only when focus truly leaves the combobox
                    // (e.relatedTarget is null or outside wrapRef)
                    if (!wrapRef.current?.contains(e.relatedTarget)) {
                      closeDropdown();
                    }
                  }}
                />

                {/* Chevron arrow — toggles the dropdown */}
                {/* onMouseDown prevents blur so the input stays focused */}
                <span
                  className={`comp-combobox-arrow${isOpen ? ' comp-combobox-arrow--open' : ''}`}
                  aria-hidden="true"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => (isOpen ? closeDropdown() : openDropdown())}
                >
                  ▾
                </span>

                {/* Dropdown list */}
                {isOpen && (
                  <ul className="comp-combobox-dropdown" ref={listRef}>
                    {isinsLoading ? (
                      <li className="comp-combobox-hint">Loading ISINs…</li>
                    ) : isinsError ? (
                      <li className="comp-combobox-hint comp-combobox-hint--error">{isinsError}</li>
                    ) : (
                      <>
                        {/* "All" option — visible only when no filter text */}
                        {showAllOption && (
                          <li
                            className={`comp-combobox-option comp-combobox-option--all${highlightedIdx === -1 ? ' comp-combobox-option--highlighted' : ''}`}
                            onMouseDown={e => { e.preventDefault(); selectOption(null); }}
                            onMouseEnter={() => setHighlightedIdx(-1)}
                          >
                            All
                          </li>
                        )}

                        {/* ISIN options (max MAX_VISIBLE) */}
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

                        {/* No-match message when filter yields nothing */}
                        {!showAllOption && visibleIsins.length === 0 && (
                          <li className="comp-combobox-hint">No ISINs match</li>
                        )}

                        {/* Hint when list is truncated */}
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

            {/* ── From Date ── */}
            <DateDropdown
              label="From Date"
              value={fromDate}
              onChange={setFromDate}
              options={fromDateOptions}
              loading={datesLoading}
            />

            {/* ── To Date ── */}
            <DateDropdown
              label="To Date"
              value={toDate}
              onChange={setToDate}
              options={toDateOptions}
              loading={datesLoading}
            />

            {/* ── DOWNLOAD ── */}
            <button
              className="btn-action btn-action--pink benpos-download-btn"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? '…' : '↓ DOWNLOAD'}
            </button>

          </div>

          {!datesLoading && datesError && <div className="im-banner im-banner--error">⚠ {datesError}</div>}
          {!datesLoading && !datesError && benposDates.length === 0 && <div className="im-banner im-banner--info">No BenPos dates for this ISIN.</div>}
          {error   && <div className="im-banner im-banner--error">⚠ {error}</div>}
          {message && <div className="im-banner im-banner--info">ℹ {message}</div>}
        </div>
      </div>
    </div>
  );
}

export default Comparison;
