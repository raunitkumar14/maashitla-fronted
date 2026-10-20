import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from './api/axios';
import { hasPermission } from './auth';
import './IsinMaster.css';
import './CompanyDetail.css';
import './CompanyPromoter.css';

const PERM_VIEW   = 'category_convert:view';
const PERM_CREATE = 'category_convert:create';
const PERM_DELETE = 'category_convert:delete';

// ── Excel parsing ─────────────────────────────────────────────────────────────

function normalizeHeader(h) {
  return String(h ?? '').replace(/[\s_]+/g, '').toUpperCase();
}

const HEADER_MAP = {
  PAN:             'pan',
  PANNO:           'pan',
  CATEGORYTYPE:    'categoryType',
  CATEGORYSUBTYPE: 'categorySubType',
};

const REQUIRED_FIELDS = ['pan', 'categoryType', 'categorySubType'];
const REQUIRED_DISPLAY = {
  pan:             'PAN',
  categoryType:    'Category type',
  categorySubType: 'Category sub type',
};

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = (e) => {
      try {
        const wb      = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws      = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rawRows.length) return reject(new Error('File is empty.'));

        const normHeaders = rawRows[0].map(normalizeHeader);

        const fieldIndex = {};
        normHeaders.forEach((h, i) => {
          const field = HEADER_MAP[h];
          if (field && !(field in fieldIndex)) fieldIndex[field] = i;
        });

        const missing = REQUIRED_FIELDS.filter(f => !(f in fieldIndex));
        if (missing.length) {
          return reject(new Error(
            `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.map(f => REQUIRED_DISPLAY[f]).join(', ')}.`
          ));
        }

        const rows = [];
        for (let r = 1; r < rawRows.length; r++) {
          const raw = rawRows[r];
          if (raw.every(cell => String(cell).trim() === '')) continue;
          rows.push({
            pan:             String(raw[fieldIndex.pan]             ?? '').trim(),
            categoryType:    String(raw[fieldIndex.categoryType]    ?? '').trim(),
            categorySubType: String(raw[fieldIndex.categorySubType] ?? '').trim(),
          });
        }

        if (!rows.length) return reject(new Error('No data rows found in the file.'));
        resolve(rows);
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Pagination ────────────────────────────────────────────────────────────────

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
        {totalCount === 0 ? 'Showing 0 entries' : `Showing ${first} to ${last} of ${totalCount} entries`}
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
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function CompanyCategoryConvert() {
  const { issuerCode } = useParams();
  const fileInputRef   = useRef(null);

  const canView   = hasPermission(PERM_VIEW);
  const canCreate = hasPermission(PERM_CREATE);
  const canDelete = hasPermission(PERM_DELETE);

  // ── Records list ──────────────────────────────────────────────────────────
  const [records,   setRecords]   = useState(null); // null = loading
  const [listError, setListError] = useState('');

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [goto,    setGoto]    = useState('');

  // ── Upload ────────────────────────────────────────────────────────────────
  const [parseError,   setParseError]   = useState('');
  const [uploadStatus, setUploadStatus] = useState(null); // null | 'uploading' | 'done' | 'error'
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadErrors, setUploadErrors] = useState(null); // [{row, reason}] or null

  // ── Delete all confirm ────────────────────────────────────────────────────
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [deletingAll,  setDeletingAll]  = useState(false);
  const [deleteAllErr, setDeleteAllErr] = useState('');

  // ── Single row delete ─────────────────────────────────────────────────────
  const [deletingId,   setDeletingId]   = useState(null);
  const [confirmRowId, setConfirmRowId] = useState(null);

  const loadRecords = useCallback(() => {
    if (!canView) { setRecords([]); return; }
    setListError('');
    setRecords(null);
    api.get(`/admin/v1/category-convert/${issuerCode}`)
      .then(res => { setRecords(res.data?.data?.items ?? []); setPage(1); })
      .catch(err => {
        setListError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load.');
        setRecords([]);
      });
  }, [issuerCode, canView]); // eslint-disable-line

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ── Pagination derived ────────────────────────────────────────────────────
  const displayRows = records ?? [];
  const totalCount  = displayRows.length;
  const totalPages  = Math.max(1, Math.ceil(totalCount / perPage));
  const pageRows    = displayRows.slice((page - 1) * perPage, page * perPage);

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  // ── Upload handler ────────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    setParseError('');
    setUploadStatus(null);
    setUploadResult(null);
    setUploadErrors(null);

    let rows;
    try {
      rows = await parseExcel(file);
    } catch (err) {
      setParseError(err.message);
      return;
    }

    setUploadStatus('uploading');
    try {
      const res = await api.post(`/admin/v1/category-convert/${issuerCode}`, {
        sourceFile: file.name,
        rows,
      });
      setUploadResult(res.data?.data);
      setUploadStatus('done');
      loadRecords();
    } catch (err) {
      const details = err.response?.data?.error?.details;
      if (Array.isArray(details) && details.length) {
        setUploadErrors(details);
      }
      setUploadStatus('error');
    }
  }

  // ── Delete single row ─────────────────────────────────────────────────────
  async function handleDeleteRow(id) {
    setDeletingId(id);
    try {
      await api.delete(`/admin/v1/category-convert/${issuerCode}/${id}`);
      loadRecords();
    } catch {
      // Silently reload; per-row errors are rare and self-correcting on reload
    } finally {
      setDeletingId(null);
    }
  }

  // ── Delete all ────────────────────────────────────────────────────────────
  async function handleDeleteAll() {
    setDeletingAll(true);
    setDeleteAllErr('');
    try {
      await api.delete(`/admin/v1/category-convert/${issuerCode}`);
      setShowConfirm(false);
      loadRecords();
    } catch (err) {
      setDeleteAllErr(err.response?.data?.error?.message ?? err.message ?? 'Delete failed.');
    } finally {
      setDeletingAll(false);
    }
  }

  // ── Sample download ───────────────────────────────────────────────────────
  async function handleSampleDownload() {
    try {
      const res = await api.get('/admin/v1/category-convert/sample', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'category_convert_sample.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // no-op; browser handles missing download gracefully
    }
  }

  function formatDate(ds) {
    if (!ds) return '—';
    const d = new Date(ds);
    return isNaN(d.getTime()) ? ds : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const colSpan = canDelete ? 8 : 7;

  return (
    <div className="isin-master">

      {/* ── Upload card ───────────────────────────────────────────────────── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Category Convert — {issuerCode}</span>
          <div className="im-header-actions">
            {canView && (
              <button className="btn-action btn-action--white" onClick={handleSampleDownload}>
                ⬇ Sample
              </button>
            )}
            {canCreate && (
              <button
                className="btn-upload"
                disabled={uploadStatus === 'uploading'}
                onClick={() => fileInputRef.current.click()}
              >
                {uploadStatus === 'uploading' ? '⏳ Uploading…' : '↑ UPLOAD'}
              </button>
            )}
          </div>
        </div>
        <div className="cp-upload-body">
          <p className="cp-upload-hint">
            Upload PAN, Category type and Category sub type. For every PAN found in this company, the category in the BenPos export is changed to the given type and sub type.
            Uploading adds new PANs and updates existing ones; other rows are kept.
            Use Delete / Delete All to remove rows.
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Status banners ────────────────────────────────────────────────── */}
      {parseError && (
        <div className="im-banner im-banner--error">⚠ {parseError}</div>
      )}
      {uploadStatus === 'done' && uploadResult && (() => {
        const added   = uploadResult.inserted ?? 0;
        const updated = uploadResult.updated ?? 0;
        const dupes   = uploadResult.duplicatesMerged ?? 0;
        return (
          <div className="im-banner im-banner--success">
            ✓ Upload complete — {added} added, {updated} updated, {dupes} duplicate{dupes !== 1 ? 's' : ''} merged.
          </div>
        );
      })()}
      {uploadStatus === 'error' && !uploadErrors && (
        <div className="im-banner im-banner--error">⚠ Upload failed.</div>
      )}

      {/* ── Row error table ───────────────────────────────────────────────── */}
      {uploadErrors && uploadErrors.length > 0 && (
        <div className="im-card">
          <div className="im-card-header cp-header--error">
            <span>Upload Errors — {uploadErrors.length} row{uploadErrors.length !== 1 ? 's' : ''} rejected</span>
          </div>
          <div className="im-table-wrapper">
            <table className="im-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Row</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {uploadErrors.map((err, i) => (
                  <tr key={i}>
                    <td>{err.row ?? (Array.isArray(err.rows) ? err.rows.join(', ') : '—')}</td>
                    <td>{err.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Records list card ─────────────────────────────────────────────── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Category Conversions{records !== null ? ` (${totalCount})` : ''}</span>
          <div className="im-header-actions">
            {canDelete && totalCount > 0 && (
              <button
                className="btn-action btn-action--pink"
                onClick={() => setShowConfirm(true)}
              >
                ✕ Delete All
              </button>
            )}
            <label className="entries-label">
              Entries per page
              <select
                className="entries-select"
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {listError && (
          <div className="im-banner im-banner--error" style={{ margin: '10px 14px' }}>
            {listError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                <th>PAN</th>
                <th>Category type</th>
                <th>Category sub type</th>
                <th>Category type description</th>
                <th>Category sub type description</th>
                <th>Depository</th>
                <th>Uploaded at</th>
                {canDelete && <th style={{ width: 80 }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {records === null ? (
                <tr><td className="im-empty-state" colSpan={colSpan}>Loading…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td className="im-empty-state" colSpan={colSpan}>No category convert records found.</td></tr>
              ) : (
                pageRows.map(row => (
                  <tr key={row.id}>
                    <td>{row.pan}</td>
                    <td>{row.categoryType}</td>
                    <td>{row.categorySubType}</td>
                    <td>{row.categoryTypeDescription ?? '—'}</td>
                    <td>{row.categorySubTypeDescription ?? '—'}</td>
                    <td>{row.depository}</td>
                    <td>{formatDate(row.uploadedAt)}</td>
                    {canDelete && (
                      <td>
                        {confirmRowId === row.id ? (
                          <span className="cp-row-confirm">
                            Sure?&nbsp;
                            <button
                              className="btn-action btn-action--pink cp-row-delete-btn"
                              disabled={deletingId === row.id}
                              onClick={() => { setConfirmRowId(null); handleDeleteRow(row.id); }}
                            >Yes</button>
                            &nbsp;
                            <button
                              className="btn-action btn-action--white cp-row-delete-btn"
                              disabled={deletingId === row.id}
                              onClick={() => setConfirmRowId(null)}
                            >No</button>
                          </span>
                        ) : (
                          <button
                            className="btn-action btn-action--pink cp-row-delete-btn"
                            disabled={deletingId === row.id}
                            onClick={() => setConfirmRowId(row.id)}
                          >
                            {deletingId === row.id ? '…' : 'Delete'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}          perPage={perPage}
          totalCount={records === null ? 0 : totalCount}
          totalPages={records === null ? 0 : totalPages}
          goto={goto}          setPage={setPage}
          setGoto={setGoto}    onGoto={handleGoto}
        />
      </div>

      {/* ── Delete All confirm dialog ─────────────────────────────────────── */}
      {showConfirm && (
        <div
          className="cp-confirm-backdrop"
          onClick={() => { if (!deletingAll) setShowConfirm(false); }}
        >
          <div className="cp-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="cp-confirm-title">Delete All Category Conversions?</h3>
            <p className="cp-confirm-body">
              This will permanently delete all <strong>{totalCount}</strong> category conversion record{totalCount !== 1 ? 's' : ''} for <strong>{issuerCode}</strong>. This cannot be undone.
            </p>
            {deleteAllErr && (
              <div className="im-banner im-banner--error" style={{ marginBottom: 12 }}>
                {deleteAllErr}
              </div>
            )}
            <div className="cp-confirm-actions">
              <button
                className="btn-action btn-action--white"
                disabled={deletingAll}
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn-action btn-action--pink"
                disabled={deletingAll}
                onClick={handleDeleteAll}
              >
                {deletingAll ? '⏳ Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default CompanyCategoryConvert;
