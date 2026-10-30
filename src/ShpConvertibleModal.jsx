import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import api from './api/axios';
import { hasPermission } from './auth';
import './IsinMaster.css';
import './CompanyPromoter.css';
import './ShpConvertibleModal.css';

const PERM_VIEW   = 'shp_convertible:view';
const PERM_UPLOAD = 'shp_convertible:upload';
const PERM_DELETE = 'shp_convertible:delete';

// ── Menu config — add items here to extend the Shareholding dropdown ───────────
export const SHP_MENU_ITEMS = [
  { securityType: 'CONVERTIBLE', label: 'Outstanding Convertible Securities' },
  { securityType: 'ESOP',        label: 'Outstanding ESOP Granted' },
  { securityType: 'WARRANT',     label: 'Outstanding Warrants' },
];

// ── Header normalisation ───────────────────────────────────────────────────────
// Strip all non-alphanumeric characters, then uppercase.
function normH(h) {
  return String(h ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// Returns the row-object field name for a given normalised header,
// or null if the column should be ignored.
function detectField(securityType, n) {
  // Common to all types
  if (n === 'PAN')                               return 'pan';
  if (n === 'TYPE')                              return 'type';
  if (n === 'SUBTYPE')                           return 'subType';
  if (n === 'PROMOTRERFLAG' || n === 'PROMOTERFLAG') return 'promoterFlag';
  if (n === 'REMARK' || n === 'REMARKS')         return 'remark';

  if (securityType === 'CONVERTIBLE') {
    // "Name of security holder" → NAMEOFSECURITYHOLDER
    if (n === 'NAMEOFSECURITYHOLDER')            return 'name';
    // "Warrant Securities" → WARRANTSECURITIES
    if (n === 'WARRANTSECURITIES')               return 'outstandingQty';
    return null;
  }

  if (securityType === 'WARRANT') {
    // "Name of warrant allottee" → NAMEOFWARRANTALLOTTEE
    if (n === 'NAMEOFWARRANTALLOTTEE')           return 'name';
    if (n === 'ALLOTMENTDATE')                   return 'allotmentDate';
    if (n === 'EXPIRYDATE')                      return 'expiryDate';
    // "Warrants Allotted (A)" → starts with WARRANTSALLOTTED
    if (n.startsWith('WARRANTSALLOTTED'))        return 'allottedQty';
    // "Warrant Exercised (B)" → starts with WARRANTEXERCISED
    if (n.startsWith('WARRANTEXERCISED'))        return 'exercisedQty';
    // "Warrant Lapsed/Cancelled (C)" → starts with WARRANTLAPSED
    if (n.startsWith('WARRANTLAPSED'))           return 'lapsedQty';
    // "Warrant Outstanding (D = A - (B + C))" → starts with WARRANTOUTSTANDING
    if (n.startsWith('WARRANTOUTSTANDING'))      return 'outstandingQty';
    return null;
  }

  if (securityType === 'ESOP') {
    // "Name of Employee" → NAMEOFEMPLOYEE
    if (n === 'NAMEOFEMPLOYEE')                  return 'name';
    // "Grant Date" → GRANTDATE
    if (n === 'GRANTDATE')                       return 'allotmentDate';
    // "ESOPs Granted (A)" → starts with ESOPSGRANTED
    if (n.startsWith('ESOPSGRANTED'))            return 'allottedQty';
    // "ESOPs Exercised (B)" → starts with ESOPSEXERCISED
    if (n.startsWith('ESOPSEXERCISED'))          return 'exercisedQty';
    // "ESOPs Lapsed/Cancelled (C)" → starts with ESOPSLAPSED
    if (n.startsWith('ESOPSLAPSED'))             return 'lapsedQty';
    // "ESOPs Outstanding (D = A - (B + C))" → starts with ESOPSOUTSTANDING
    if (n.startsWith('ESOPSOUTSTANDING'))        return 'outstandingQty';
    return null;
  }

  return null;
}

// ── Date cell helper ───────────────────────────────────────────────────────────
// With cellDates:true, Excel date cells arrive as JS Date objects.
function formatDateCell(val) {
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val ?? '').trim();
}

const DATE_FIELDS = new Set(['allotmentDate', 'expiryDate']);
const ALL_ROW_FIELDS = [
  'name', 'pan', 'type', 'subType', 'promoterFlag',
  'allottedQty', 'exercisedQty', 'lapsedQty', 'outstandingQty',
  'allotmentDate', 'expiryDate', 'remark',
];

// ── Excel parser ───────────────────────────────────────────────────────────────
function parseExcelFile(file, securityType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rawRows.length) return reject(new Error('File is empty.'));

        // Build field → column-index map from header row
        const normHeaders = rawRows[0].map(normH);
        const fieldIndex = {};
        normHeaders.forEach((h, i) => {
          const field = detectField(securityType, h);
          if (field && !(field in fieldIndex)) fieldIndex[field] = i;
        });

        // Validate required columns
        const missing = [];
        if (!('pan' in fieldIndex)) {
          missing.push('PAN');
        }
        if (securityType === 'CONVERTIBLE') {
          if (!('outstandingQty' in fieldIndex)) missing.push('Warrant Securities');
        } else {
          if (!('outstandingQty' in fieldIndex) && !('allottedQty' in fieldIndex)) {
            const qtyLabel = securityType === 'ESOP'
              ? 'ESOPs Outstanding (D) or ESOPs Granted (A)'
              : 'Warrant Outstanding (D) or Warrants Allotted (A)';
            missing.push(qtyLabel);
          }
        }
        if (missing.length) {
          return reject(new Error(
            `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`
          ));
        }

        // Parse data rows
        const rows = [];
        for (let r = 1; r < rawRows.length; r++) {
          const raw = rawRows[r];
          // Skip fully empty rows
          if (raw.every(cell => !(cell instanceof Date) && String(cell).trim() === '')) continue;

          const obj = {};
          for (const f of ALL_ROW_FIELDS) {
            if (!(f in fieldIndex)) continue;
            const val = raw[fieldIndex[f]];
            if (DATE_FIELDS.has(f)) {
              const s = formatDateCell(val);
              if (s) obj[f] = s;
            } else {
              const s = String(val ?? '').trim();
              if (s) obj[f] = s;
            }
          }
          rows.push(obj);
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

// ── Pagination ─────────────────────────────────────────────────────────────────

function getPageRange(current, total) {
  if (total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('...');
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
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function ShpConvertibleModal({ issuerCode, securityType, companyLabel, onClose }) {
  const fileInputRef = useRef(null);
  const searchTimerRef = useRef(null);

  const canView   = hasPermission(PERM_VIEW);
  const canUpload = hasPermission(PERM_UPLOAD);
  const canDelete = hasPermission(PERM_DELETE);

  const menuItem   = SHP_MENU_ITEMS.find(m => m.securityType === securityType);
  const typeLabel  = menuItem?.label ?? securityType;
  const showQtyCols = securityType !== 'CONVERTIBLE';
  const grantedLabel = securityType === 'ESOP' ? 'Granted' : 'Allotted';

  // ── List state ──────────────────────────────────────────────────────────────
  const [rows,          setRows]          = useState(null);
  const [total,         setTotal]         = useState(0);
  const [sumOutstanding, setSumOutstanding] = useState(0);
  const [listError,     setListError]     = useState('');
  const [page,          setPage]          = useState(1);
  const [goto,          setGoto]          = useState('');
  const [search,        setSearch]        = useState('');
  const [searchInput,   setSearchInput]   = useState('');
  const perPage = 100;

  // ── Upload state ────────────────────────────────────────────────────────────
  const [parseError,   setParseError]   = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadErrors, setUploadErrors] = useState(null);

  // ── Delete state ────────────────────────────────────────────────────────────
  const [confirmRowPan, setConfirmRowPan] = useState(null);
  const [deletingPan,   setDeletingPan]   = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Data load ───────────────────────────────────────────────────────────────
  const loadRows = useCallback(() => {
    if (!canView) { setRows([]); return; }
    setListError('');
    setRows(null);
    const params = { page, pageSize: perPage };
    if (search) params.search = search;
    api.get(`/admin/v1/shp-convertible/${issuerCode}/${securityType}`, { params })
      .then(res => {
        const d = res.data?.data;
        setRows(d?.rows ?? []);
        setTotal(d?.total ?? 0);
        setSumOutstanding(d?.sumOutstandingQty ?? 0);
      })
      .catch(err => {
        setListError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load.');
        setRows([]);
      });
  }, [issuerCode, securityType, canView, page, perPage, search]); // eslint-disable-line

  useEffect(() => { loadRows(); }, [loadRows]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setSearch(val);
    }, 350);
  }

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  // ── Sample download ─────────────────────────────────────────────────────────
  async function handleSampleDownload() {
    try {
      const res = await api.get(
        `/admin/v1/shp-convertible/sample/${securityType}`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `shp_${securityType.toLowerCase()}_sample.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* no-op */ }
  }

  // ── File upload ─────────────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    setParseError('');
    setUploadStatus(null);
    setUploadResult(null);
    setUploadErrors(null);

    let parsed;
    try {
      parsed = await parseExcelFile(file, securityType);
    } catch (err) {
      setParseError(err.message);
      return;
    }

    setUploadStatus('uploading');
    try {
      const res = await api.post(
        `/admin/v1/shp-convertible/${issuerCode}/${securityType}`,
        { sourceFile: file.name, rows: parsed }
      );
      setUploadResult(res.data?.data);
      setUploadStatus('done');
      setPage(1);
      loadRows();
    } catch (err) {
      const details = err.response?.data?.error?.details;
      if (Array.isArray(details) && details.length) {
        setUploadErrors(details);
      }
      setUploadStatus('error');
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDeleteRow(pan) {
    setDeletingPan(pan);
    try {
      await api.delete(`/admin/v1/shp-convertible/${issuerCode}/${securityType}/${pan}`);
      setPage(1);
      loadRows();
    } catch { /* no-op */ }
    finally { setDeletingPan(null); }
  }

  function fmtDate(ds) {
    if (!ds) return '—';
    return String(ds).slice(0, 10);
  }

  function fmtQty(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-IN');
  }

  const displayRows = rows ?? [];

  return (
    <div className="shp-modal-backdrop" onClick={onClose}>
      <div className="shp-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="shp-modal-header">
          <span className="shp-modal-title">{typeLabel} — {companyLabel}</span>
          <button className="shp-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="shp-modal-body">

          {/* ── Upload card ─────────────────────────────────────────────────── */}
          <div className="im-card shp-modal-card">
            <div className="im-card-header">
              <span>Upload</span>
              <div className="im-header-actions">
                {canView && (
                  <button className="btn-action btn-action--white" onClick={handleSampleDownload}>
                    ⬇ Sample
                  </button>
                )}
                {canUpload && (
                  <button
                    className="btn-upload"
                    disabled={uploadStatus === 'uploading'}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadStatus === 'uploading' ? '⏳ Uploading…' : '↑ UPLOAD'}
                  </button>
                )}
              </div>
            </div>
            <div className="cp-upload-body">
              <p className="cp-upload-hint">
                Uploading adds new PANs and updates existing ones (same PAN); other rows are kept.
                These values feed the Shareholding Pattern report (Convertible Securities / Warrants / ESOP columns).
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* ── Status banners ──────────────────────────────────────────────── */}
          {parseError && (
            <div className="im-banner im-banner--error">⚠ {parseError}</div>
          )}
          {uploadStatus === 'done' && uploadResult && (
            <div className="im-banner im-banner--success">
              ✓ Upload complete — {uploadResult.inserted ?? 0} added, {uploadResult.updated ?? 0} updated.
            </div>
          )}
          {uploadStatus === 'error' && !uploadErrors && (
            <div className="im-banner im-banner--error">⚠ Upload failed.</div>
          )}

          {/* ── Row error table ─────────────────────────────────────────────── */}
          {uploadErrors && uploadErrors.length > 0 && (
            <div className="im-card shp-modal-card">
              <div className="im-card-header cp-header--error">
                <span>
                  Upload Errors — {uploadErrors.length} row{uploadErrors.length !== 1 ? 's' : ''} rejected
                </span>
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

          {/* ── List card ───────────────────────────────────────────────────── */}
          <div className="im-card shp-modal-card">
            <div className="im-card-header">
              <span>
                {typeLabel}{rows !== null ? ` (${total})` : ''}
                {sumOutstanding > 0 && (
                  <span className="shp-sum-label">
                    {' '}— Total Outstanding: {sumOutstanding.toLocaleString('en-IN')}
                  </span>
                )}
              </span>
              <div className="im-header-actions">
                <input
                  className="shp-search-input"
                  type="text"
                  placeholder="Search PAN or Name…"
                  value={searchInput}
                  onChange={handleSearchChange}
                />
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
                    <th>Name</th>
                    <th>Type</th>
                    <th>Sub Type</th>
                    <th>Promoter Flag</th>
                    {showQtyCols && <th>{grantedLabel}</th>}
                    {showQtyCols && <th>Exercised</th>}
                    {showQtyCols && <th>Lapsed</th>}
                    <th>Outstanding</th>
                    {showQtyCols && <th>Date</th>}
                    {canDelete && <th style={{ width: 80 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows === null ? (
                    <tr>
                      <td className="im-empty-state" colSpan={99}>Loading…</td>
                    </tr>
                  ) : displayRows.length === 0 ? (
                    <tr>
                      <td className="im-empty-state" colSpan={99}>No records found.</td>
                    </tr>
                  ) : (
                    displayRows.map(row => (
                      <tr key={row.id}>
                        <td>{row.pan}</td>
                        <td>{row.holderName ?? '—'}</td>
                        <td>{row.holderType ?? '—'}</td>
                        <td>{row.subType ?? '—'}</td>
                        <td>{row.promoterFlag ?? '—'}</td>
                        {showQtyCols && <td>{fmtQty(row.allottedQty)}</td>}
                        {showQtyCols && <td>{fmtQty(row.exercisedQty)}</td>}
                        {showQtyCols && <td>{fmtQty(row.lapsedQty)}</td>}
                        <td>{fmtQty(row.outstandingQty)}</td>
                        {showQtyCols && <td>{fmtDate(row.allotmentDate)}</td>}
                        {canDelete && (
                          <td>
                            {confirmRowPan === row.pan ? (
                              <span className="cp-row-confirm">
                                Sure?&nbsp;
                                <button
                                  className="btn-action btn-action--pink cp-row-delete-btn"
                                  disabled={deletingPan === row.pan}
                                  onClick={() => { setConfirmRowPan(null); handleDeleteRow(row.pan); }}
                                >Yes</button>
                                &nbsp;
                                <button
                                  className="btn-action btn-action--white cp-row-delete-btn"
                                  disabled={deletingPan === row.pan}
                                  onClick={() => setConfirmRowPan(null)}
                                >No</button>
                              </span>
                            ) : (
                              <button
                                className="btn-action btn-action--pink cp-row-delete-btn"
                                disabled={deletingPan === row.pan}
                                onClick={() => setConfirmRowPan(row.pan)}
                              >
                                {deletingPan === row.pan ? '…' : 'Delete'}
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
              page={page}              perPage={perPage}
              totalCount={rows === null ? 0 : total}
              totalPages={rows === null ? 1 : totalPages}
              goto={goto}              setPage={setPage}
              setGoto={setGoto}        onGoto={handleGoto}
            />
          </div>

        </div>
      </div>
    </div>
  );
}

export default ShpConvertibleModal;
