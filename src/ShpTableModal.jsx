import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import api from './api/axios';
import { hasPermission } from './auth';
import { parseDateCell, displayDate } from './shpDateUtils';
import './IsinMaster.css';
import './CompanyPromoter.css';
import './ShpConvertibleModal.css';

const PERM_VIEW   = 'shp_convertible:view';
const PERM_UPLOAD = 'shp_convertible:upload';
const PERM_DELETE = 'shp_convertible:delete';

export const SHP_TABLE_MENU_ITEMS = [
  { tableCode: 'II-A',  label: 'Table II-A — Unclaimed Shares (Promoter & Promoter Group)' },
  { tableCode: 'III-A', label: 'Table III-A — Persons Acting in Concert (Public)' },
  { tableCode: 'III-B', label: 'Table III-B — Unclaimed Shares (Public)' },
  { tableCode: 'V',    label: 'Table V — Significant Beneficial Owners' },
];

const TABLE_META = {
  'II-A': {
    label: 'Table II-A — Unclaimed Shares (Promoter & Promoter Group)',
    columns: [
      { key: 'numberOfShareholders', header: 'No. of Shareholders' },
      { key: 'outstandingShares',    header: 'Outstanding Shares' },
      { key: 'votingRightsFrozen',   header: 'Voting Rights Frozen' },
      { key: 'notes',                header: 'Notes' },
    ],
    requiredFields: ['numberOfShareholders', 'outstandingShares', 'votingRightsFrozen', 'notes'],
  },
  'III-A': {
    label: 'Table III-A — Persons Acting in Concert (Public)',
    columns: [
      { key: 'shareholderName', header: 'Shareholder Name' },
      { key: 'pacName',         header: 'PAC Name' },
      { key: 'numberOfShares',  header: 'Number of Shares' },
      { key: 'pacPercentage',   header: 'PAC %' },
    ],
    requiredFields: ['shareholderName', 'pacName', 'numberOfShares', 'pacPercentage'],
  },
  'III-B': {
    label: 'Table III-B — Unclaimed Shares (Public)',
    columns: [
      { key: 'numberOfShareholders', header: 'No. of Shareholders' },
      { key: 'outstandingShares',    header: 'Outstanding Shares' },
      { key: 'votingRightsFrozen',   header: 'Voting Rights Frozen' },
      { key: 'notes',                header: 'Notes' },
    ],
    requiredFields: ['numberOfShareholders', 'outstandingShares', 'votingRightsFrozen', 'notes'],
  },
  'V': {
    label: 'Table V — Significant Beneficial Owners',
    columns: [
      { key: 'beneficialOwnerName',        header: 'Beneficial Owner Name' },
      { key: 'beneficialOwnerPan',         header: 'Beneficial Owner PAN' },
      { key: 'beneficialOwnerNationality', header: 'Beneficial Owner Nationality' },
      { key: 'registeredOwnerName',        header: 'Registered Owner Name' },
      { key: 'registeredOwnerPan',         header: 'Registered Owner PAN' },
      { key: 'registeredOwnerNationality', header: 'Registered Owner Nationality' },
      { key: 'numberOfShares',             header: 'Number of Shares' },
      { key: 'shareholdingPct',            header: 'Shareholding %' },
      { key: 'dateOfCreation',             header: 'Date of Creation' },
    ],
    requiredFields: [],
  },
};

const FIELD_DISPLAY_NAMES = {
  numberOfShareholders: 'Number of shareholders',
  outstandingShares:    'Outstanding shares held in demat or unclaimed suspense account',
  votingRightsFrozen:   'Voting rights which are frozen',
  notes:                'Disclosure of notes on shares which remain unclaimed',
  shareholderName:      'Name of Shareholder',
  pacName:              'Name of the PAC',
  numberOfShares:       'Number of shares',
  pacPercentage:        'Percentage of shareholding by PAC',
  beneficialOwnerName:        'Beneficial Owner Name',
  beneficialOwnerPan:         'Beneficial Owner PAN',
  beneficialOwnerNationality: 'Beneficial Owner Nationality',
  registeredOwnerName:        'Registered Owner Name',
  registeredOwnerPan:         'Registered Owner PAN',
  registeredOwnerNationality: 'Registered Owner Nationality',
  shareholdingPct:            'Shareholding as a %',
  dateOfCreation:             'Date of Creation',
};

