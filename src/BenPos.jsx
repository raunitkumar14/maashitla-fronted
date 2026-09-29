import { useState } from 'react';
import './IsinMaster.css';
import './BenPos.css';
import UploadModal from './UploadModal';
import { parseCdslBenposZip } from './parseCdslBenposZip';
import { uploadCdslBenpos } from './uploadCdslBenpos';
import { parseNsdlBenpos } from './parseNsdlBenpos';
import { uploadNsdlBenpos } from './uploadNsdlBenpos';
import { exportBenpos } from './benposExport';

// ── Progress card (shared between CDSL and NSDL upload) ───────────────────────

function UploadProgressCard({ progress }) {
  const processed = progress.phase === 'polling'
    ? progress.recordsBefore + (progress.currentBatchProcessed ?? 0)
    : progress.recordsBefore;
  const pct = progress.totalRecords > 0
    ? Math.min(100, Math.round((processed / progress.totalRecords) * 100))
    : 0;
  return (
    <div className="im-card benpos-progress-card">
      <div className="benpos-progress-header">
        {progress.phase === 'posting'
          ? `⬆ Uploading batch ${progress.batchNum} of ${progress.totalBatches}…`
          : `⏳ Processing batch ${progress.batchNum} of ${progress.totalBatches}…`}
      </div>
      <div className="benpos-progress-counts">
        {progress.phase === 'polling'
          ? `Batch rows: ${(progress.currentBatchProcessed ?? 0).toLocaleString()} / ${(progress.currentBatchTotal ?? 0).toLocaleString()} — Overall: ${processed.toLocaleString()} / ${progress.totalRecords.toLocaleString()} records`
          : `${processed.toLocaleString()} / ${progress.totalRecords.toLocaleString()} records sent`}
      </div>
      <div className="benpos-progress-bar-wrap">
        <div className="benpos-progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}


// ── Main component ────────────────────────────────────────────────────────────

function BenPos() {
  const [selectedIsins,   setSelectedIsins]   = useState([]);
  const [isinInput,       setIsinInput]       = useState('');
  const [exportDate,      setExportDate]      = useState('');
  const [exportLoading,   setExportLoading]   = useState(false);
  const [exportError,     setExportError]     = useState('');
  const [exportCount,     setExportCount]     = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // ── CDSL upload/parse state ─────────────────────────────────────────────────

  const [cdslParseStatus,    setCdslParseStatus]    = useState(null);
  const [cdslParseMessage,   setCdslParseMessage]   = useState('');
  const [cdslUploadStatus,   setCdslUploadStatus]   = useState(null);
  const [cdslUploadProgress, setCdslUploadProgress] = useState(null);
  const [cdslUploadSummary,  setCdslUploadSummary]  = useState(null);
  const [cdslUploadError,    setCdslUploadError]    = useState('');

  // ── NSDL upload/parse state ─────────────────────────────────────────────────

  const [nsdlParseStatus,    setNsdlParseStatus]    = useState(null);
  const [nsdlParseMessage,   setNsdlParseMessage]   = useState('');
  const [nsdlUploadStatus,   setNsdlUploadStatus]   = useState(null);
  const [nsdlUploadProgress, setNsdlUploadProgress] = useState(null);
  const [nsdlUploadSummary,  setNsdlUploadSummary]  = useState(null);
  const [nsdlUploadError,    setNsdlUploadError]    = useState('');

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleIsinKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = isinInput.trim().replace(/,/g, '');
      if (val && !selectedIsins.includes(val)) {
        setSelectedIsins(s => [...s, val]);
      }
      setIsinInput('');
    } else if (e.key === 'Backspace' && isinInput === '' && selectedIsins.length > 0) {
      setSelectedIsins(s => s.slice(0, -1));
    }
  }

  function removeIsin(isin) {
    setSelectedIsins(s => s.filter(x => x !== isin));
  }

  async function handleDownload() {
    if (selectedIsins.length === 0) return;
    setExportLoading(true);
    setExportError('');
    setExportCount(null);
    try {
      const count = await exportBenpos(selectedIsins, exportDate);
      setExportCount(count);
    } catch (err) {
      setExportError(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleCdslParsed(file) {
    setShowUploadModal(false);
    setCdslParseStatus('parsing');
    setCdslParseMessage('Parsing CDSL BenPos zip file…');
    setCdslUploadStatus(null);
    setCdslUploadSummary(null);
    setCdslUploadError('');
    setCdslUploadProgress(null);

    let records;
    try {
      const { records: parsed, fileCount: fc } = await parseCdslBenposZip(file);
      records = parsed;
      setCdslParseStatus('done');
      setCdslParseMessage(
        `${records.length.toLocaleString()} records parsed from ${fc} file${fc !== 1 ? 's' : ''}.`
      );
    } catch (err) {
      setCdslParseStatus('error');
      setCdslParseMessage(`Parse failed: ${err.message}`);
      return;
    }

    setCdslUploadStatus('uploading');
    try {
      const summary = await uploadCdslBenpos(records, setCdslUploadProgress);
      setCdslUploadSummary(summary);
      setCdslUploadStatus('done');
    } catch (err) {
      setCdslUploadError(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      setCdslUploadStatus('error');
    }
    setCdslUploadProgress(null);
  }

  async function handleNsdlParsed(file) {
    setShowUploadModal(false);
    setNsdlParseStatus('parsing');
    setNsdlParseMessage('Parsing NSDL BenPos zip file…');
    setNsdlUploadStatus(null);
    setNsdlUploadSummary(null);
    setNsdlUploadError('');
    setNsdlUploadProgress(null);

    let records;
    try {
      const { records: parsed, fileCount: fc } = await parseNsdlBenpos(file);
      records = parsed;
      setNsdlParseStatus('done');
      setNsdlParseMessage(
        `${records.length.toLocaleString()} records parsed from ${fc} file${fc !== 1 ? 's' : ''}.`
      );
    } catch (err) {
      setNsdlParseStatus('error');
      setNsdlParseMessage(`Parse failed: ${err.message}`);
      return;
    }

    setNsdlUploadStatus('uploading');
    try {
      const summary = await uploadNsdlBenpos(records, setNsdlUploadProgress);
      setNsdlUploadSummary(summary);
      setNsdlUploadStatus('done');
    } catch (err) {
      setNsdlUploadError(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      setNsdlUploadStatus('error');
    }
    setNsdlUploadProgress(null);
  }

  const isBusy =
    cdslParseStatus === 'parsing' || cdslUploadStatus === 'uploading' ||
    nsdlParseStatus === 'parsing' || nsdlUploadStatus === 'uploading';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">BenPos</h1>

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Beneficiary Position</span>
          <button
            className="btn-upload"
            onClick={() => setShowUploadModal(true)}
            disabled={isBusy}
          >
            {isBusy ? '⏳ Processing…' : '↑ UPLOAD'}
          </button>
        </div>

        <div className="benpos-filter-body">
          <div className="benpos-filter-row">
            <div className="benpos-field benpos-field--isin">
              <label className="benpos-label">ISIN</label>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className="benpos-isin-wrap"
                onClick={() => document.getElementById('benpos-isin-input').focus()}
              >
                {selectedIsins.map(isin => (
                  <span key={isin} className="benpos-isin-tag">
                    {isin}
                    <button
                      className="benpos-isin-tag-remove"
                      type="button"
                      onClick={() => removeIsin(isin)}
                    >×</button>
                  </span>
                ))}
                <input
                  id="benpos-isin-input"
                  className="benpos-isin-input"
                  type="text"
                  value={isinInput}
                  placeholder={selectedIsins.length === 0 ? 'Type ISIN and press Enter or comma' : ''}
                  onChange={e => setIsinInput(e.target.value.toUpperCase())}
                  onKeyDown={handleIsinKeyDown}
                />
              </div>
            </div>
          </div>

          <div className="benpos-filter-row benpos-filter-row--actions">
            <div className="benpos-field benpos-field--date">
              <label className="benpos-label">Date</label>
              <input
                type="date"
                className="benpos-date-input"
                value={exportDate}
                onChange={e => setExportDate(e.target.value)}
              />
            </div>
            <button
              className="btn-action btn-action--pink benpos-download-btn"
              onClick={handleDownload}
              disabled={exportLoading || selectedIsins.length === 0}
            >
              {exportLoading ? '⏳ Exporting…' : '↓ DOWNLOAD'}
            </button>
          </div>

          {exportError && (
            <div className="im-banner im-banner--error">⚠ {exportError}</div>
          )}
          {exportCount != null && !exportError && (
            <div className="im-banner im-banner--success">
              ✓ Export complete — {exportCount.toLocaleString()} rows downloaded.
            </div>
          )}
        </div>
      </div>

      {/* ════════════════ CDSL UPLOAD STATUS ════════════════ */}

      {cdslParseStatus === 'parsing' && (
        <div className="im-banner im-banner--info">⏳ {cdslParseMessage}</div>
      )}
      {cdslParseStatus === 'done' && (
        <div className="im-banner im-banner--success">✓ CDSL — {cdslParseMessage}</div>
      )}
      {cdslParseStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ CDSL — {cdslParseMessage}</div>
      )}

      {cdslUploadStatus === 'uploading' && cdslUploadProgress && (
        <UploadProgressCard progress={cdslUploadProgress} />
      )}

      {cdslUploadStatus === 'done' && cdslUploadSummary && (
        <div className="im-banner im-banner--success">
          ✓ CDSL upload complete — {cdslUploadSummary.totalSucceeded.toLocaleString()} succeeded
          {cdslUploadSummary.totalFailed > 0 && `, ${cdslUploadSummary.totalFailed.toLocaleString()} failed`}
          {cdslUploadSummary.errors.length > 0 && (
            <div className="benpos-error-list">
              {cdslUploadSummary.errors.slice(0, 3).map((e, i) => (
                <div key={i} className="benpos-error-item">• {String(e?.message ?? e)}</div>
              ))}
              {cdslUploadSummary.errors.length > 3 && (
                <div className="benpos-error-item">…and {cdslUploadSummary.errors.length - 3} more errors</div>
              )}
            </div>
          )}
        </div>
      )}

      {cdslUploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ CDSL upload failed: {cdslUploadError}</div>
      )}

      {/* ════════════════ NSDL UPLOAD STATUS ════════════════ */}

      {nsdlParseStatus === 'parsing' && (
        <div className="im-banner im-banner--info">⏳ {nsdlParseMessage}</div>
      )}
      {nsdlParseStatus === 'done' && (
        <div className="im-banner im-banner--success">✓ NSDL — {nsdlParseMessage}</div>
      )}
      {nsdlParseStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ NSDL — {nsdlParseMessage}</div>
      )}

      {nsdlUploadStatus === 'uploading' && nsdlUploadProgress && (
        <UploadProgressCard progress={nsdlUploadProgress} />
      )}

      {nsdlUploadStatus === 'done' && nsdlUploadSummary && (
        <div className="im-banner im-banner--success">
          ✓ NSDL upload complete — {nsdlUploadSummary.totalSucceeded.toLocaleString()} succeeded
          {nsdlUploadSummary.totalFailed > 0 && `, ${nsdlUploadSummary.totalFailed.toLocaleString()} failed`}
          {nsdlUploadSummary.errors.length > 0 && (
            <div className="benpos-error-list">
              {nsdlUploadSummary.errors.slice(0, 3).map((e, i) => (
                <div key={i} className="benpos-error-item">• {String(e?.message ?? e)}</div>
              ))}
              {nsdlUploadSummary.errors.length > 3 && (
                <div className="benpos-error-item">…and {nsdlUploadSummary.errors.length - 3} more errors</div>
              )}
            </div>
          )}
        </div>
      )}

      {nsdlUploadStatus === 'error' && (
        <div className="im-banner im-banner--error">⚠ NSDL upload failed: {nsdlUploadError}</div>
      )}

      {/* ── Upload overlay — NSDL + CDSL modals side by side ── */}
      {showUploadModal && (
        <div className="upload-overlay">
          <UploadModal
            title="Upload NSDL Benpos"
            depository="NSDL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleNsdlParsed}
            passRawFile
          />
          <UploadModal
            title="Upload CDSL Benpos"
            depository="CDSL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleCdslParsed}
            passRawFile
          />
        </div>
      )}

    </div>
  );
}

export default BenPos;
