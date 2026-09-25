import { useState, useEffect } from 'react';
import './IsinMaster.css';
import './UploadModal.css';
import IsinUploadModal from './IsinUploadModal';
import api from './api/axios';

// ── Column definitions ────────────────────────────────────────────────────────

const ISIN_COLUMNS = [
  { header: 'ISIN',                         field: 'isin',                   isDate: false },
  { header: 'ISIN Description',             field: 'isinDescription',        isDate: false },
  { header: 'Security Type',                field: 'securityType',           isDate: false },
  { header: 'ISIN Status (CDSL)',           field: 'isinStatus',             isDate: false },
  { header: 'Face Value',                   field: 'faceValue',              isDate: false },
  { header: 'Paidup Value',                 field: 'paidupValue',            isDate: false },
  { header: 'Issue Date (CDSL)',            field: 'issueDateCdsl',          isDate: true  },
  { header: 'Convert Date (CDSL)',          field: 'convertDateCdsl',        isDate: true  },
  { header: 'Issue Date (NSDL)',            field: 'issueDateNsdl',          isDate: true  },
  { header: 'Maturity Date',                field: 'maturityDate',           isDate: true  },
  { header: 'Convert Date (NSDL)',          field: 'convertDateNsdl',        isDate: true  },
  { header: 'ISIN Status (NSDL)',           field: 'isinStatusNsdl',         isDate: false },
  { header: 'ISIN Activation Date (NSDL)', field: 'isinActivationDateNsdl', isDate: true  },
  { header: 'Issuer Code',                  field: 'issuerCode',             isDate: false },
  { header: 'Source',                       field: 'source',                 isDate: false },
];

const NSDL_RAW_COLUMNS = [
  { header: 'ISIN',                         field: 'isin',                   isDate: false },
  { header: 'ISIN Description',             field: 'isinDescription',        isDate: false },
  { header: 'Security Type',                field: 'securityType',           isDate: false },
  { header: 'ISIN Status (NSDL)',           field: 'isinStatusNsdl',         isDate: false },
  { header: 'Face Value',                   field: 'faceValue',              isDate: false },
  { header: 'Issue Date (NSDL)',            field: 'issueDateNsdl',          isDate: true  },
  { header: 'Maturity Date',                field: 'maturityDate',           isDate: true  },
  { header: 'Convert Date (NSDL)',          field: 'convertDateNsdl',        isDate: true  },
  { header: 'ISIN Activation Date (NSDL)', field: 'isinActivationDateNsdl', isDate: true  },
  { header: 'Issuer Code',                  field: 'issuerCode',             isDate: false },
  { header: 'Issuer Name',                  field: 'issuerName',             isDate: false },
];

const CDSL_RAW_COLUMNS = [
  { header: 'ISIN',             field: 'isinAlphaCode',          isDate: false },
  { header: 'Issuer Name',      field: 'issuerName',             isDate: false },
  { header: 'ISIN Description', field: 'isinDescription',        isDate: false },
  { header: 'Security Type',    field: 'securityTypeDescription', isDate: false },
  { header: 'ISIN Status',      field: 'isinStatusDescription',  isDate: false },
  { header: 'Face Value',       field: 'parValue',               isDate: false },
  { header: 'Paidup Value',     field: 'paidupValue',            isDate: false },
  { header: 'Issue Date',       field: 'issueDate',              isDate: true  },
  { header: 'Convert Date',     field: 'conversionDate',         isDate: true  },
  { header: 'Issuer Code',      field: 'issuerCode',             isDate: false },
];

// ── CSV export helpers ────────────────────────────────────────────────────────

