import { useState, useEffect, useCallback } from 'react';
import api from './api/axios';
import { hasPermission } from './auth';
import { buildXlsxBlob } from './xlsxStream';
import CategoryMappingUploadModal from './CategoryMappingUploadModal';
import './IsinMaster.css';
import './CompanyPromoter.css';
import './CategoryMapping.css';

const PERM_VIEW   = 'category_mapping:view';
const PERM_CREATE = 'category_mapping:create';

// 20 columns in display order
const CM_COLUMNS = [
  { header: 'RTA ID',                                field: 'rtaId' },
  { header: 'RTA DESCRIPTION',                       field: 'rtaDescription' },
  { header: 'CATEGORY TYPE',                         field: 'categoryType' },
  { header: 'CATEGORY SUB TYPE',                     field: 'categorySubType' },
  { header: 'CATEGORY TYPE DESCRIPTION',             field: 'categoryTypeDescription' },
  { header: 'CATEGORY SUB TYPE DESCRIPTION',         field: 'categorySubTypeDescription' },
  { header: 'DEPOSITORY',                            field: 'depository' },
  { header: 'REGULATION 31 SUB-TYPE - PUBLIC',       field: 'regulation31SubTypePublic' },
  { header: 'REGULATION 31 TYPE - PUBLIC',           field: 'regulation31TypePublic' },
  { header: 'PROMOTER',                              field: 'promoter' },
  { header: 'REGULATION 31 TYPE - PROMOTER',         field: 'regulation31TypePromoter' },
  { header: 'INVESTOR TYPE',                         field: 'investorType' },
  { header: 'SHP PROMOTER CODE',                     field: 'shpPromoterCode' },
  { header: 'SHP PUBLIC CODE',                       field: 'shpPublicCode' },
  { header: 'TDS TAX SLAB',                          field: 'tdsTaxSlab' },
  { header: 'SHAREHOLDER/ DEBENTURE HOLDER TYPE',    field: 'shareholderDebentureHolderType' },
  { header: 'SHAREHOLDER CATEGORY',                  field: 'shareholderCategory' },
  { header: 'SHAREHOLDER/ DEBENTURE HOLDER DETAILS', field: 'shareholderDebentureHolderDetails' },
  { header: 'IDENTIFIER TYPE',                       field: 'identifierType' },
  { header: 'E-VOTING CLIENT TYPE',                  field: 'eVotingClientType' },
];

// Upload template headers (human-readable names for the sample file)
const SAMPLE_HEADERS = [
  'RTA ID', 'RTA Description', 'Category Type', 'Category Sub Type',
  'Category Type Description', 'Category Sub Type Description', 'Depository',
  'Regulation 31 Sub-Type Public', 'Regulation 31 Type Public', 'Promoter',
  'Regulation 31 Type Promoter', 'Investor Type', 'SHP Promoter Code', 'SHP Public Code',
  'TDS Tax Slab', 'Shareholder Debenture Holder Type', 'Shareholder Category',
  'Shareholder Debenture Holder Details', 'Identifier Type', 'E-Voting Client Type',
];

const SAMPLE_ROWS = [
  [
    '1', 'Individual', '21', '1', 'Individual', 'Ordinary', 'CDSL',
    '', 'Indian - Public', '', 'Indian - Promoter', 'RES', '', '', '',
    'SH', 'IND', 'Resident Individual', '', 'Y',
  ],
  [
    '1', 'Individual', '18', '12', 'NBFC', 'Systemically important NBFCs', 'NSDL',
    '', 'Indian - Public', '', 'Indian - Promoter', 'RES', '', '', '',
    'SH', 'COM', 'Resident Company', '', 'Y',
  ],
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function todayYMD() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8M5 7l3 3 3-3M3 13h10"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 10V2M11 5L8 2 5 5M3 13h10"/>
    </svg>
  );
}

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

// ── CategoryMapping page ──────────────────────────────────────────────────────

