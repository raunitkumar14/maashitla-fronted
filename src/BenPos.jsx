import { useState, useEffect } from 'react';
import './IsinMaster.css';
import './BenPos.css';
import api from './api/axios';
import UploadModal from './UploadModal';
import { parseCdslBenposZip } from './parseCdslBenposZip';
import { uploadCdslBenpos } from './uploadCdslBenpos';
import { parseNsdlBenpos } from './parseNsdlBenpos';
import { uploadNsdlBenpos } from './uploadNsdlBenpos';
import { exportBenpos, exportAllBenpos, exportIssuerBenposZip } from './benposExport';

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


// ── Date display helper ───────────────────────────────────────────────────────

function fmtDate(iso) {
  // '2026-09-25' → '25-09-2026'
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

// ── Main component ────────────────────────────────────────────────────────────

function BenPos() {
  const [selectedIsins,   setSelectedIsins]   = useState([]);
  const [isinInput,       setIsinInput]       = useState('');
  const [allIsin,         setAllIsin]         = useState(false);
  const [exportDate,      setExportDate]      = useState('');
  const [exportLoading,      setExportLoading]      = useState(false);
  const [exportProgress,     setExportProgress]     = useState('');
  const [exportError,        setExportError]        = useState('');
  const [exportMessage,      setExportMessage]      = useState(null);
  const [showUploadModal,    setShowUploadModal]    = useState(false);
  const [selectedIssuer,     setSelectedIssuer]     = useState(null);
  const [issuerQuery,        setIssuerQuery]        = useState('');
  const [issuerSuggestions,  setIssuerSuggestions]  = useState([]);
  const [issuerLoading,      setIssuerLoading]      = useState(false);
  const [showIssuerDropdown, setShowIssuerDropdown] = useState(false);
  const [availableDates,     setAvailableDates]     = useState([]);
  const [datesLoading,       setDatesLoading]       = useState(false);
  const [datesError,         setDatesError]         = useState('');
  const [datesFallback,      setDatesFallback]      = useState(false);

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

  // ── Issuer autocomplete suggestions ────────────────────────────────────────

  useEffect(() => {
    const q = issuerQuery.trim();
    if (q.length < 2) { setIssuerSuggestions([]); setIssuerLoading(false); return; }
    setIssuerLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [byName, byCode] = await Promise.allSettled([
          api.get('/admin/v1/issuers', { params: { issuerName: q, pageSize: 10 } }),
          api.get('/admin/v1/issuers', { params: { issuerCode: q, pageSize: 10 } }),
        ]);
        const seen = new Map();
        for (const res of [byName, byCode]) {
          if (res.status === 'fulfilled') {
            for (const item of (res.value.data?.data?.items ?? [])) {
              if (!seen.has(item.issuerCode)) seen.set(item.issuerCode, item);
            }
          }
        }
        setIssuerSuggestions([...seen.values()].slice(0, 10));
        setShowIssuerDropdown(true);
      } catch {
        setIssuerSuggestions([]);
      } finally {
        setIssuerLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [issuerQuery]);

  // ── Available dates fetch ─────────────────────────────────────────────────
  // Re-runs when the selection mode changes. Clears exportDate immediately so
  // the export button stays disabled while new dates are loading.

  useEffect(() => {
    const modeActive = allIsin || !!selectedIssuer || selectedIsins.length > 0;
    if (!modeActive) {
      setAvailableDates([]);
      setExportDate('');
      setDatesLoading(false);
      setDatesError('');
      setDatesFallback(false);
      return;
    }

    setDatesLoading(true);
    setDatesError('');
    setExportDate(''); // clear stale selection while fetching

    const params = {};
    if (!allIsin && selectedIssuer)         params.issuerCode = selectedIssuer.issuerCode;
    else if (!allIsin && selectedIsins.length > 0) params.isin = selectedIsins.join(',');
    // allIsin → no params

    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/admin/v1/benpos-dates', { params });
        const dates = res.data?.data?.dates ?? res.data?.dates ?? [];
        setAvailableDates(dates);
        setDatesFallback(false);
        setDatesError('');
        setExportDate(dates.length === 1 ? dates[0] : '');
      } catch {
        setDatesError('Could not load available dates. Enter date manually.');
        setDatesFallback(true);
      } finally {
        setDatesLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIsin, selectedIssuer, selectedIsins]);

  async function handleDownload() {
    if (!exportDate) { setExportError('Please select a Date.'); return; }

    // ── All ISIN mode ────────────────────────────────────────────────────────
    if (allIsin) {
      setExportLoading(true);
      setExportError('');
      setExportMessage(null);
      setExportProgress('');
      try {
        const { count, missingCategoryCount } = await exportAllBenpos(exportDate, msg => setExportProgress(msg));
        let successMsg = `✓ Export complete — ${count.toLocaleString()} rows downloaded.`;
        if (missingCategoryCount > 0)
          successMsg += ` ${missingCategoryCount.toLocaleString()} row${missingCategoryCount !== 1 ? 's' : ''} had no category mapping.`;
        setExportMessage(successMsg);
      } catch (err) {
        console.error('[benposExport] failed:', err.stack);
        setExportError(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
      } finally {
        setExportLoading(false);
      }
      return;
    }

    // ── Issuer mode ──────────────────────────────────────────────────────────
    if (selectedIssuer) {
      setExportLoading(true);
      setExportError('');
      setExportMessage(null);
      setExportProgress('');
      try {
        const result = await exportIssuerBenposZip(
          selectedIssuer, exportDate, msg => setExportProgress(msg)
        );
        if (result.downloadedCount === 0) {
          setExportError(`No BenPos data found for this issuer on ${exportDate}.`);
        } else {
          let msg = `✓ Downloaded ${result.downloadedCount} file${result.downloadedCount !== 1 ? 's' : ''}.`;
          if (result.skippedIsins.length > 0) {
            const shown = result.skippedIsins.slice(0, 3);
            const rest = result.skippedIsins.length - shown.length;
            msg += ` No data on this date for: ${shown.join(', ')}${rest > 0 ? ` (${rest} more)` : ''}.`;
          }
          if (result.missingCategoryCount > 0)
            msg += ` ${result.missingCategoryCount.toLocaleString()} row${result.missingCategoryCount !== 1 ? 's' : ''} had no category mapping.`;
          setExportMessage(msg);
        }
      } catch (err) {
        console.error('[benposExport] failed:', err.stack);
        setExportError(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
      } finally {
        setExportLoading(false);
      }
      return;
    }

    // ── Per-ISIN mode ────────────────────────────────────────────────────────
    // Flush any ISIN typed but not yet committed via Enter/comma.
    const pending = isinInput.trim().replace(/,/g, '');
    const effectiveIsins = pending && !selectedIsins.includes(pending)
      ? [...selectedIsins, pending]
      : selectedIsins;
    if (pending) { setSelectedIsins(effectiveIsins); setIsinInput(''); }
    if (effectiveIsins.length === 0) return;

    setExportLoading(true);
    setExportError('');
    setExportMessage(null);
    try {
      const { count, missingCategoryCount } = await exportBenpos(effectiveIsins, exportDate);
      let successMsg = `✓ Export complete — ${count.toLocaleString()} rows downloaded.`;
      if (missingCategoryCount > 0)
        successMsg += ` ${missingCategoryCount.toLocaleString()} row${missingCategoryCount !== 1 ? 's' : ''} had no category mapping.`;
      setExportMessage(successMsg);
    } catch (err) {
      console.error('[benposExport] failed:', err.stack);
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

  const hasMode = allIsin || !!selectedIssuer || selectedIsins.length > 0;

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
            {/* ── All ISIN ── */}
            <div className="benpos-field">
              <label className="benpos-label">All ISIN</label>
              <label className="benpos-all-isin-box">
                <input
                  type="checkbox"
                  checked={allIsin}
                  onChange={e => {
                    setAllIsin(e.target.checked);
                    if (e.target.checked) {
                      setSelectedIssuer(null);
                      setIssuerQuery('');
                      setIssuerSuggestions([]);
                    }
                  }}
                />
                Export all ISINs
              </label>
            </div>

            {/* ── Issuer ── */}
            <div className={`benpos-field benpos-issuer-field${allIsin ? ' benpos-issuer-field--disabled' : ''}`}>
              <label className="benpos-label">Issuer</label>
              {selectedIssuer ? (
                <div className="benpos-issuer-selected">
                  <span title={`${selectedIssuer.issuerName || ''} (${selectedIssuer.issuerCode})`}>
                    {selectedIssuer.issuerName || selectedIssuer.issuerCode}
                  </span>
                  <button
                    type="button"
                    className="benpos-issuer-clear"
                    onClick={() => { setSelectedIssuer(null); setIssuerQuery(''); }}
                  >×</button>
                </div>
              ) : (
                <div className="benpos-issuer-wrap">
                  <input
                    className="benpos-issuer-input"
                    type="text"
                    placeholder="Search issuer…"
                    value={issuerQuery}
                    disabled={allIsin}
                    onChange={e => { setIssuerQuery(e.target.value); setShowIssuerDropdown(true); }}
                    onFocus={() => issuerSuggestions.length > 0 && setShowIssuerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowIssuerDropdown(false), 150)}
                  />
                  {issuerLoading && <span className="benpos-issuer-spinner">…</span>}
                  {showIssuerDropdown && issuerSuggestions.length > 0 && (
                    <ul className="benpos-issuer-dropdown">
                      {issuerSuggestions.map(item => (
                        <li
                          key={item.issuerCode}
                          className="benpos-issuer-option"
                          onMouseDown={e => {
                            e.preventDefault();
                            setSelectedIssuer(item);
                            setIssuerQuery('');
                            setIssuerSuggestions([]);
                            setShowIssuerDropdown(false);
                            setAllIsin(false);
                            setSelectedIsins([]);
                            setIsinInput('');
                          }}
                        >
                          <span className="benpos-issuer-option-name">{item.issuerName || '—'}</span>
                          <span className="benpos-issuer-option-code">{item.issuerCode}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="benpos-filter-row">
            <div className="benpos-field benpos-field--isin">
              <label className="benpos-label">ISIN</label>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className={`benpos-isin-wrap${(allIsin || !!selectedIssuer) ? ' benpos-isin-wrap--disabled' : ''}`}
                onClick={() => !(allIsin || selectedIssuer) && document.getElementById('benpos-isin-input').focus()}
              >
                {selectedIsins.map(isin => (
                  <span key={isin} className="benpos-isin-tag">
                    {isin}
                    <button
                      className="benpos-isin-tag-remove"
                      type="button"
                      onClick={() => removeIsin(isin)}
                      disabled={allIsin || !!selectedIssuer}
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
                  disabled={allIsin || !!selectedIssuer}
                />
              </div>
            </div>
          </div>

          <div className="benpos-filter-row benpos-filter-row--actions">
            <div className="benpos-field benpos-field--date">
              <label className="benpos-label">Date</label>
              {datesFallback ? (
                <>
                  <input
                    type="date"
                    className="benpos-date-input"
                    value={exportDate}
                    onChange={e => setExportDate(e.target.value)}
                  />
                  <span className="benpos-date-note benpos-date-note--error">{datesError}</span>
                </>
              ) : !hasMode ? (
                <select className="benpos-select" disabled>
                  <option>Select an ISIN or Issuer first</option>
                </select>
              ) : datesLoading ? (
                <select className="benpos-select" disabled>
                  <option>Loading…</option>
                </select>
              ) : availableDates.length === 0 ? (
                <select className="benpos-select" disabled>
                  <option>No BenPos data for this selection</option>
                </select>
              ) : (
                <select
                  className="benpos-select"
                  value={exportDate}
                  onChange={e => setExportDate(e.target.value)}
                >
                  <option value="">— Select date —</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>{fmtDate(d)}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              className="btn-action btn-action--pink benpos-download-btn"
              onClick={handleDownload}
              disabled={exportLoading || datesLoading || (!allIsin && !selectedIssuer && selectedIsins.length === 0 && !isinInput.trim()) || !exportDate}
            >
              {exportLoading ? '⏳ Exporting…' : '↓ EXPORT'}
            </button>
          </div>

          {exportLoading && (allIsin || !!selectedIssuer) && (
            <div className="im-banner im-banner--info">
              ⏳ {exportProgress || (allIsin
                ? 'Exporting all ISINs — this may take a while…'
                : `Exporting ${selectedIssuer.issuerName || 'issuer'} data — this may take a while…`)}
            </div>
          )}
          {exportError && (
            <div className="im-banner im-banner--error">⚠ {exportError}</div>
          )}
          {exportMessage && !exportError && (
            <div className="im-banner im-banner--success">{exportMessage}</div>
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
