import { useState, useRef } from 'react';
import { buildXlsxBlob } from './xlsxStream';
import { uploadOutward, triggerDownload } from './services/daakService';
import './IsinMaster.css';
import './DaakEntry.css';

const TEMPLATE_HEADERS = [
  'ID', 'Dispatch Date', 'Company Name', 'ISIN', 'Recipient Name', 'Recipient Email',
  'Address Line 1', 'Address Line 2', 'Pin Code', 'City', 'State', 'Phone No',
  'Courier Company', 'Document Type', 'DRN', 'Sender Name', 'POD Number', 'Cost',
];

function OutwardUploadModal({ onClose, onSuccess }) {
  const fileInputRef = useRef(null);

  const [file,       setFile]       = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileErr,    setFileErr]    = useState('');
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState('');
  const [result,     setResult]     = useState(null);

  function acceptFile(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setFileErr('Only .xlsx files are accepted.');
      setFile(null);
      return;
    }
    setFileErr('');
    setFile(f);
    setResult(null);
    setUploadErr('');
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) acceptFile(f);
  }

  function handleFileChange(e) {
    acceptFile(e.target.files?.[0]);
    e.target.value = '';
  }

  async function handleTemplateDownload() {
    try {
      const blob = await buildXlsxBlob(TEMPLATE_HEADERS, [], {
        sheetName:  'Outward Upload',
        headerFill: 'ADD8E6',
      });
      triggerDownload(blob, 'Outward_Upload_Template.xlsx');
    } catch { /* no-op */ }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadErr('');
    setResult(null);
    try {
      const res = await uploadOutward(file);
      setResult(res);
      if ((res?.invalid?.length ?? 0) === 0) {
        onSuccess();
      }
    } catch (err) {
      setUploadErr(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const dropClass = [
    'dk-upload-drop',
    isDragOver        ? 'dk-upload-drop--over'  : '',
    file && !fileErr  ? 'dk-upload-drop--ready' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="dk-overlay">
      <div className="dk-upload-modal">

        {/* Header */}
        <div className="dk-dialog-hdr">
          <span>Upload Outward Entries</span>
          <button className="dk-dialog-close" onClick={onClose} disabled={uploading}>✕</button>
        </div>

        {/* Drop zone */}
        <div
          className={dropClass}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !file && fileInputRef.current?.click()}
        >
          {/* Cloud-upload SVG */}
          <svg className="dk-upload-cloud" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M38 20.07A14 14 0 1 0 12.4 28H14" stroke="#1976d2" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M24 28v14M19 37l5 5 5-5" stroke="#1976d2" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>

          {file && !fileErr ? (
            <>
              <p className="dk-upload-fname">📄 {file.name}</p>
              <span
                className="dk-upload-browse-txt"
                onClick={e => { e.stopPropagation(); setFile(null); setResult(null); }}
              >
                Remove
              </span>
            </>
          ) : (
            <>
              <p className="dk-upload-drop-text">Drag &amp; drop your .xlsx file here</p>
              <span
                className="dk-upload-browse-txt"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                or browse to upload
              </span>
            </>
          )}

          {fileErr && <p className="dk-upload-err-txt">⚠ {fileErr}</p>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Helper text + template link */}
        <div className="dk-upload-hint">
          Leave <strong>ID</strong> empty to create a new entry. Fill <strong>ID</strong> to update
          only POD Number and Cost of an existing entry.
          <br />
          <button className="dk-upload-tpl-btn" onClick={handleTemplateDownload}>
            ↓ Download template
          </button>
        </div>

        {/* Action buttons */}
        {!result && (
          <div className="dk-upload-actions">
            <button
              className="btn-action btn-action--pink"
              onClick={handleUpload}
              disabled={!file || !!fileErr || uploading}
              style={{ padding: '10px 24px', fontSize: 12 }}
            >
              {uploading ? 'Uploading…' : 'UPLOAD'}
            </button>
            <button
              className="btn-action btn-action--white"
              onClick={onClose}
              disabled={uploading}
              style={{ padding: '10px 20px', fontSize: 12 }}
            >
              Cancel
            </button>
            {uploadErr && <span className="ca-err" style={{ fontSize: 12 }}>{uploadErr}</span>}
          </div>
        )}

        {/* Upload result */}
        {result && (
          <div className="dk-upload-result">
            <div className="dk-upload-summary">
              <span>✓ Created: <strong>{result.created ?? 0}</strong></span>
              <span>✓ Updated: <strong>{result.updated ?? 0}</strong></span>
            </div>

            {result.invalid?.length > 0 && (
              <>
                <div className="dk-invalid-hdg">Invalid rows ({result.invalid.length})</div>
                <div className="dk-invalid-scroll">
                  <table className="dk-invalid-tbl">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.invalid.map((item, i) => (
                        <tr key={i}>
                          <td>{item.row}</td>
                          <td>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="dk-upload-actions" style={{ paddingTop: 14 }}>
              <button
                className="btn-action btn-action--pink"
                onClick={() => { setFile(null); setResult(null); }}
                style={{ padding: '10px 20px', fontSize: 12 }}
              >
                Upload Another
              </button>
              <button
                className="btn-action btn-action--white"
                onClick={onClose}
                style={{ padding: '10px 20px', fontSize: 12 }}
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default OutwardUploadModal;