function generateCsvString(rows) {
  const esc = val => {
    const s = val == null ? '' : String(val);
    return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [ISIN_COLUMNS.map(c => esc(c.header)).join(',')];
  for (const row of rows) {
    lines.push(ISIN_COLUMNS.map(col => esc(renderCell(col, row))).join(','));
  }
  return lines.join('\r\n');
}

function triggerCsvDownload(content, filename) {
  // BOM prefix so Excel opens UTF-8 correctly
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── ExportModal ───────────────────────────────────────────────────────────────
// Props:
//   appliedFilters   { isin, issuerCode } — single-value server filter
//   multiSearchRows  Row[] | null — if non-null, "search results" uses this data directly
//   onClose

const EXPORT_PAGE_SIZE = 500; // backend hard cap: pageSize must be ≤500

function ExportModal({ appliedFilters, multiSearchRows, onClose }) {
  const [phase,    setPhase]    = useState('choose'); // choose | fetching | error
  const [progress, setProgress] = useState({ fetched: 0, total: 0 });
  const [errMsg,   setErrMsg]   = useState('');

  const isFetching = phase === 'fetching';

  // Describe what "Export search results" will export
  const filterDesc = multiSearchRows !== null
    ? `${multiSearchRows.length.toLocaleString()} rows from multi-value search (already in memory)`
    : (() => {
        const parts = [];
        if (appliedFilters.isin)       parts.push(`ISIN = "${appliedFilters.isin}"`);
        if (appliedFilters.issuerCode) parts.push(`Issuer Code = "${appliedFilters.issuerCode}"`);
        return parts.length ? parts.join(', ') : 'No filter active';
      })();

  async function runExport(mode) {
    // Multi-search results are already fully in memory — export without a fetch
    if (mode === 'search' && multiSearchRows !== null) {
      triggerCsvDownload(generateCsvString(multiSearchRows), 'isin_master.csv');
      onClose();
      return;
    }

    setPhase('fetching');
    setProgress({ fetched: 0, total: 0 });
    setErrMsg('');

    try {
      const params = { page: 1, pageSize: EXPORT_PAGE_SIZE };
      if (mode === 'search') {
        if (appliedFilters.isin)       params.isin       = appliedFilters.isin;
        if (appliedFilters.issuerCode) params.issuerCode = appliedFilters.issuerCode;
      }

      const first = await api.get('/admin/v1/isins', { params });
      const { items, totalCount, totalPages } = first.data.data;
      let allRows = [...items];
      setProgress({ fetched: allRows.length, total: totalCount });

      for (let pg = 2; pg <= totalPages; pg++) {
        const res = await api.get('/admin/v1/isins', { params: { ...params, page: pg } });
        allRows = allRows.concat(res.data.data.items);
        setProgress({ fetched: allRows.length, total: totalCount });
      }

      triggerCsvDownload(generateCsvString(allRows), 'isin_master.csv');
      onClose();
    } catch (err) {
      setPhase('error');
      setErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
    }
  }

  const pct = progress.total > 0
    ? Math.min(100, Math.round((progress.fetched / progress.total) * 100))
    : 0;

  return (
    <div className="upload-overlay" onClick={!isFetching ? onClose : undefined}>
      <div className="im-export-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
            </svg>
          </span>
          <span className="um-header-title">Export ISIN Master</span>
          <button className="um-close-btn" onClick={onClose} disabled={isFetching} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Choose */}
        {phase === 'choose' && (
          <div className="im-export-body">
            <button className="im-export-option" onClick={() => runExport('search')}>
              <span className="im-export-option-title">&#8595; Export search results</span>
              <span className="im-export-option-desc">{filterDesc}</span>
            </button>
            <button className="im-export-option" onClick={() => runExport('all')}>
              <span className="im-export-option-title">&#8595; Export all data</span>
              <span className="im-export-option-desc">Full ISIN Master dataset &mdash; current filter ignored</span>
            </button>
          </div>
        )}

        {/* Fetching */}
        {phase === 'fetching' && (
          <div className="im-export-progress">
            <p className="im-export-progress-stage">Fetching records&hellip;</p>
            {progress.total > 0 ? (
              <>
                <div className="im-export-progress-track">
                  <div className="im-export-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <p className="im-export-progress-count">
                  {progress.fetched.toLocaleString()} / {progress.total.toLocaleString()} records
                </p>
              </>
            ) : (
              <div className="um-spinner" />
            )}
          </div>
        )}

        {/* Error */}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Splits a raw input string into a trimmed, deduped, uppercased value array.
// Accepts comma-, space-, or newline-separated input.
function parseSearchValues(raw) {
  if (!raw || !raw.trim()) return [];
  return [...new Set(
    raw.split(/[\s,\n\r]+/)
       .map(v => v.trim().toUpperCase())
       .filter(Boolean)
  )];
}

const MULTI_SEARCH_LIMIT = 50;

// ── PaginationBar ─────────────────────────────────────────────────────────────

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
          onChange={e => setGoto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>&rarr;</button>
      </div>
    </div>
  );
}

// ── RawPreviewTable ───────────────────────────────────────────────────────────
// Read-only paginated table for a single dataset.
// Optional `stats` node is rendered between the header and the table.

function RawPreviewTable({ title, rows, columns, isinField, stats }) {
  const [filter,  setFilter]  = useState('');
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [goto,    setGoto]    = useState('');

  const filtered = filter.trim()
    ? rows.filter(r => String(r[isinField] ?? '').toUpperCase().includes(filter.trim().toUpperCase()))
    : rows;

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start      = (page - 1) * perPage;
  const pageRows   = filtered.slice(start, start + perPage);

  function handleFilterChange(e) { setFilter(e.target.value); setPage(1); }
  function handlePerPageChange(e) { setPerPage(Number(e.target.value)); setPage(1); }
  function handleGoto() {
    const target = parseInt(goto, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) setPage(target);
    setGoto('');
  }

  return (
    <div className="im-card">
      <div className="im-card-header">
        <span>{title} &mdash; {rows.length.toLocaleString()} rows</span>
        <div className="im-header-actions">
          <input
            className="im-preview-filter"
            placeholder="Filter by ISIN&hellip;"
            value={filter}
            onChange={handleFilterChange}
          />
          <label className="entries-label">
            Per page
            <select className="entries-select" value={perPage} onChange={handlePerPageChange}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
      </div>

      {stats && <div className="im-merge-stats">{stats}</div>}

      <div className="im-table-wrapper">
        <table className="im-table">
          <thead>
            <tr>{columns.map(col => <th key={col.field}>{col.header}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className="im-empty-state" colSpan={columns.length}>
                  {filter.trim() ? 'No rows match that ISIN.' : 'No data.'}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={`${String(row[isinField] ?? '')}-${idx}`}>
                  {columns.map(col => (
                    <td key={col.field}>{renderCell(col, row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        perPage={perPage}
        totalCount={filtered.length}
        totalPages={totalPages}
        goto={goto}
        setPage={setPage}
        setGoto={setGoto}
        onGoto={handleGoto}
      />
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

function IsinMaster() {
  // Filter fields
  const [isin,       setIsin]       = useState('');
  const [issuerCode, setIssuerCode] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ isin: '', issuerCode: '' });

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Multi-value search results (null = server-side mode; non-null = client-side mode)
  const [multiSearchRows,    setMultiSearchRows]    = useState(null);
  const [multiSearchLoading, setMultiSearchLoading] = useState(false);
  const [multiSearchError,   setMultiSearchError]   = useState('');
  const [searchInputError,   setSearchInputError]   = useState('');

  // Results from the last completed upload — drives the 3 preview tables.
  // Cleared when the user opens the modal again to start a fresh upload.
  const [uploadResult, setUploadResult] = useState(null);

  // ISIN Master List (server-side)
  const [isinPage,       setIsinPage]      = useState(1);
  const [isinPerPage,    setIsinPerPage]    = useState(10);
  const [isinGoto,       setIsinGoto]      = useState('');
  const [isinData,       setIsinData]      = useState([]);
  const [isinTotalCount, setIsinTotalCount] = useState(0);
  const [isinTotalPages, setIsinTotalPages] = useState(0);
  const [isinLoading,    setIsinLoading]   = useState(false);
  const [isinFetchError, setIsinFetchError] = useState('');
  const [isinRefetchKey, setIsinRefetchKey] = useState(0);

  // ── Fetch ISIN table ──────────────────────────────────────────────────────────

  useEffect(() => {
    // Skip server fetch while multi-search results are displayed
    if (multiSearchRows !== null) return;

    let cancelled = false;
    (async () => {
      setIsinLoading(true);
      setIsinFetchError('');
      try {
        const params = { page: isinPage, pageSize: isinPerPage };
        if (appliedFilters.isin)       params.isin       = appliedFilters.isin;
        if (appliedFilters.issuerCode) params.issuerCode = appliedFilters.issuerCode;
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
  }, [isinPage, isinPerPage, isinRefetchKey, appliedFilters, multiSearchRows]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openUploadModal() {
    setUploadResult(null); // clear previous tables so the user sees fresh results
    setShowUploadModal(true);
  }

  function handleUploadComplete(result) {
    setUploadResult(result);
    setShowUploadModal(false);
    setIsinRefetchKey(k => k + 1);
  }

  function handleIsinPerPageChange(e) { setIsinPerPage(Number(e.target.value)); setIsinPage(1); }
  function handleIsinGoto() {
    const total = multiSearchRows !== null
      ? Math.max(1, Math.ceil(multiSearchRows.length / isinPerPage))
      : isinTotalPages;
    const target = parseInt(isinGoto, 10);
    if (!isNaN(target) && target >= 1 && target <= total) setIsinPage(target);
    setIsinGoto('');
  }

  async function handleSearch(e) {
    e.preventDefault();
    setSearchInputError('');

    const isinVals = parseSearchValues(isin);
    const codeVals = parseSearchValues(issuerCode);

    if (isinVals.length > MULTI_SEARCH_LIMIT || codeVals.length > MULTI_SEARCH_LIMIT) {
      setSearchInputError(
        `Too many values — please search for at most ${MULTI_SEARCH_LIMIT} at a time.`
      );
      return;
    }

    // Multi-value: either field has more than one value
    const isMulti = isinVals.length > 1 || codeVals.length > 1;

    if (isMulti) {
      setMultiSearchLoading(true);
      setMultiSearchError('');
      setMultiSearchRows(null);
      try {
        const reqs = [
          ...isinVals.map(v  => api.get('/admin/v1/isins', { params: { isin:       v } })),
          ...codeVals.map(v  => api.get('/admin/v1/isins', { params: { issuerCode: v } })),
        ];
        const responses = await Promise.all(reqs);

        // Merge results and deduplicate by isin
        const seen   = new Set();
        const merged = [];
        for (const res of responses) {
          for (const row of (res.data?.data?.items ?? [])) {
            if (!seen.has(row.isin)) { seen.add(row.isin); merged.push(row); }
          }
        }

        setMultiSearchRows(merged);
        setIsinPage(1);
      } catch (err) {
        setMultiSearchError(
          err.response?.data?.error?.message ?? err.message ?? 'Multi-search failed.'
        );
      } finally {
        setMultiSearchLoading(false);
      }
    } else {
      // Single value (or empty) per field — use server-side pagination as normal
      setMultiSearchRows(null);
      setMultiSearchError('');
      setAppliedFilters({ isin: isinVals[0] ?? '', issuerCode: codeVals[0] ?? '' });
      setIsinPage(1);
    }
  }

  function handleReset() {
    setIsin('');
    setIssuerCode('');
    setAppliedFilters({ isin: '', issuerCode: '' });
    setIsinPage(1);
    setMultiSearchRows(null);
    setMultiSearchError('');
    setSearchInputError('');
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">

      <h1 className="page-heading">IsinMaster</h1>

      {/* ── Top card: header + filter */}
      <div className="im-card">
        <div className="im-card-header">
          <span>ISIN Master</span>
          <div className="im-header-actions">
            <button className="btn-upload" onClick={openUploadModal}>
              &#8679; UPLOAD
            </button>
          </div>
        </div>

        <form className="im-filter-row" onSubmit={handleSearch}>
          <input
            className="im-input im-input--wide"
            placeholder="ISIN"
            value={isin}
            onChange={e => setIsin(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Issuer Code"
            value={issuerCode}
            onChange={e => setIssuerCode(e.target.value)}
          />
          <button type="submit"  className="btn-action btn-action--pink">&#128269; SEARCH</button>
          <button type="button"  className="btn-action btn-action--pink" onClick={() => setShowExportModal(true)}>&#8681; EXPORT</button>
          <button type="button"  className="btn-action btn-action--white" onClick={handleReset}>RESET</button>
        </form>
      </div>

      {/* ── Validation error for too many search values */}
      {searchInputError && (
        <div className="im-banner im-banner--error">{searchInputError}</div>
      )}

      {/* ── Preview tables — shown after a successful upload */}
      {uploadResult && (
        <>
          <RawPreviewTable
            title="NSDL Data"
            rows={uploadResult.nsdlRows}
            columns={NSDL_RAW_COLUMNS}
            isinField="isin"
          />
          <RawPreviewTable
            title="CDSL Data"
            rows={uploadResult.cdslRows}
            columns={CDSL_RAW_COLUMNS}
            isinField="isinAlphaCode"
          />
          <RawPreviewTable
            title="Merged ISIN Master Preview"
            rows={uploadResult.mergedRows}
            columns={ISIN_COLUMNS}
            isinField="isin"
            stats={
              <>
                <span className="im-merge-stat im-merge-stat--nsdl">
                  NSDL only: <strong>{uploadResult.counts.nsdlOnly.toLocaleString()}</strong>
                </span>
                <span className="im-merge-stat im-merge-stat--cdsl">
                  CDSL only: <strong>{uploadResult.counts.cdslOnly.toLocaleString()}</strong>
                </span>
                <span className="im-merge-stat im-merge-stat--both">
                  Both: <strong>{uploadResult.counts.both.toLocaleString()}</strong>
                </span>
              </>
            }
          />
        </>
      )}

      {/* ── ISIN Master List (server-side) */}
      <div className="im-card">
        <div className="im-card-header">
          <span>ISIN Master List</span>
          <label className="entries-label">
            Entries per page
            <select className="entries-select" value={isinPerPage} onChange={handleIsinPerPageChange}>
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
        {multiSearchError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {multiSearchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>{ISIN_COLUMNS.map(col => <th key={col.field}>{col.header}</th>)}</tr>
            </thead>
            <tbody>
              {multiSearchLoading ? (
                <tr>
                  <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                    Searching&hellip;
                  </td>
                </tr>
              ) : multiSearchRows !== null ? (
                multiSearchRows.length === 0 ? (
                  <tr>
                    <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                      No matching ISINs found.
                    </td>
                  </tr>
                ) : (
                  multiSearchRows
                    .slice((isinPage - 1) * isinPerPage, isinPage * isinPerPage)
                    .map((row, idx) => (
                      <tr key={row.isin || idx}>
                        {ISIN_COLUMNS.map(col => (
                          <td key={col.field}>{renderCell(col, row)}</td>
                        ))}
                      </tr>
                    ))
                )
              ) : isinLoading ? (
                <tr>
                  <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                    Loading&hellip;
                  </td>
                </tr>
              ) : isinData.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                    No data available. Click UPLOAD to import NSDL and CDSL files.
                  </td>
                </tr>
              ) : (
                isinData.map((row, idx) => (
                  <tr key={row.isin || idx}>
                    {ISIN_COLUMNS.map(col => (
                      <td key={col.field}>{renderCell(col, row)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {multiSearchRows !== null ? (
          <PaginationBar
            page={isinPage}
            perPage={isinPerPage}
            totalCount={multiSearchRows.length}
            totalPages={Math.max(1, Math.ceil(multiSearchRows.length / isinPerPage))}
            goto={isinGoto}
            setPage={setIsinPage}
            setGoto={setIsinGoto}
            onGoto={handleIsinGoto}
          />
        ) : (
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
        )}
      </div>

      {/* ── Combined upload modal */}
      {showUploadModal && (
        <IsinUploadModal
          onClose={() => setShowUploadModal(false)}
          onComplete={handleUploadComplete}
        />
      )}

      {/* ── Export modal */}
      {showExportModal && (
        <ExportModal
          appliedFilters={appliedFilters}
          multiSearchRows={multiSearchRows}
          onClose={() => setShowExportModal(false)}
        />
      )}

    </div>
  );
}

export default IsinMaster;
