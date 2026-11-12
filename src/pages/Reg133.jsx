import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import '../IsinMaster.css';
import '../Comparison.css';
import './Pas6.css';
import '../UploadModal.css';
import '../CategoryMappingUploadModal.css';
import '../CategoryMapping.css';
import { hasPermission } from '../auth';
import { triggerDownload } from '../services/daakService';
import {
  getTemplate, importFile, list as listReg133,
  getCompanies, getQuarterDates, exportReport,
} from '../services/reg133Service';

const PERM_VIEW   = 'regulation_13_3:view';
const PERM_IMPORT = 'regulation_13_3:import';
const PERM_EXPORT = 'regulation_13_3:export';
const MAX_VISIBLE = 100;

const COLS = [
  { header: 'Company',              field: 'companyName'    },
  { header: 'Issuer Code',          field: 'issuerCode'     },
  { header: 'Quarter End Date',     field: 'quarterEndDate' },
  { header: 'Pending at Beginning', field: 'pendingBegin'   },
  { header: 'Received',             field: 'received'       },
  { header: 'Disposed',             field: 'disposed'       },
  { header: 'Unresolved at End',    field: 'unresolvedEnd'  },
];

function fmtDate(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

async function readBlobError(blob) {
  try { return JSON.parse(await blob.text())?.error?.message ?? null; }
  catch { return null; }
}

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
          onChange={e => setGoto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>&rarr;</button>
      </div>
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function Reg133UploadModal({ companies, onClose, onComplete }) {
  const [mode,           setMode]           = useState('single');
  const [uploadCompany,  setUploadCompany]  = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [file,           setFile]           = useState(null);
  const [phase,          setPhase]          = useState('idle'); // idle|uploading|done|error
  const [result,         setResult]         = useState(null);
  const [errorMsg,       setErrorMsg]       = useState('');
  const [dragOver,       setDragOver]       = useState(false);

  const fileInputRef = useRef(null);
  const wrapRef      = useRef(null);
  const inputRef     = useRef(null);
  const listRef      = useRef(null);

  const isUploading = phase === 'uploading';
  const isDone      = phase === 'done';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !isUploading) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isUploading, onClose]);

  const filteredCompanies = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.issuerCode?.toUpperCase().includes(q) ||
      c.companyName?.toUpperCase().includes(q)
    );
  }, [companies, filterText]);

  const visibleCos = filteredCompanies.slice(0, MAX_VISIBLE);
  const hasMore    = filteredCompanies.length > MAX_VISIBLE;

  const displayValue = uploadCompany
    ? `${uploadCompany.companyName} - ${uploadCompany.issuerCode}`
    : '';

  function openDropdown() { setFilterText(''); setIsOpen(true); setHighlightedIdx(0); inputRef.current?.focus(); }
  function closeDropdown() { setIsOpen(false); setFilterText(''); setHighlightedIdx(0); }
  function selectOption(item) { setUploadCompany(item); setIsOpen(false); setFilterText(''); setHighlightedIdx(0); }

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    listRef.current.children[Math.max(0, highlightedIdx)]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen]);

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, visibleCos.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < visibleCos.length) selectOption(visibleCos[highlightedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); closeDropdown();
    }
  }

  function handleFileSelect(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMsg('Only .xlsx files are accepted.');
      return;
    }
    setFile(f);
    setErrorMsg('');
    if (phase === 'error') setPhase('idle');
  }

  function resetMode(newMode) {
    setMode(newMode);
    setUploadCompany(null);
    setFile(null);
    setErrorMsg('');
    setPhase('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUpload() {
    if (!file || isUploading) return;
    if (mode === 'single' && !uploadCompany) return;
    setPhase('uploading');
    setErrorMsg('');
    try {
      const res = await importFile(file, mode === 'single' ? uploadCompany.issuerCode : null);
      setResult(res);
      setPhase('done');
    } catch (err) {
      let msg = err.message ?? 'Upload failed.';
      if (err.response?.data instanceof Blob) {
        const fromBlob = await readBlobError(err.response.data);
        if (fromBlob) msg = fromBlob;
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      }
      setErrorMsg(msg);
      setPhase('error');
    }
  }

  const canUpload = !!file && !isUploading && (mode === 'bulk' || !!uploadCompany);

  return (
    <div className="upload-overlay" onClick={!isUploading && !isDone ? onClose : undefined}>
      <div
        className="cmu-modal"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upload Regulation 13(3)"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="white">
              <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
            </svg>
          </span>
          <span className="um-header-title">Upload Regulation 13(3)</span>
          <button
            className="um-close-btn"
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close"
          >&times;</button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="cmu-body">

          {!isDone && (
            <>
              {/* Radio: mode */}
              <div style={{ display: 'flex', gap: '20px', padding: '10px 0 8px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', color: '#333' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="radio" value="single" checked={mode === 'single'} onChange={() => resetMode('single')} />
                  Single company
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="radio" value="bulk" checked={mode === 'bulk'} onChange={() => resetMode('bulk')} />
                  Bulk (all companies in the file)
                </label>
              </div>

              {/* Company combobox — single mode only */}
              {mode === 'single' && (
                <div style={{ marginBottom: '10px' }} ref={wrapRef}>
                  <label className="pas6-label" style={{ display: 'block', marginBottom: '4px' }}>
                    Company <span style={{ color: '#c62828' }}>*</span>
                  </label>
                  <div className="comp-combobox-wrap">
                    <input
                      ref={inputRef}
                      className={`comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}`}
                      type="text"
                      value={isOpen ? filterText : displayValue}
                      readOnly={!isOpen}
                      placeholder={isOpen ? 'Type to filter…' : 'Select company…'}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={e => {
                        if (!isOpen) return;
                        const v = e.target.value;
                        setFilterText(v);
                        setHighlightedIdx(0);
                      }}
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
                        {visibleCos.length === 0 ? (
                          <li className="comp-combobox-hint">No matching company</li>
                        ) : (
                          visibleCos.map((c, i) => (
                            <li
                              key={c.issuerCode}
                              className={`comp-combobox-option${i === highlightedIdx ? ' comp-combobox-option--highlighted' : ''}`}
                              onMouseDown={e => { e.preventDefault(); selectOption(c); }}
                              onMouseEnter={() => setHighlightedIdx(i)}
                            >
                              {c.companyName} - {c.issuerCode}
                            </li>
                          ))
                        )}
                        {hasMore && <li className="comp-combobox-hint">Type to narrow results</li>}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Bulk note */}
              {mode === 'bulk' && (
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#666', fontFamily: 'Arial, Helvetica, sans-serif', fontStyle: 'italic' }}>
                  Issuer Code is required in every row.
                </p>
              )}

              {/* File chooser */}
              {file ? (
                <div className="cmu-file-card">
                  <svg className="cmu-file-icon" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <polyline points="9 15 11 17 15 13"/>
                  </svg>
                  <div className="cmu-file-info">
                    <span className="cmu-file-name">{file.name}</span>
                    <span className="cmu-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                  {!isUploading && (
                    <button
                      className="cmu-file-remove"
                      onClick={() => { setFile(null); setPhase('idle'); setErrorMsg(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      aria-label="Remove file"
                    >&times;</button>
                  )}
                </div>
              ) : (
                <div
                  className={`um-body${dragOver ? ' cmu-drop-zone--over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
                >
                  <svg className="um-cloud-icon" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16"/>
                    <line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                  <p className="um-drop-text"><strong>Drag &amp; Drop your file here</strong></p>
                  <p className="um-browse-text">or click to browse (Only .xlsx files allowed)</p>
                </div>
              )}

              {/* Uploading spinner */}
              {isUploading && (
                <div className="cmu-uploading-row">
                  <div className="um-spinner" />
                  <span className="um-parsing-text">Uploading {file?.name}…</span>
                </div>
              )}

              {/* Inline error */}
              {phase === 'error' && errorMsg && (
                <p className="cmu-error-msg">&#9888; {errorMsg}</p>
              )}
            </>
          )}

          {/* ── Upload result ─────────────────────────────────────────────── */}
          {isDone && result && (
            <div style={{ padding: '10px 0 4px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
              <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#333', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span><strong>Total:</strong> {result.total ?? 0}</span>
                <span><strong>Added:</strong> {result.inserted ?? 0}</span>
                <span><strong>Updated:</strong> {result.updated ?? 0}</span>
                <span><strong>Rejected:</strong> {result.rejected ?? 0}</span>
              </div>
              {result.errors?.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', color: '#c62828', fontWeight: 600, marginBottom: '4px' }}>Rejected rows:</div>
                  <ul style={{
                    margin: 0, padding: '8px 8px 8px 24px',
                    fontSize: '12px', color: '#c62828',
                    maxHeight: '140px', overflowY: 'auto',
                    border: '1px solid #ef9a9a', borderRadius: '4px',
                    background: '#fdecea',
                  }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={e => { handleFileSelect(e.target.files[0]); e.target.value = ''; }}
        />

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="cmu-footer">
          {isDone ? (
            <button className="cmu-submit-btn" onClick={() => onComplete(result)}>CLOSE</button>
          ) : (
            <>
              <button className="cmu-cancel-btn" disabled={isUploading} onClick={onClose}>CANCEL</button>
              <button className="cmu-submit-btn" disabled={!canUpload} onClick={handleUpload}>
                {isUploading ? '⏳ Uploading…' : '↑ UPLOAD'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Reg133() {
  const canView   = hasPermission(PERM_VIEW);
  const canImport = hasPermission(PERM_IMPORT);
  const canExport = hasPermission(PERM_EXPORT);

  // ── Companies ─────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState([]);

  // ── Filter card: company combobox ─────────────────────────────────────────
  const [filterCompany,  setFilterCompany]  = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // ── Filter card: quarter date ─────────────────────────────────────────────
  const [quarterDates,        setQuarterDates]        = useState([]);
  const [quarterDatesLoading, setQuarterDatesLoading] = useState(true);
  const [selectedQuarterDate, setSelectedQuarterDate] = useState('');

  // ── Applied filters ───────────────────────────────────────────────────────
  const [appliedIssuerCode,  setAppliedIssuerCode]  = useState('');
  const [appliedQuarterDate, setAppliedQuarterDate] = useState('');
  const [searchSeq,          setSearchSeq]          = useState(0);

  // ── Table ─────────────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [page,       setPage]       = useState(1);
  const [perPage,    setPerPage]    = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [goto,       setGoto]       = useState('');

  // ── Upload modal ──────────────────────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);

  // ── Download ──────────────────────────────────────────────────────────────
  const [downloading,   setDownloading]   = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Load companies on mount
  useEffect(() => {
    getCompanies().then(setCompanies).catch(() => {});
  }, []);

  // Reload quarter dates when filter company changes
  useEffect(() => {
    setSelectedQuarterDate('');
    setQuarterDates([]);
    setQuarterDatesLoading(true);
    getQuarterDates(filterCompany?.issuerCode)
      .then(dates => { setQuarterDates(dates); setQuarterDatesLoading(false); })
      .catch(() => setQuarterDatesLoading(false));
  }, [filterCompany]);

  // Fetch table rows (server-side pagination + filters)
  const fetchRows = useCallback(async () => {
    if (!canView) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setFetchError('');
    try {
      const params = { page, pageSize: perPage };
      if (appliedIssuerCode)  params.issuerCode     = appliedIssuerCode;
      if (appliedQuarterDate) params.quarterEndDate = appliedQuarterDate;
      const { rows: r, totalCount: tc, totalPages: tp } = await listReg133(params);
      setRows(r);
      setTotalCount(tc);
      setTotalPages(Math.max(1, tp));
    } catch (err) {
      setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load data.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, page, perPage, appliedIssuerCode, appliedQuarterDate, searchSeq]); // eslint-disable-line

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Combobox (filter card) ─────────────────────────────────────────────────

  const filteredCompanies = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.issuerCode?.toUpperCase().includes(q) ||
      c.companyName?.toUpperCase().includes(q)
    );
  }, [companies, filterText]);

  const qLower          = filterText.trim().toLowerCase();
  const showAllOption   = !qLower || 'all'.includes(qLower);
  const visibleCompanies = filteredCompanies.slice(0, MAX_VISIBLE);
  const hasMore          = filteredCompanies.length > MAX_VISIBLE;

  const displayValue = filterCompany
    ? `${filterCompany.companyName} - ${filterCompany.issuerCode}`
    : 'All';

  function openDropdown()  { setFilterText(''); setIsOpen(true);  setHighlightedIdx(-1); inputRef.current?.focus(); }
  function closeDropdown() { setIsOpen(false);  setFilterText(''); setHighlightedIdx(-1); }

  function selectFilterOption(item) {
    setFilterCompany(item);
    setIsOpen(false);
    setFilterText('');
    setHighlightedIdx(-1);
    setDownloadError('');
  }

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const offset = showAllOption ? 1 : 0;
    const liIdx  = highlightedIdx === -1 ? 0 : highlightedIdx + offset;
    listRef.current.children[liIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen, showAllOption]);

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => {
        if (showAllOption && prev === -1) return visibleCompanies.length > 0 ? 0 : -1;
        return Math.min(prev + 1, visibleCompanies.length - 1);
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => { if (prev <= 0) return showAllOption ? -1 : 0; return prev - 1; });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx === -1 && showAllOption) selectFilterOption(null);
      else if (highlightedIdx >= 0 && highlightedIdx < visibleCompanies.length) selectFilterOption(visibleCompanies[highlightedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); closeDropdown();
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSearch() {
    setAppliedIssuerCode(filterCompany?.issuerCode || '');
    setAppliedQuarterDate(selectedQuarterDate);
    setPage(1);
    setSearchSeq(s => s + 1);
  }

  function handleClear() {
    setFilterCompany(null);
    setSelectedQuarterDate('');
    setAppliedIssuerCode('');
    setAppliedQuarterDate('');
    setPage(1);
    setSearchSeq(s => s + 1);
    setDownloadError('');
  }

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  async function handleSampleDownload() {
    try {
      const res = await getTemplate();
      const cd    = res.headers?.['content-disposition'] ?? '';
      const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = match?.[1]?.replace(/['"]/g, '') || 'Reg133_Template.xlsx';
      triggerDownload(res.data, filename);
    } catch { /* no-op */ }
  }

  async function handleDownload() {
    if (!selectedQuarterDate || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const issuerCode = filterCompany?.issuerCode || 'ALL';
      const res = await exportReport(issuerCode, selectedQuarterDate);
      const cd    = res.headers?.['content-disposition'] ?? '';
      const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = match?.[1]?.replace(/['"]/g, '')
        || `Reg133_${issuerCode}_${selectedQuarterDate}.${issuerCode === 'ALL' ? 'zip' : 'pdf'}`;
      triggerDownload(res.data, filename);
    } catch (err) {
      let msg = err.message ?? 'Download failed.';
      if (err.response?.data instanceof Blob) {
        const fromBlob = await readBlobError(err.response.data);
        if (fromBlob) msg = fromBlob;
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      }
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  }

  function handleUploadComplete(uploadResult) {
    setShowUpload(false);
    if (uploadResult) fetchRows();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="isin-master">
        <h1 className="page-heading">Regulation 13(3)</h1>

        {/* ── Card 1: title + actions ──────────────────────────────────────── */}
        <div className="im-card">
          <div className="im-card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ flex: '1 1 260px', lineHeight: 1.4 }}>
              Quarterly Statement of Investor Complaints (Pursuant to Regulation 13(3) of SEBI (LODR) Regulations, 2015)
            </span>
            {canImport && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                <button className="btn-action btn-action--white cm-btn-icon" onClick={handleSampleDownload}>
                  ↓ SAMPLE
                </button>
                <button className="btn-upload cm-btn-icon" onClick={() => setShowUpload(true)}>
                  ↑ UPLOAD
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Card 2: filters + download ───────────────────────────────────── */}
        <div className="im-card">
          <div className="pas6-form-row">

            {/* Company searchable combobox */}
            <div className="pas6-field" ref={wrapRef}>
              <label className="pas6-label">Company</label>
              <div className="comp-combobox-wrap" style={{ minWidth: '240px' }}>
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
                    setHighlightedIdx(v.trim() ? 0 : -1);
                  }}
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
                    {showAllOption && (
                      <li
                        className={`comp-combobox-option comp-combobox-option--all${highlightedIdx === -1 ? ' comp-combobox-option--highlighted' : ''}`}
                        onMouseDown={e => { e.preventDefault(); selectFilterOption(null); }}
                        onMouseEnter={() => setHighlightedIdx(-1)}
                      >All</li>
                    )}
                    {visibleCompanies.map((c, i) => (
                      <li
                        key={c.issuerCode}
                        className={`comp-combobox-option${i === highlightedIdx ? ' comp-combobox-option--highlighted' : ''}`}
                        onMouseDown={e => { e.preventDefault(); selectFilterOption(c); }}
                        onMouseEnter={() => setHighlightedIdx(i)}
                      >
                        {c.companyName} - {c.issuerCode}
                      </li>
                    ))}
                    {!showAllOption && visibleCompanies.length === 0 && (
                      <li className="comp-combobox-hint">No matching company</li>
                    )}
                    {hasMore && <li className="comp-combobox-hint">Type to narrow results</li>}
                  </ul>
                )}
              </div>
            </div>

            {/* Quarter End Date */}
            <div className="pas6-field">
              <label className="pas6-label">Quarter End Date</label>
              {quarterDatesLoading ? (
                <select className="pas6-select" disabled><option>Loading…</option></select>
              ) : quarterDates.length === 0 ? (
                <select className="pas6-select" disabled><option>No dates available</option></select>
              ) : (
                <select
                  className="pas6-select"
                  value={selectedQuarterDate}
                  onChange={e => { setSelectedQuarterDate(e.target.value); setDownloadError(''); }}
                >
                  <option value="">— Select date —</option>
                  {quarterDates.map(d => (
                    <option key={d} value={d}>{fmtDate(d)}</option>
                  ))}
                </select>
              )}
            </div>

            <button className="btn-action btn-action--pink" onClick={handleSearch}>SEARCH</button>
            <button className="btn-action btn-action--grey" onClick={handleClear}>CLEAR</button>

            {canExport && (
              <button
                className="btn-action btn-action--pink"
                onClick={handleDownload}
                disabled={!selectedQuarterDate || downloading}
              >
                {downloading ? 'Downloading…' : 'DOWNLOAD'}
              </button>
            )}
          </div>

          {downloadError && (
            <div className="pas6-error-wrap">
              <div className="im-banner im-banner--error">{downloadError}</div>
            </div>
          )}
        </div>

        {/* ── Card 3: data table ───────────────────────────────────────────── */}
        <div className="im-card">
          <div className="im-card-header">
            <span>Regulation 13(3) List</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label className="entries-label">
                Entries per page
                <select
                  className="entries-select"
                  value={perPage}
                  onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
          </div>

          {fetchError && (
            <div className="im-banner im-banner--error" style={{ margin: '10px 14px' }}>{fetchError}</div>
          )}

          <div className="im-table-wrapper">
            <table className="im-table">
              <thead>
                <tr>{COLS.map(c => <th key={c.field}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="im-empty-state" colSpan={COLS.length}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td className="im-empty-state" colSpan={COLS.length}>No records found.</td></tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={row.id ?? idx}>
                      {COLS.map(c => (
                        <td key={c.field}>
                          {c.field === 'quarterEndDate'
                            ? fmtDate(row[c.field])
                            : (row[c.field] == null || row[c.field] === '' ? '—' : row[c.field])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={page}        perPage={perPage}
            totalCount={totalCount} totalPages={totalPages}
            goto={goto}        setPage={setPage}
            setGoto={setGoto}  onGoto={handleGoto}
          />
        </div>

      </div>

      {showUpload && (
        <Reg133UploadModal
          companies={companies}
          onClose={() => setShowUpload(false)}
          onComplete={handleUploadComplete}
        />
      )}
    </>
  );
}

export default Reg133;
