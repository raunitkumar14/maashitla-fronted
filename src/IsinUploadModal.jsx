import { useState, useRef }                             from 'react';
import './IsinUploadModal.css';
import { parseCdslFile }                                from './parseCdslFile';
import { deriveCdslMasterRecords, deriveCdslIsinTable } from './deriveCdslData';
import { deriveCdslIssuerSummary }                      from './deriveCdslIssuerSummary';
import { parseNsdlZip }                                 from './parseNsdlZip';
import { deriveNsdlIsinTable, deriveNsdlCompanyTable }  from './deriveNsdlData';
import { mergeIssuerSummary }                           from './mergeIssuerSummary';
import { mergeIsinMaster }                              from './mergeIsinMaster';
import { uploadIsinMaster }                             from './uploadIsinMaster';
import { uploadIssuers }                                from './uploadIssuers';

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = () => reject(new Error('Could not read file. Please try again.'));
    r.readAsText(file);
  });
}

// ── DropZone ──────────────────────────────────────────────────────────────────
// Stores the selected file and calls onReady(file). No parsing here.

function DropZone({ label, side, onReady, locked }) {
  const [state,    setState]    = useState('idle'); // idle | selected
  const [filename, setFilename] = useState('');
  const inputRef = useRef(null);

  function processFile(file) {
    if (!file || locked) return;
    setFilename(file.name);
    setState('selected');
    onReady(file);
  }

  const isSelected = state === 'selected';

  const bodyClass = [
    'um-body',
    isSelected ? 'ium-zone-body--ready' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="ium-zone">
      <p className="ium-zone-label">{label}</p>
      <div
        className={bodyClass}
        onClick={() => !locked && inputRef.current.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); processFile(e.dataTransfer.files[0]); }}
      >
        {isSelected ? (
          <>
            <svg className="ium-check-icon" viewBox="0 0 24 24" fill="none"
              stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
            <p className="um-filename">{filename}</p>
            <p className="ium-row-count">Ready</p>
          </>
        ) : (
          <>
            <svg className="um-cloud-icon" viewBox="0 0 24 24" fill="none"
              stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
            <p className="um-drop-text">Drag &amp; drop <strong>{side}</strong> file here</p>
            <p className="um-browse-text">or click to browse</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => processFile(e.target.files[0])}
      />
    </div>
  );
}

// ── IsinUploadModal ───────────────────────────────────────────────────────────
// Select NSDL + CDSL files, then one click: parse NSDL → parse CDSL → merge → save.
//
// Props:
//   onClose    — called when X is clicked (disabled while uploading)
//   onComplete — called with { nsdlRows, cdslRows, mergedRows, counts }