function CategoryMapping() {
  const canView   = hasPermission(PERM_VIEW);
  const canCreate = hasPermission(PERM_CREATE);

  // Data
  const [allRows,    setAllRows]    = useState(null); // null = loading
  const [fetchError, setFetchError] = useState('');

  // Search
  const [searchText,    setSearchText]    = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Pagination
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [goto,    setGoto]    = useState('');

  // Upload modal + result banners
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus,    setUploadStatus]    = useState(null); // null | 'done' | 'error'
  const [uploadMsg,       setUploadMsg]       = useState('');

  // Load all rows once — the API returns the full set with no pagination params
  const loadRows = useCallback(() => {
    if (!canView) { setAllRows([]); return; }
    setFetchError('');
    setAllRows(null);
    api.get('/admin/v1/category-mapping')
      .then(res => {
        const items = res.data?.data?.items ?? res.data?.items ?? [];
        setAllRows(items);
      })
      .catch(err => {
        setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load category mapping.');
        setAllRows([]);
      });
  }, [canView]); // eslint-disable-line

  useEffect(() => { loadRows(); }, [loadRows]);

  // Client-side search: match on type, subtype, descriptions, depository
  const filteredRows = (allRows ?? []).filter(row => {
    if (!appliedSearch.trim()) return true;
    const q = appliedSearch.trim().toLowerCase();
    return (
      String(row.categoryType               ?? '').toLowerCase().includes(q) ||
      String(row.categorySubType            ?? '').toLowerCase().includes(q) ||
      String(row.categoryTypeDescription    ?? '').toLowerCase().includes(q) ||
      String(row.categorySubTypeDescription ?? '').toLowerCase().includes(q) ||
      String(row.depository                 ?? '').toLowerCase().includes(q)
    );
  });

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const pageRows   = filteredRows.slice((page - 1) * perPage, page * perPage);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSearch(e) {
    e.preventDefault();
    setAppliedSearch(searchText);
    setPage(1);
  }

  function handleClear() {
    setSearchText('');
    setAppliedSearch('');
    setPage(1);
  }

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  function handleUploadComplete({ ins, upd }) {
    setUploadMsg(`✓ Upload complete — ${ins} inserted, ${upd} updated.`);
    setUploadStatus('done');
    setShowUploadModal(false);
    loadRows();
  }

  async function handleSampleDownload() {
    try {
      const blob = await buildXlsxBlob(SAMPLE_HEADERS, SAMPLE_ROWS, {
        sheetName: 'Category Mapping',
        headerFill: 'ADD8E6',
      });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'Category_Mapping_Sample.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* no-op */ }
  }

  async function handleDownload() {
    if (!allRows || allRows.length === 0) return;
    try {
      const headers  = CM_COLUMNS.map(c => c.header);
      const dataRows = allRows.map(row =>
        CM_COLUMNS.map(c => { const v = row[c.field]; return v == null ? undefined : v; })
      );
      const blob = await buildXlsxBlob(headers, dataRows, {
        sheetName: 'Category Mapping',
        headerFill: 'ADD8E6',
      });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `Category_Mapping_${todayYMD()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* no-op */ }
  }

  const colCount = CM_COLUMNS.length;

  return (
    <>
    <div className="isin-master">
      <h1 className="page-heading">Category Mapping</h1>

      {/* ── Card 1: title bar + upload hint ────────────────────────────────── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Category Mapping</span>
          <div className="im-header-actions">
            <button className="btn-action btn-action--white cm-btn-icon" onClick={handleSampleDownload}>
              <DownloadIcon /> Sample
            </button>
            {canCreate && (
              <button
                className="btn-upload cm-btn-icon"
                onClick={() => setShowUploadModal(true)}
              >
                <UploadIcon /> UPLOAD
              </button>
            )}
            <button
              className="btn-upload cm-btn-icon"
              disabled={!allRows || allRows.length === 0}
              onClick={handleDownload}
            >
              <DownloadIcon /> DOWNLOAD
            </button>
          </div>
        </div>
        <div className="cp-upload-body">
          <p className="cp-upload-hint">
            Upload an Excel or CSV with the category mapping master data.
            Required columns: RTA ID, Category Type, Category Sub Type, Category Type Description,
            Category Sub Type Description, Depository.
            Optional (new) columns: Regulation 31 Sub-Type Public, Regulation 31 Type Public,
            Promoter, Regulation 31 Type Promoter, Investor Type, SHP Promoter Code, SHP Public Code,
            TDS Tax Slab, Shareholder/Debenture Holder Type, Shareholder Category,
            Shareholder/Debenture Holder Details, Identifier Type, E-Voting Client Type.
          </p>
        </div>
      </div>

      {/* Upload result banners */}
      {uploadStatus === 'done' && (
        <div className="im-banner im-banner--success">{uploadMsg}</div>
      )}
      {uploadStatus === 'error' && (
        <div className="im-banner im-banner--error">&#9888; {uploadMsg}</div>
      )}

      {/* ── Card 2: search ──────────────────────────────────────────────────── */}
      <div className="im-card">
        <form className="im-filter-row" onSubmit={handleSearch}>
          <input
            className="im-input im-input--wide"
            placeholder="Category Code"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
          <button type="submit" className="btn-action btn-action--pink">SEARCH</button>
          <button type="button" className="btn-action btn-action--grey" onClick={handleClear}>CLEAR</button>
        </form>
      </div>

      {/* ── Card 3: list table ──────────────────────────────────────────────── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Category Mapping List</span>
          <div className="im-header-actions">
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
          <div className="im-banner im-banner--error" style={{ margin: '10px 14px' }}>
            {fetchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>{CM_COLUMNS.map(col => <th key={col.field}>{col.header}</th>)}</tr>
            </thead>
            <tbody>
              {allRows === null ? (
                <tr><td className="im-empty-state" colSpan={colCount}>Loading&hellip;</td></tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={colCount}>
                    {allRows.length === 0 ? 'No records found.' : 'No records match your search.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => (
                  <tr key={idx}>
                    {CM_COLUMNS.map(col => {
                      const v = row[col.field];
                      return <td key={col.field}>{v == null || v === '' ? '—' : v}</td>;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}         perPage={perPage}
          totalCount={allRows === null ? 0 : totalCount}
          totalPages={allRows === null ? 0 : totalPages}
          goto={goto}         setPage={setPage}
          setGoto={setGoto}   onGoto={handleGoto}
        />
      </div>

    </div>

      {/* Upload modal */}
      {showUploadModal && (
        <CategoryMappingUploadModal
          onClose={() => setShowUploadModal(false)}
          onComplete={handleUploadComplete}
        />
      )}
    </>
  );
}

export default CategoryMapping;
