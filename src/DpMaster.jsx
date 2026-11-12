import { useState, useEffect, useCallback, useRef } from 'react';
import { hasPermission } from './auth';
import { triggerDownload } from './services/daakService';
import {
  list, create, update, remove, getImportTemplate, importFile,
} from './services/dpMasterService';
import './IsinMaster.css';
import './CategoryMapping.css';
import './UploadModal.css';
import './CategoryMappingUploadModal.css';

const PERM_VIEW   = 'dp_master:view';
const PERM_CREATE = 'dp_master:create';
const PERM_UPDATE = 'dp_master:update';
const PERM_DELETE = 'dp_master:delete';
const PERM_IMPORT = 'dp_master:import';

const ADDR_MAX = 36;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── DpFormModal ───────────────────────────────────────────────────────────────

function DpFormModal({ dp, onClose, onSaved }) {
  const isEdit = !!dp;
  const [dpId,     setDpId]     = useState(dp?.dpId    ?? '');
  const [dpName,   setDpName]   = useState(dp?.dpName  ?? '');
  const [mobile,   setMobile]   = useState(dp?.mobile  ?? '');
  const [email,    setEmail]    = useState(dp?.email   ?? '');
  const [address,  setAddress]  = useState(dp?.address ?? '');
  const [state,    setState]    = useState(dp?.state   ?? '');
  const [pincode,  setPincode]  = useState(dp?.pincode ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [fieldErr, setFieldErr] = useState({});

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  function validate() {
    const errs = {};
    if (!dpId.trim())   errs.dpId = 'DP ID is required.';
    if (!dpName.trim()) errs.dpName = 'DP Name is required.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Enter a valid email address.';
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim()))
      errs.pincode = 'Pincode must be 6 digits.';
    return errs;
  }

  async function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErr(errs); return; }
    setSaving(true);
    setError('');
    setFieldErr({});
    try {
      const payload = {
        dpId:    dpId.trim(),
        dpName:  dpName.trim(),
        mobile:  mobile.trim(),
        email:   email.trim(),
        address: address.trim(),
        state:   state.trim(),
        pincode: pincode.trim(),
      };
      if (isEdit) await update(dp.id, payload);
      else        await create(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error?.message ?? err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px',
    fontSize: '13px', fontFamily: 'Arial, Helvetica, sans-serif', outline: 'none',
  };
  const fieldWrap = { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' };
  const labelSt   = { fontSize: '11px', fontWeight: '600', color: '#555', fontFamily: 'Arial, Helvetica, sans-serif' };
  const reqSt     = { color: '#c62828' };
  const errSt     = { fontSize: '11px', color: '#c62828', marginTop: '2px', fontFamily: 'Arial, Helvetica, sans-serif' };

  return (
    <div className="upload-overlay" onClick={!saving ? onClose : undefined}>
      <div
        className="im-edit-listing-modal"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit DP' : 'Add DP'}
      >
        {/* Header */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="white">
              <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
            </svg>
          </span>
          <span className="um-header-title">{isEdit ? 'Edit DP' : 'Add DP'}</span>
          <button className="um-close-btn" onClick={onClose} disabled={saving} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px' }}>
          <div style={fieldWrap}>
            <label style={labelSt}>DP ID <span style={reqSt}>*</span></label>
            <input
              autoFocus
              style={{ ...inputStyle, borderColor: fieldErr.dpId ? '#c62828' : '#ccc' }}
              type="text"
              value={dpId}
              onChange={e => setDpId(e.target.value)}
            />
            {fieldErr.dpId && <span style={errSt}>{fieldErr.dpId}</span>}
          </div>

          <div style={fieldWrap}>
            <label style={labelSt}>DP Name <span style={reqSt}>*</span></label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.dpName ? '#c62828' : '#ccc' }}
              type="text"
              value={dpName}
              onChange={e => setDpName(e.target.value)}
            />
            {fieldErr.dpName && <span style={errSt}>{fieldErr.dpName}</span>}
          </div>

          <div style={fieldWrap}>
            <label style={labelSt}>Mobile</label>
            <input
              style={inputStyle}
              type="text"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelSt}>Email</label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.email ? '#c62828' : '#ccc' }}
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            {fieldErr.email && <span style={errSt}>{fieldErr.email}</span>}
          </div>

          <div style={fieldWrap}>
            <label style={labelSt}>Address</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelSt}>State</label>
            <input
              style={inputStyle}
              type="text"
              maxLength={100}
              value={state}
              onChange={e => setState(e.target.value)}
            />
          </div>

          <div style={{ ...fieldWrap, marginBottom: 0 }}>
            <label style={labelSt}>Pincode</label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.pincode ? '#c62828' : '#ccc' }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
            />
            {fieldErr.pincode && <span style={errSt}>{fieldErr.pincode}</span>}
          </div>

          {error && (
            <p className="cmu-error-msg" style={{ marginTop: '10px' }}>&#9888; {error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="cmu-footer">
          <button className="cmu-cancel-btn" disabled={saving} onClick={onClose}>CANCEL</button>
          <button className="cmu-submit-btn" disabled={saving} onClick={handleSave}>
            {saving ? '⏳ Saving…' : (isEdit ? 'UPDATE' : 'ADD')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DpDeleteConfirm ───────────────────────────────────────────────────────────

function DpDeleteConfirm({ dp, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !deleting) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deleting, onClose]);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await remove(dp.id);
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.error?.message ?? err.message ?? 'Delete failed.');
      setDeleting(false);
    }
  }

  return (
    <div className="upload-overlay" onClick={!deleting ? onClose : undefined}>
      <div
        style={{
          background: '#fff', borderRadius: '6px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
          width: '400px', maxWidth: '95vw',
          fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="um-header">
          <span className="um-header-title">Confirm Delete</span>
          <button className="um-close-btn" onClick={onClose} disabled={deleting} aria-label="Close">
            &times;
          </button>
        </div>
        <div style={{ padding: '16px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#333' }}>
            Delete DP <strong>{dp.dpName || dp.dpId}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#777' }}>This action cannot be undone.</p>
          {error && <p className="cmu-error-msg" style={{ marginTop: '10px' }}>&#9888; {error}</p>}
        </div>
        <div className="cmu-footer">
          <button className="cmu-cancel-btn" disabled={deleting} onClick={onClose}>CANCEL</button>
          <button
            disabled={deleting}
            onClick={handleDelete}
            style={{
              background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px',
              padding: '6px 18px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
              letterSpacing: '0.4px', fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            {deleting ? 'Deleting…' : 'DELETE'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DpImportModal ─────────────────────────────────────────────────────────────

function DpImportModal({ onClose, onComplete }) {
  const [file,     setFile]     = useState(null);
  const [phase,    setPhase]    = useState('idle'); // idle|uploading|done|error
  const [result,   setResult]   = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [tplError, setTplError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const isUploading = phase === 'uploading';
  const isDone      = phase === 'done';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !isUploading) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isUploading, onClose]);

  function handleFileSelect(f) {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setErrorMsg('Only .xlsx and .xls files are accepted.');
      return;
    }
    setFile(f);
    setErrorMsg('');
    if (phase === 'error') setPhase('idle');
  }

  async function handleTemplateDownload(e) {
    e.preventDefault();
    setTplError('');
    try {
      const res = await getImportTemplate();
      const cd       = res.headers?.['content-disposition'] ?? '';
      const match    = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = match?.[1]?.replace(/['"]/g, '') || 'DP_Master_Template.xlsx';
      triggerDownload(res.data, filename);
    } catch (err) {
      let msg = 'Template download failed.';
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text())?.error?.message ?? msg; } catch { /* fallback */ }
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      }
      setTplError(msg);
    }
  }

  async function handleUpload() {
    if (!file || isUploading) return;
    setPhase('uploading');
    setErrorMsg('');
    try {
      const res = await importFile(file);
      setResult(res);
      setPhase('done');
      onComplete();
    } catch (err) {
      let msg = err.message ?? 'Upload failed.';
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text())?.error?.message ?? msg; } catch { /* fallback */ }
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      }
      setErrorMsg(msg);
      setPhase('error');
    }
  }

  return (
    <div className="upload-overlay" onClick={!isUploading && !isDone ? onClose : undefined}>
      <div
        className="cmu-modal"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Import DP Master"
      >
        {/* Header */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="white">
              <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
            </svg>
          </span>
          <span className="um-header-title">Import DP Master</span>
          <button className="um-close-btn" onClick={onClose} disabled={isUploading} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="cmu-body">
          {!isDone && (
            <>
              <div style={{ padding: '10px 0 6px', fontSize: '12px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#555' }}>
                <a
                  href="#tpl"
                  style={{ color: '#1976d2', textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={handleTemplateDownload}
                >
                  Download template
                </a>
                {' '}— expected columns: DP ID, DP Name, Mobile, Address, Email, State, Pincode.
              </div>

              {tplError && (
                <p className="cmu-error-msg" style={{ margin: '0 0 6px' }}>&#9888; {tplError}</p>
              )}

              {file ? (
                <div className="cmu-file-card">
                  <svg className="cmu-file-icon" viewBox="0 0 24 24" fill="none"
                    stroke="#2e7d32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                  <svg className="um-cloud-icon" viewBox="0 0 24 24" fill="none"
                    stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16"/>
                    <line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                  <p className="um-drop-text"><strong>Drag &amp; Drop your file here</strong></p>
                  <p className="um-browse-text">or click to browse (Only .xlsx and .xls files allowed)</p>
                </div>
              )}

              {isUploading && (
                <div className="cmu-uploading-row">
                  <div className="um-spinner" />
                  <span className="um-parsing-text">Uploading {file?.name}…</span>
                </div>
              )}

              {phase === 'error' && errorMsg && (
                <p className="cmu-error-msg">&#9888; {errorMsg}</p>
              )}
            </>
          )}

          {/* Result after upload */}
          {isDone && result && (
            <div style={{ padding: '10px 0 4px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
              <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#333', marginBottom: '12px' }}>
                <span><strong>Created:</strong> {result.created ?? 0}</span>
                <span><strong>Updated:</strong> {result.updated ?? 0}</span>
                <span style={{ color: (result.failed ?? 0) > 0 ? '#c62828' : '#2e7d32' }}>
                  <strong>Failed:</strong> {result.failed ?? 0}
                </span>
              </div>
              {result.errors?.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', color: '#c62828', fontWeight: 600, marginBottom: '4px' }}>
                    Rows with errors:
                  </div>
                  <ul style={{
                    margin: 0, padding: '8px 8px 8px 24px',
                    fontSize: '12px', color: '#c62828',
                    maxHeight: '150px', overflowY: 'auto',
                    border: '1px solid #ef9a9a', borderRadius: '4px',
                    background: '#fdecea',
                  }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}{e.dpId ? ` (${e.dpId})` : ''}: {e.message}
                      </li>
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
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          style={{ display: 'none' }}
          onChange={e => { handleFileSelect(e.target.files[0]); e.target.value = ''; }}
        />

        {/* Footer */}
        <div className="cmu-footer">
          {isDone ? (
            <button className="cmu-submit-btn" onClick={onClose}>CLOSE</button>
          ) : (
            <>
              <button className="cmu-cancel-btn" disabled={isUploading} onClick={onClose}>CANCEL</button>
              <button className="cmu-submit-btn" disabled={!file || isUploading} onClick={handleUpload}>
                {isUploading ? '⏳ Uploading…' : '↑ UPLOAD'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DpMaster page ─────────────────────────────────────────────────────────────

function DpMaster() {
  const canView   = hasPermission(PERM_VIEW);
  const canCreate = hasPermission(PERM_CREATE);
  const canEdit   = hasPermission(PERM_UPDATE);
  const canDelete = hasPermission(PERM_DELETE);
  const canImport = hasPermission(PERM_IMPORT);

  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page,       setPage]       = useState(1);
  const [perPage,    setPerPage]    = useState(20);
  const [goto,       setGoto]       = useState('');

  const [searchText,    setSearchText]    = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const debounceRef = useRef(null);

  const [showAdd,    setShowAdd]    = useState(false);
  const [editDp,     setEditDp]     = useState(null);
  const [deleteDp,   setDeleteDp]   = useState(null);
  const [showImport, setShowImport] = useState(false);

  const [toast, setToast] = useState(null);

  const fetchRows = useCallback(async () => {
    if (!canView) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setFetchError('');
    try {
      const { items, total: t, totalPages: tp } = await list({ search: appliedSearch, page, limit: perPage });
      setRows(items);
      setTotal(t);
      setTotalPages(Math.max(1, tp));
    } catch (err) {
      setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load DP master.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, appliedSearch, page, perPage]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearchText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAppliedSearch(val);
      setPage(1);
    }, 400);
  }

  function handleClearSearch() {
    setSearchText('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAppliedSearch('');
    setPage(1);
  }

  function showToastMsg(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  const colCount = 8;

  return (
    <>
      <div className="isin-master">
        <h1 className="page-heading">DP Master</h1>

        {/* Toast banner */}
        {toast && (
          <div className={`im-banner ${toast.type === 'error' ? 'im-banner--error' : 'im-banner--success'}`}>
            {toast.msg}
          </div>
        )}

        {/* ── Card 1: title bar + actions ───────────────────────────────────── */}
        <div className="im-card">
          <div className="im-card-header">
            <span>DP Master</span>
            <div className="im-header-actions">
              {canCreate && (
                <button className="btn-upload cm-btn-icon" onClick={() => setShowAdd(true)}>
                  + ADD DP
                </button>
              )}
              {canImport && (
                <button className="btn-upload cm-btn-icon" onClick={() => setShowImport(true)}>
                  ↑ IMPORT EXCEL
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Card 2: search ────────────────────────────────────────────────── */}
        <div className="im-card">
          <div className="im-filter-row">
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <input
                className="im-input"
                placeholder="Search DP ID, name, mobile, email, address, state, pincode…"
                value={searchText}
                onChange={handleSearchChange}
                style={{ width: '300px', paddingRight: searchText ? '24px' : '8px' }}
              />
              {searchText && (
                <button
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute', right: '6px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#999', fontSize: '15px', lineHeight: 1, padding: '0 2px',
                  }}
                >×</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Card 3: table ─────────────────────────────────────────────────── */}
        <div className="im-card">
          <div className="im-card-header">
            <span>DP Master List</span>
            <div className="im-header-actions">
              <label className="entries-label">
                Entries per page
                <select
                  className="entries-select"
                  value={perPage}
                  onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
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
                <tr>
                  <th>DP ID</th>
                  <th>DP Name</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th>State</th>
                  <th>Pincode</th>
                  <th className="im-action-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="im-empty-state" colSpan={colCount}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="im-empty-state" colSpan={colCount}>
                      {appliedSearch
                        ? 'No DPs found matching your search.'
                        : 'No DPs found. Use "ADD DP" above or "IMPORT EXCEL" to get started.'}
                    </td>
                  </tr>
                ) : (
                  rows.map(row => (
                    <tr key={row.id}>
                      <td>{row.dpId  || '—'}</td>
                      <td>{row.dpName || '—'}</td>
                      <td>{row.mobile || '—'}</td>
                      <td>{row.email  || '—'}</td>
                      <td
                        title={row.address && row.address.length > ADDR_MAX ? row.address : undefined}
                        style={{
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.address || '—'}
                      </td>
                      <td>{row.state   || '—'}</td>
                      <td>{row.pincode || '—'}</td>
                      <td className="im-action-cell">
                        {canEdit && (
                          <button
                            className="im-row-edit-btn"
                            onClick={() => setEditDp(row)}
                            style={{ marginRight: '4px' }}
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="im-row-edit-btn"
                            onClick={() => setDeleteDp(row)}
                            style={{ background: '#fdecea', color: '#c62828', borderColor: '#ef9a9a' }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={page}        perPage={perPage}
            totalCount={total} totalPages={totalPages}
            goto={goto}        setPage={setPage}
            setGoto={setGoto}  onGoto={handleGoto}
          />
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <DpFormModal
          dp={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchRows(); showToastMsg('DP added successfully.'); }}
        />
      )}

      {/* Edit modal */}
      {editDp && (
        <DpFormModal
          dp={editDp}
          onClose={() => setEditDp(null)}
          onSaved={() => { setEditDp(null); fetchRows(); showToastMsg('DP updated successfully.'); }}
        />
      )}

      {/* Delete confirm */}
      {deleteDp && (
        <DpDeleteConfirm
          dp={deleteDp}
          onClose={() => setDeleteDp(null)}
          onDeleted={() => { setDeleteDp(null); fetchRows(); showToastMsg('DP deleted.'); }}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <DpImportModal
          onClose={() => setShowImport(false)}
          onComplete={fetchRows}
        />
      )}
    </>
  );
}

export default DpMaster;