export default function IsinUploadModal({ onClose, onComplete }) {
  const [nsdlFile, setNsdlFile] = useState(null);
  const [cdslFile, setCdslFile] = useState(null);

  const [phase,    setPhase]    = useState('selecting'); // selecting | working | error
  const [progress, setProgress] = useState({ stage: '', saved: 0, total: 0, batch: 0, batches: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  const canUpload = nsdlFile !== null && cdslFile !== null && phase === 'selecting';
  const isWorking = phase === 'working';

  async function handleUpload() {
    setPhase('working');
    let savedSoFar = 0;
    try {
      // ── Step 1: Parse NSDL
      setProgress({ stage: 'Parsing NSDL file…', saved: 0, total: 0, batch: 0, batches: 0 });
      const nsdlRecords    = await parseNsdlZip(nsdlFile);
      const nsdlRows       = deriveNsdlIsinTable(nsdlRecords);
      const nsdlIssuerRows = deriveNsdlCompanyTable(nsdlRecords);

      // ── Step 2: Parse CDSL
      setProgress({ stage: 'Parsing CDSL file…', saved: 0, total: 0, batch: 0, batches: 0 });
      const cdslText       = await readAsText(cdslFile);
      const cdslRecords    = parseCdslFile(cdslText);
      const cdslMaster     = deriveCdslMasterRecords(cdslRecords);
      const cdslRows       = deriveCdslIsinTable(cdslMaster);
      const cdslIssuerRows = deriveCdslIssuerSummary(cdslRecords);

      // ── Step 3: Merge & save ISINs
      setProgress({ stage: 'Merging data…', saved: 0, total: 0, batch: 0, batches: 0 });
      const { merged, counts } = mergeIsinMaster(cdslRows, nsdlRows);

      setProgress(p => ({ ...p, stage: 'Saving ISINs… (1/2)', total: merged.length }));

      const isinResult = await uploadIsinMaster(merged, (p) => {
        const saved = p.phase === 'posting'
          ? p.recordsBefore
          : p.recordsBefore + (p.currentBatchProcessed ?? 0);
        savedSoFar = saved;
        setProgress({
          stage:   'Saving ISINs… (1/2)',
          saved,
          total:   p.totalRecords,
          batch:   p.batchNum,
          batches: p.totalBatches,
        });
      });

      if (isinResult.totalFailed > 0) {
        setPhase('error');
        setErrorMsg(
          `${isinResult.totalSucceeded.toLocaleString()} ISINs saved, ` +
          `${isinResult.totalFailed.toLocaleString()} failed. Check server logs.`
        );
        return;
      }

      // ── Step 4: Save merged issuer summary (NSDL + CDSL outer-join)
      const mergedIssuers = mergeIssuerSummary(
        cdslIssuerRows ?? [],
        nsdlIssuerRows ?? [],
        merged,
      );
      if (mergedIssuers.length > 0) {
        setProgress({ stage: 'Saving issuers… (2/2)', saved: 0, total: mergedIssuers.length, batch: 0, batches: 0 });

        const issuerResult = await uploadIssuers(mergedIssuers, (p) => {
          const saved = p.phase === 'posting'
            ? p.recordsBefore
            : p.recordsBefore + (p.currentBatchProcessed ?? 0);
          setProgress({
            stage:   'Saving issuers… (2/2)',
            saved,
            total:   p.totalRecords,
            batch:   p.batchNum,
            batches: p.totalBatches,
          });
        });

        if (issuerResult.totalFailed > 0) {
          setPhase('error');
          setErrorMsg(
            `ISINs saved. ` +
            `${issuerResult.totalSucceeded.toLocaleString()} issuers saved, ` +
            `${issuerResult.totalFailed.toLocaleString()} failed. Check server logs.`
          );
          return;
        }
      }

      onComplete({ nsdlRows, cdslRows, mergedRows: merged, counts });

    } catch (err) {
      setPhase('error');
      setErrorMsg(
        `Failed after saving ${savedSoFar.toLocaleString()} records. ` +
        (err.response?.data?.error?.message ?? err.message ?? 'Unknown error.')
      );
    }
  }

  const pct = progress.total > 0
    ? Math.min(100, Math.round((progress.saved / progress.total) * 100))
    : 0;

  return (
    <div className="upload-overlay" onClick={!isWorking ? onClose : undefined}>
      <div className="ium-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="white">
              <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="10,1 10,5 14,5" fill="none" stroke="white" strokeWidth="1"/>
            </svg>
          </span>
          <span className="um-header-title">Upload ISIN Master &mdash; NSDL &amp; CDSL</span>
          <button
            className="um-close-btn"
            onClick={onClose}
            disabled={isWorking}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* ── Drop zones (selecting phase) */}
        {phase === 'selecting' && (
          <div className="ium-zones-wrapper">
            <DropZone label="NSDL File" side="NSDL" onReady={file => setNsdlFile(file)} locked={false} />
            <DropZone label="CDSL File" side="CDSL" onReady={file => setCdslFile(file)} locked={false} />
          </div>
        )}

        {/* ── Progress (working phase) */}
        {phase === 'working' && (
          <div className="ium-progress-wrapper">
            <div className="ium-file-summary">
              {nsdlFile && (
                <span className="ium-file-badge ium-file-badge--nsdl">
                  NSDL &#10003; {nsdlFile.name}
                </span>
              )}
              {cdslFile && (
                <span className="ium-file-badge ium-file-badge--cdsl">
                  CDSL &#10003; {cdslFile.name}
                </span>
              )}
            </div>
            {(progress.stage === 'Parsing NSDL file…' || progress.stage === 'Parsing CDSL file…') ? (
              <div className="ium-parse-steps">
                <div className={`ium-parse-step${progress.stage === 'Parsing CDSL file…' ? ' ium-parse-step--done' : ''}`}>
                  <span className="ium-parse-icon">
                    {progress.stage === 'Parsing CDSL file…'
                      ? <span className="ium-parse-check">&#10003;</span>
                      : <div className="um-spinner ium-parse-spinner" />
                    }
                  </span>
                  Parsing NSDL file&hellip;
                </div>
                <div className={`ium-parse-step${progress.stage === 'Parsing NSDL file…' ? ' ium-parse-step--pending' : ''}`}>
                  <span className="ium-parse-icon">
                    {progress.stage === 'Parsing CDSL file…'
                      ? <div className="um-spinner ium-parse-spinner" />
                      : <span className="ium-parse-dot">&#9679;</span>
                    }
                  </span>
                  Parsing CDSL file&hellip;
                </div>
              </div>
            ) : (
              <>
                <p className="ium-progress-stage">{progress.stage}</p>
                {progress.total > 0 ? (
                  <>
                    <div className="ium-progress-track">
                      <div className="ium-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="ium-progress-count">
                      {progress.saved.toLocaleString()} / {progress.total.toLocaleString()} records
                      {progress.batches > 1 && ` — batch ${progress.batch} of ${progress.batches}`}
                    </p>
                  </>
                ) : (
                  <div className="um-spinner" />
                )}
              </>
            )}
          </div>
        )}

        {/* ── Error */}
        {phase === 'error' && (
          <div className="ium-error-wrapper">
            <p className="ium-error-text">&#9888; {errorMsg}</p>
          </div>
        )}

        {/* ── Action bar */}
        <div className="ium-action-bar">
          {phase === 'selecting' && (
            <button
              className="ium-upload-btn"
              disabled={!canUpload}
              onClick={handleUpload}
              title={!canUpload ? 'Select both NSDL and CDSL files first' : undefined}
            >
              &#8679; UPLOAD &amp; GENERATE
            </button>
          )}
          {phase === 'working' && (
            <button className="ium-upload-btn" disabled>
              &#9203; Working&hellip;
            </button>
          )}
          {phase === 'error' && (
            <button className="ium-upload-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