function normH(h) {
  return String(h ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function normP(h) {
  return String(h ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

const V_FIELDS = [
  { key: 'beneficialOwnerName',        idx: 1 },
  { key: 'beneficialOwnerPan',         idx: 2 },
  { key: 'beneficialOwnerNationality', idx: 3 },
  { key: 'registeredOwnerName',        idx: 4 },
  { key: 'registeredOwnerPan',         idx: 5 },
  { key: 'registeredOwnerNationality', idx: 6 },
  { key: 'numberOfShares',             idx: 7 },
  { key: 'shareholdingPct',            idx: 8 },
  { key: 'dateOfCreation',             idx: 9 },
];


function parseFileV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rawRows.length) return reject(new Error('File is empty.'));

        let headerIdx = -1;
        for (let i = 0; i < rawRows.length; i++) {
          if (rawRows[i].some(cell => String(cell).trim() !== '')) { headerIdx = i; break; }
        }
        if (headerIdx === -1) return reject(new Error('File is empty.'));

        const hdr = rawRows[headerIdx];
        const h1 = normP(hdr[1]);
        const h7 = normP(hdr[7]);
        const h9 = normP(hdr[9]);

        if (!h1.startsWith('name') || !h7.includes('numberofshares') || !h9.startsWith('dateofcreation')) {
          const found = hdr.map((h, i) => `col ${i + 1}: "${String(h).trim() || '(empty)'}"`).join(', ');
          return reject(new Error(
            `Header row does not match expected Table V format. Headers found — ${found}`
          ));
        }

        const rows = [];
        for (let r = headerIdx + 1; r < rawRows.length; r++) {
          const raw = rawRows[r];
          if (raw.every(cell => String(cell).trim() === '' || cell === '')) continue;
          const obj = {};
          for (const { key, idx } of V_FIELDS) {
            const cell = raw[idx];
            if (key === 'dateOfCreation') {
              const s = parseDateCell(cell);
              if (s) obj[key] = s;
            } else {
              const s = String(cell ?? '').trim();
              if (s) obj[key] = s;
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

function detectField(tableCode, n) {
  if (tableCode === 'II-A' || tableCode === 'III-B') {
    if (n === 'NUMBEROFSHAREHOLDERS')         return 'numberOfShareholders';
    if (n.startsWith('OUTSTANDINGSHARES'))    return 'outstandingShares';
    if (n === 'VOTINGRIGHTSWHICHAREFROZEN')   return 'votingRightsFrozen';
    if (n.startsWith('DISCLOSUREOFNOTES'))    return 'notes';
    return null;
  }
  if (tableCode === 'III-A') {
    if (n === 'NAMEOFSHAREHOLDER')            return 'shareholderName';
    if (n === 'NAMEOFTHEPAC')                 return 'pacName';
    if (n === 'NUMBEROFSHARES')               return 'numberOfShares';
    if (n.startsWith('PERCENTAGEOFSHAREHOLDING')) return 'pacPercentage';
    return null;
  }
  return null;
}

function parseFile(file, tableCode) {
  if (tableCode === 'V') return parseFileV(file);
  return new Promise((resolve, reject) => {
    const meta = TABLE_META[tableCode];
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rawRows.length) return reject(new Error('File is empty.'));

        const normHeaders = rawRows[0].map(normH);
        const fieldIndex = {};
        normHeaders.forEach((h, i) => {
          const field = detectField(tableCode, h);
          if (field && !(field in fieldIndex)) fieldIndex[field] = i;
        });

        const missing = meta.requiredFields.filter(f => !(f in fieldIndex));
        if (missing.length) {
          return reject(new Error(
            `Missing required column${missing.length > 1 ? 's' : ''}: ${
              missing.map(f => FIELD_DISPLAY_NAMES[f] ?? f).join(', ')
            }.`
          ));
        }

        const rows = [];
        for (let r = 1; r < rawRows.length; r++) {
          const raw = rawRows[r];
          if (raw.every(cell => String(cell).trim() === '')) continue;
          const obj = {};
          for (const f of meta.requiredFields) {
            const s = String(raw[fieldIndex[f]] ?? '').trim();
            if (s) obj[f] = s;
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

function ShpTableModal({ issuerCode, tableCode, companyLabel, onClose }) {
  const fileInputRef = useRef(null);

  const canView   = hasPermission(PERM_VIEW);
  const canUpload = hasPermission(PERM_UPLOAD);
  const canDelete = hasPermission(PERM_DELETE);

  const meta = TABLE_META[tableCode];

  const [rows,      setRows]      = useState(null);
  const [listError, setListError] = useState('');

  const [parseError,   setParseError]   = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadErrors, setUploadErrors] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  const loadRows = useCallback(() => {
    if (!canView) { setRows([]); return; }
    setListError('');
    setRows(null);
    api.get(`/admin/v1/shp-table/${issuerCode}/${tableCode}`)
      .then(res => setRows(res.data?.data ?? []))
      .catch(err => {
        setListError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load.');
        setRows([]);
      });
  }, [issuerCode, tableCode, canView]);

  useEffect(() => { loadRows(); }, [loadRows]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSampleDownload() {
    try {
      const res = await api.get(`/admin/v1/shp-table/sample/${tableCode}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `shp_table_${tableCode}_sample.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* no-op */ }
  }

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
      parsed = await parseFile(file, tableCode);
    } catch (err) {
      setParseError(err.message);
      return;
    }

    setUploadStatus('uploading');
    try {
      const res = await api.post(
        `/admin/v1/shp-table/${issuerCode}/${tableCode}`,
        { sourceFile: file.name, rows: parsed }
      );
      setUploadResult(res.data?.data);
      setUploadStatus('done');
      loadRows();
    } catch (err) {
      const details = err.response?.data?.error?.details;
      if (Array.isArray(details) && details.length) setUploadErrors(details);
      setUploadStatus('error');
    }
  }

  async function handleDeleteAll() {
    setDeleting(true);
    setConfirmDelete(false);
    try {
      await api.delete(`/admin/v1/shp-table/${issuerCode}/${tableCode}`);
      loadRows();
    } catch { /* no-op */ }
    finally { setDeleting(false); }
  }

  const displayRows = rows ?? [];

  return (
    <div className="shp-modal-backdrop" onClick={onClose}>
      <div className="shp-modal" onClick={e => e.stopPropagation()}>

        <div className="shp-modal-header">
          <span className="shp-modal-title">{meta.label} — {companyLabel}</span>
          <button className="shp-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="shp-modal-body">

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
                Uploading replaces ALL existing rows of this table for this company.
                The data appears as it is in the Shareholding Pattern sheet ({tableCode}).
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

          {parseError && (
            <div className="im-banner im-banner--error">⚠ {parseError}</div>
          )}
          {uploadStatus === 'done' && uploadResult && (
            <div className="im-banner im-banner--success">
              ✓ {uploadResult.inserted ?? 0} rows saved ({uploadResult.replaced ?? 0} old rows replaced).
            </div>
          )}
          {uploadStatus === 'error' && !uploadErrors && (
            <div className="im-banner im-banner--error">⚠ Upload failed.</div>
          )}

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

          <div className="im-card shp-modal-card">
            <div className="im-card-header">
              <span>{meta.label}{rows !== null ? ` (${displayRows.length})` : ''}</span>
              {canDelete && (
                <div className="im-header-actions">
                  {confirmDelete ? (
                    <span className="cp-row-confirm">
                      Delete all rows?&nbsp;
                      <button
                        className="btn-action btn-action--pink cp-row-delete-btn"
                        disabled={deleting}
                        onClick={handleDeleteAll}
                      >Yes</button>
                      &nbsp;
                      <button
                        className="btn-action btn-action--white cp-row-delete-btn"
                        disabled={deleting}
                        onClick={() => setConfirmDelete(false)}
                      >No</button>
                    </span>
                  ) : (
                    <button
                      className="btn-action btn-action--pink"
                      disabled={deleting || rows === null || displayRows.length === 0}
                      onClick={() => setConfirmDelete(true)}
                    >
                      {deleting ? '…' : 'Delete All'}
                    </button>
                  )}
                </div>
              )}
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
                    <th style={{ width: 50 }}>#</th>
                    {meta.columns.map(col => (
                      <th key={col.key}>{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows === null ? (
                    <tr><td className="im-empty-state" colSpan={99}>Loading…</td></tr>
                  ) : displayRows.length === 0 ? (
                    <tr><td className="im-empty-state" colSpan={99}>No records found.</td></tr>
                  ) : (
                    displayRows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.rowNo ?? idx + 1}</td>
                        {meta.columns.map(col => (
                          <td key={col.key}>
                            {col.key === 'dateOfCreation'
                              ? displayDate(row[col.key])
                              : (row[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ShpTableModal;
