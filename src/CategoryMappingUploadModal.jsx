import { useState, useRef, useEffect } from 'react';
import api from './api/axios';
import './UploadModal.css';
import './CategoryMappingUploadModal.css';

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
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const res = await api.post('/admin/v1/category-mapping', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data ?? {};
      const ins  = data.inserted ?? data.created ?? data.upserted ?? 0;
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
