import { useState, useRef, useEffect } from 'react';
import api from './api/axios';
import './UploadModal.css';
import './IsinUploadModal.css';
import './RecoUpload.css';

function fmtSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── ZipDropZone ───────────────────────────────────────────────────────────────

function ZipDropZone({ heading, dropText, hint, onChange, disabled }) {
  const [file,     setFile]     = useState(null);
  const [error,    setError]    = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  function processFiles(fileList) {
    const arr = [...fileList];
    if (arr.length !== 1 || !arr[0].name.toLowerCase().endsWith('.zip')) {
      setFile(null);
      setError('Only one .zip file is allowed');
      onChange(null);
      return;
    }
    setFile(arr[0]);
    setError('');
    onChange(arr[0]);
  }

  function clear(e) {
    e?.stopPropagation();
    setFile(null);
    setError('');
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const bodyClass = [
    'um-body',
    dragOver && !file ? 'reco-drop-zone--over' : '',
    file             ? 'ium-zone-body--ready'  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="reco-zone">
      <p className="ium-zone-label">{heading}</p>

      <div
        className={bodyClass}
        onClick={!file && !disabled ? () => inputRef.current.click() : undefined}
        onDragOver={e => { e.preventDefault(); if (!file && !disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (!disabled) processFiles(e.dataTransfer.files); }}
        style={disabled ? { opacity: 0.6, pointerEvents: 'none' } : {}}
      >
        {file ? (
          <>
            <svg
              className="ium-check-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2e7d32"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
            <p className="um-filename">{file.name}, {fmtSize(file.size)}</p>
            <button
              className="reco-zone-remove-btn"
              onClick={clear}
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
            >
              &times;&nbsp;Remove
            </button>
          </>
        ) : (
          <>
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
            <p className="um-drop-text">{dropText}</p>
            <p className="um-browse-text">or click to browse</p>
          </>
        )}
      </div>

      {error && <p className="um-error reco-zone-error">{error}</p>}
      <p className="reco-modal-hint">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        style={{ display: 'none' }}
        onChange={e => { processFiles(e.target.files); e.target.value = ''; }}
        disabled={disabled}
      />
    </div>
  );
}

// ── RecoUploadModal ───────────────────────────────────────────────────────────

export default function RecoUploadModal({ onClose, onSuccess }) {
  const [cdslFile,    setCdslFile]    = useState(null);
  const [nsdlFile,    setNsdlFile]    = useState(null);
  const [idtFile,     setIdtFile]     = useState(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !uploading) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, uploading]);

  const canUpload = cdslFile !== null && nsdlFile !== null && idtFile !== null && !uploading;

  async function handleUpload() {
    if (!canUpload) return;
    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('cdslZip', cdslFile);
    formData.append('nsdlZip', nsdlFile);
    formData.append('idtZip',  idtFile);

    try {
      const res = await api.post('/admin/v1/reconciliations/upload', formData, {
        timeout: 300000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess(res.data?.data ?? res.data);
    } catch (err) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.message
        || err.message;
      setUploadError(msg);
      setUploading(false);
    }
  }

  return (
    <div
      className="upload-overlay"
      onClick={e => { if (e.target === e.currentTarget && !uploading) onClose(); }}
    >
      <div
        className="reco-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Upload Reconciliation Files"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="white">
              <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
            </svg>
          </span>
          <span className="um-header-title">Upload Reconciliation Files</span>
          <button className="um-close-btn" onClick={onClose} disabled={uploading} aria-label="Close">&times;</button>
        </div>

        {/* ── Uploading spinner ── */}
        {uploading && (
          <div className="reco-uploading-msg">
            <span className="reco-spinner" />
            Uploading and processing, please wait&hellip;
          </div>
        )}

        {/* ── Error banner ── */}
        {uploadError && (
          <div className="reco-upload-error">{uploadError}</div>
        )}

        {/* ── Three drop zones ── */}
        <div className="reco-zones-wrapper">
          <ZipDropZone
            heading="CDSL ZIP"
            dropText="Drag & drop the CDSL ZIP here"
            hint="ZIP must contain the CDSL data file and the footer file."
            onChange={setCdslFile}
            disabled={uploading}
          />
          <ZipDropZone
            heading="NSDL ZIP"
            dropText="Drag & drop the NSDL ZIP here"
            hint="ZIP must contain the NSDL .txt file."
            onChange={setNsdlFile}
            disabled={uploading}
          />
          <ZipDropZone
            heading="IDT ZIP"
            dropText="Drag & drop the IDT ZIP here"
            hint="ZIP must contain the IDT .txt files."
            onChange={setIdtFile}
            disabled={uploading}
          />
        </div>

        {/* ── Footer ── */}
        <div className="reco-modal-footer">
          <button className="btn-action btn-action--white" onClick={onClose} disabled={uploading}>CANCEL</button>
          <button className="btn-upload" disabled={!canUpload} onClick={handleUpload}>
            {uploading ? 'Uploading…' : <>&uarr;&nbsp;UPLOAD</>}
          </button>
        </div>
      </div>
    </div>
  );
}
