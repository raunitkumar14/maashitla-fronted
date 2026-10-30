import { useState, useRef, useEffect } from 'react';
import api from './api/axios';
import './UploadModal.css';
import './CategoryMappingUploadModal.css';
import * as XLSX from 'xlsx';

// Backend accepts .xlsx, .xls and .csv (matches the page hint text)
const ACCEPTED_EXTS = ['.xlsx', '.xls', '.csv'];

function fileIsAccepted(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTS.some(ext => name.endsWith(ext));
}

function fmtBytes(n) {
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ── Excel parsing ──────────────────────────────────────────────────────────────
// Strips spaces, hyphens, underscores, slashes then uppercases so that
// "Regulation 31 Sub-Type - Public" and "Shareholder/ Debenture Holder Type"
// normalise to clean keys that can be looked up in HEADER_MAP.
function normalizeHeader(h) {
  return String(h ?? '').replace(/[\s\-_/]+/g, '').toUpperCase();
}

const HEADER_MAP = {
  'RTAID':                              'rtaId',
  'RTADESCRIPTION':                     'rtaDescription',
  'CATEGORYTYPE':                       'categoryType',
  'CATEGORYSUBTYPE':                    'categorySubType',
  'CATEGORYTYPEDESCRIPTION':            'categoryTypeDescription',
  'CATEGORYSUBTYPEDESCRIPTION':         'categorySubTypeDescription',
  'DEPOSITORY':                         'depository',
  'REGULATION31SUBTYPEPUBLIC':          'regulation31SubTypePublic',
  'REGULATION31TYPEPUBLIC':             'regulation31TypePublic',
  'PROMOTER':                           'promoter',
  'REGULATION31TYPEPROMOTER':           'regulation31TypePromoter',
  'INVESTERTYPE':                       'investorType',
  'INVESTORTYPE':                       'investorType',
  'SHPPROMOTERCODE':                    'shpPromoterCode',
  'SHPPUBLICCODE':                      'shpPublicCode',
  'TDSTAXSLAB':                         'tdsTaxSlab',
  'SHAREHOLDERDEBENTUREHOLDERTYPE':     'shareholderDebentureHolderType',
  'SHAREHOLDERCATEGORY':                'shareholderCategory',
  'SHAREHOLDERDEBENTUREHOLDERDETAILS':  'shareholderDebentureHolderDetails',
  'IDENTIFIERTYPE':                     'identifierType',
  'EVOTINGCLIENTTYPE':                  'eVotingClientType',
  'FOREIGNOWNERSHIP':                   'foreignOwnership',
};

const REQUIRED_FIELDS = [
  'depository', 'categoryType', 'categorySubType',
  'categoryTypeDescription', 'categorySubTypeDescription',
];
const REQUIRED_DISPLAY = {
  depository:                 'Depository',
  categoryType:               'Category type',
  categorySubType:            'Category sub type',
  categoryTypeDescription:    'Category type description',
  categorySubTypeDescription: 'Category sub type description',
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
        const fieldIndex  = {};
        normHeaders.forEach((h, i) => {
          const field = HEADER_MAP[h];
          if (field && !(field in fieldIndex)) fieldIndex[field] = i;
        });

        const missing = REQUIRED_FIELDS.filter(f => !(f in fieldIndex));
        if (missing.length) {
          const labels = missing.map(f => REQUIRED_DISPLAY[f]);
          return reject(new Error(
            `Missing required column${labels.length > 1 ? 's' : ''}: ${labels.join(', ')}.`
          ));
        }

        const hasFO = 'foreignOwnership' in fieldIndex;

        const rows = [];
        for (let r = 1; r < rawRows.length; r++) {
          const raw = rawRows[r];
          if (raw.every(cell => String(cell).trim() === '')) continue;

          const obj = {};
          for (const [field, idx] of Object.entries(fieldIndex)) {
            if (field === 'foreignOwnership') continue; // handled below
            if (field === 'rtaId') {
              const v = raw[idx];
              if (v === '' || v == null) { obj.rtaId = null; continue; }
              const n = parseInt(String(v).trim(), 10);
              obj.rtaId = Number.isFinite(n) ? n : null;
            } else {
              const v = String(raw[idx] ?? '').trim();
              obj[field] = v === '' ? null : v;
            }
          }

          if (hasFO) {
            const fo = String(raw[fieldIndex.foreignOwnership] ?? '').trim().toUpperCase();
            obj.foreignOwnership = (fo === 'Y' || fo === 'YES') ? 'Y'
                                 : (fo === 'N' || fo === 'NO')  ? 'N'
                                 : null;
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

// ── CategoryMappingUploadModal ─────────────────────────────────────────────────
//
// Props:
//   onClose     — dismiss without uploading (X, CANCEL, Esc, backdrop)
//   onComplete  — called with { ins, upd } when the upload succeeds;
//                 parent shows the success banner and reloads the list

export default function CategoryMappingUploadModal({ onClose, onComplete }) {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [typeError,    setTypeError]    = useState('');
  const [dragOver,     setDragOver]     = useState(false);
  const [phase,        setPhase]        = useState('idle'); // idle | uploading | error
  const [errorMsg,     setErrorMsg]     = useState('');

  const isUploading = phase === 'uploading';

  // Close on Escape unless an upload is running
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !isUploading) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isUploading, onClose]);

  function selectFile(file) {
    if (!file) return;
    if (!fileIsAccepted(file)) {
      setTypeError('Unsupported file type. Only .xlsx and .csv files are accepted.');
      setSelectedFile(null);
      return;
    }
    setTypeError('');
    setErrorMsg('');
    setPhase('idle');
    setSelectedFile(file);
  }

  function clearFile() {
    setSelectedFile(null);
    setTypeError('');
    setErrorMsg('');
    setPhase('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUpload() {
    if (!selectedFile || isUploading) return;
    setPhase('uploading');
    setErrorMsg('');

    let rows;
    try {
      rows = await parseExcel(selectedFile);
    } catch (parseErr) {
      setPhase('error');
      setErrorMsg(parseErr.message);
      return;
    }

    try {
      const res  = await api.post('/admin/v1/category-mapping/bulk', rows);
      const data = res.data?.data ?? {};
      const ins  = data.count ?? data.inserted ?? data.created ?? 0;
      const upd  = data.updated ?? 0;
      onComplete({ ins, upd });
    } catch (err) {
      setPhase('error');
      setErrorMsg(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
    }
  }

  return (
    <div
      className="upload-overlay"
      onClick={!isUploading ? onClose : undefined}
    >
      <div
        className="cmu-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upload Category Mapping File"
      >

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="white">
              <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
            </svg>
          </span>
          <span className="um-header-title">Upload Category Mapping File</span>
          <button
            className="um-close-btn"
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* ── Drop zone / file selected ──────────────────────────────────────── */}
        <div className="cmu-body">

          {selectedFile ? (
            // File selected: show name, size, and remove button
            <div className="cmu-file-card">
              <svg className="cmu-file-icon" viewBox="0 0 24 24" fill="none"
                stroke="#2e7d32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="9 15 11 17 15 13"/>
              </svg>
              <div className="cmu-file-info">
                <span className="cmu-file-name">{selectedFile.name}</span>
                <span className="cmu-file-size">{fmtBytes(selectedFile.size)}</span>
              </div>
              {!isUploading && (
                <button className="cmu-file-remove" onClick={clearFile} aria-label="Remove file">
                  &times;
                </button>
              )}
            </div>
          ) : (
            // No file yet: dashed drop zone
            <div
              className={`um-body cmu-drop-zone${dragOver ? ' cmu-drop-zone--over' : ''}`}
              onClick={() => fileInputRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files[0]); }}
            >
              <svg
                className="um-cloud-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#555"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 16 12 12 8 16"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
              </svg>
              <p className="um-drop-text">
                <strong>Drag &amp; Drop your Category Mapping file here</strong>
              </p>
              <p className="um-browse-text">
                or click to browse (Only .xlsx and .csv files allowed)
              </p>
              {typeError && <p className="um-error">{typeError}</p>}
            </div>
          )}

          {/* Uploading spinner row */}
          {isUploading && (
            <div className="cmu-uploading-row">
              <div className="um-spinner" />
              <span className="um-parsing-text">Uploading {selectedFile?.name}&hellip;</span>
            </div>
          )}

          {/* Inline error */}
          {phase === 'error' && errorMsg && (
            <p className="cmu-error-msg">&#9888; {errorMsg}</p>
          )}

        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          style={{ display: 'none' }}
          onChange={e => { selectFile(e.target.files[0]); e.target.value = ''; }}
        />

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="cmu-footer">
          <button
            className="cmu-cancel-btn"
            disabled={isUploading}
            onClick={onClose}
          >
            CANCEL
          </button>
          <button
            className="cmu-submit-btn"
            disabled={!selectedFile || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? '⏳ Uploading…' : '↑ UPLOAD'}
          </button>
        </div>

      </div>
    </div>
  );
}
