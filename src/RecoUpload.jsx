import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import api from './api/axios';
import './IsinMaster.css';
import './RecoUpload.css';
import RecoUploadModal from './RecoUploadModal';
import ReconciliationModal from './ReconciliationModal';

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function fmtNum(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('en-IN');
}

function buildExportSheet(items) {
  const headers = [
    'Sr No', 'Recon Date', 'Day', 'ISIN', 'ISIN Name', 'Security Type', 'FV', 'PV',
    'Total Opening', 'Opening Physical', 'Opening NSDL', 'Opening CDSL',
    'IDT NSDL In', 'IDT CDSL In', 'IDT NSDL Out', 'IDT CDSL Out',
    'Demat NSDL', 'Demat CDSL', 'Remat NSDL', 'Remat CDSL',
    'Corp Action NSDL', 'Corp Action CDSL', 'Corp Action Physical',
    'Closing Physical', 'Closing NSDL', 'Closing CDSL', 'Total Closing',
    'Mismatch Flag', 'Status', 'Remark',
  ];
  const rows = items.map(r => [
    r.srNo, fmtDate(r.reconDate), r.dayName, r.isin, r.isinName, r.securityType, r.fv, r.pv,
    r.totalOpeningPosition, r.openingPhysicalPosition, r.openingNsdlPosition, r.openingCdslPosition,
    r.idtNsdlIn, r.idtCdslIn, r.idtNsdlOut, r.idtCdslOut,
    r.dematNsdl, r.dematCdsl, r.rematNsdl, r.rematCdsl,
    r.corporateActionNsdl, r.corporateActionCdsl, r.corporateActionPhysical,
    r.closingPhysicalPosition, r.closingNsdlPosition, r.closingCdslPosition, r.totalClosingPosition,
    r.mismatchFlag, r.reconciliationStatus, r.remark,
  ]);
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function buildErrorSheet(errors) {
  const headers = [
    'ISIN', 'ISIN Name', 'Recon Date', 'Case',
    'Total Holding', 'Closing NSDL', 'Closing CDSL', 'Physical Qty',
    'Computed', 'Difference', 'Reason',
  ];
  const caseLabel = v =>
    v === 'PHYSICAL_PRESENT' ? 'Physical present'
    : v === 'NO_PHYSICAL'    ? 'No physical'
    : '';
  const rows = errors.map(r => [
    r.isin, r.isinName, fmtDate(r.reconDate), caseLabel(r.case),
    r.totalHolding, r.closingNsdl, r.closingCdsl, r.physicalQty,
    r.computed, r.difference, r.reason,
  ]);
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

// ── Upload result card ────────────────────────────────────────────────────────

function RecoResultCard({ data }) {
  const idt = data.idt ?? {};
  return (
    <div className="im-card reco-result-card">
      <div className="im-card-header">
        <span>Upload Result — {data.reconDate}</span>
      </div>

      {data.laterDatesExist && (
        <div className="reco-result-warning">
          Later dates already exist; their opening positions were not recalculated.
        </div>
      )}

      <div className="reco-result-grid">
        {[
          { label: 'Created',                      value: data.created },
          { label: 'Replaced',                     value: data.replaced },
          { label: 'Skipped (not in ISIN Master)', value: data.skippedNotInIsinMaster },
          { label: 'Without Previous Closing',     value: data.withoutPreviousClosing },
          { label: 'Without Total Issued',         value: data.withoutTotalIssued },
          { label: 'Negative Physical',            value: data.negativePhysical },
          { label: 'IDT Files',                    value: idt.files },
          { label: 'IDT Total Qty',                value: idt.totalQty },
        ].map(item => (
          <div className="reco-result-item" key={item.label}>
            <span className="reco-result-label">{item.label}</span>
            <span className="reco-result-value">{fmtNum(item.value)}</span>
          </div>
        ))}
      </div>

      {data.skippedNotInIsinMaster > 0 && data.skippedIsins?.length > 0 && (
        <div className="reco-result-section">
          <p className="reco-result-section-title">Skipped ISINs (not in ISIN Master)</p>
          <div className="reco-result-isins">
            {data.skippedIsins.map(isin => (
              <span key={isin} className="reco-result-isin-tag">{isin}</span>
            ))}
          </div>
        </div>
      )}

      {idt.ignoredFiles?.length > 0 && (
        <div className="reco-result-section">
          <p className="reco-result-section-title">IDT Ignored Files</p>
          <div className="im-table-wrapper">
            <table className="im-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Delivery Depo</th>
                  <th>Receipt Depo</th>
                </tr>
              </thead>
              <tbody>
                {idt.ignoredFiles.map((f, i) => (
                  <tr key={i}>
                    <td>{f.name}</td>
                    <td>{f.deliveryDepo}</td>
                    <td>{f.receiptDepo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RecoUpload page ───────────────────────────────────────────────────────────

function RecoUpload() {
  // Dates (shared between the date-picker popup and the inline section)
  const [dates,        setDates]        = useState([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [datesError,   setDatesError]   = useState(null);

  // Modal / popup visibility
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload result card
  const [uploadResult, setUploadResult] = useState(null);

  // Selected date and its summary row
  const [selectedDate,    setSelectedDate]    = useState(null);
  const [selectedDateRow, setSelectedDateRow] = useState(null);

  // Processing
  const [processing,    setProcessing]    = useState(false);
  const [processError,  setProcessError]  = useState(null);
  const [processResult, setProcessResult] = useState(null);

  // Export
  const [exportingAll,      setExportingAll]      = useState(false);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [exportingErrors,   setExportingErrors]   = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  const anyBusy = processing || exportingAll || exportingSelected || exportingErrors;

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const extractMsg = (err) =>
    err.response?.data?.error?.message ||
    err.response?.data?.message ||
    err.message;

  // Fetch dates and, if a date is already selected, refresh its summary row.
  const refreshDates = useCallback(async (currentSelectedDate) => {
    setLoadingDates(true);
    setDatesError(null);
    try {
      const res = await api.get('/admin/v1/reconciliations/dates');
      const fresh = res.data.data;
      setDates(fresh);
      if (currentSelectedDate) {
        const row = fresh.find(r => r.reconDate === currentSelectedDate);
        if (row) setSelectedDateRow(row);
      }
    } catch (err) {
      setDatesError(extractMsg(err));
    } finally {
      setLoadingDates(false);
    }
  }, []);

  useEffect(() => { refreshDates(null); }, [refreshDates]);

  // Called when the user picks a date from the popup — closes it immediately.
  function handleDateSelect(date, row) {
    setSelectedDate(date);
    setSelectedDateRow(row);
    setProcessResult(null);
    setProcessError(null);
    setShowDatePicker(false);
  }

  async function handleProcess() {
    if (!selectedDate || anyBusy) return;
    setProcessing(true);
    setProcessError(null);
    setProcessResult(null);
    try {
      const res = await api.post(
        '/admin/v1/reconciliations/process',
        { reconDate: selectedDate },
        { timeout: 300000 },
      );
      setProcessResult(res.data.data);
      await refreshDates(selectedDate);
    } catch (err) {
      setProcessError(extractMsg(err));
    } finally {
      setProcessing(false);
    }
  }

  async function handleUploadSuccess(data) {
    setShowUploadModal(false);
    setUploadResult(data);
    await refreshDates(selectedDate);
  }

  async function handleExportAll() {
    if (anyBusy) return;
    setExportingAll(true);
    try {
      const res = await api.get('/admin/v1/reconciliations/export', { timeout: 120000 });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildExportSheet(res.data.data.items), 'Reconciled');
      XLSX.writeFile(wb, 'reconciliation_export_all.xlsx');
    } catch (err) {
      showToast(extractMsg(err));
    } finally {
      setExportingAll(false);
    }
  }

  async function handleExportSelected() {
    if (!selectedDate || anyBusy) return;
    setExportingSelected(true);
    try {
      const res = await api.get('/admin/v1/reconciliations/export', {
        params: { reconDate: selectedDate },
        timeout: 120000,
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildExportSheet(res.data.data.items), 'Reconciled');
      XLSX.writeFile(wb, `reconciliation_export_${selectedDate}.xlsx`);
    } catch (err) {
      showToast(extractMsg(err));
    } finally {
      setExportingSelected(false);
    }
  }

  async function handleExportErrors() {
    if (!selectedDate || anyBusy) return;
    setExportingErrors(true);
    try {
      const res = await api.get('/admin/v1/reconciliations/errors', {
        params: { reconDate: selectedDate },
        timeout: 120000,
      });
      const errors = res.data.data.errors;
      if (errors.length === 0) {
        showToast('No errors found for the selected date.');
        return;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildErrorSheet(errors), 'Errors');
      XLSX.writeFile(wb, `reconciliation_errors_${selectedDate}.xlsx`);
    } catch (err) {
      showToast(extractMsg(err));
    } finally {
      setExportingErrors(false);
    }
  }

  return (
    <div className="isin-master">
      <h1 className="page-heading">Reconciliation</h1>

      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Reconciliation Upload</span>
          <div className="reco-header-actions">
            <button className="btn-upload" onClick={() => setShowDatePicker(true)}>
              RECONCILIATION
            </button>
            <button className="btn-upload" onClick={() => setShowUploadModal(true)}>
              &#8679;&nbsp;UPLOAD
            </button>
          </div>
        </div>
      </div>

      {/* ── Upload result ────────────────────────────────────────────────────── */}
      {uploadResult && <RecoResultCard data={uploadResult} />}

      {/* ── Inline reconciliation section (shown once a date is selected) ───── */}
      {selectedDate && (
        <div className="im-card" style={{ marginTop: 16 }}>
          <div className="im-card-header">
            <span>Reconciliation — {fmtDate(selectedDate)}</span>
            <button
              className="btn-action btn-action--white"
              onClick={() => setShowDatePicker(true)}
            >
              CHANGE DATE
            </button>
          </div>

          {/* Date summary */}
          <div className="reco-check-summary">
            <div className="reco-check-summary-item">
              <span className="reco-check-summary-label">Total ISINs</span>
              <span className="reco-check-summary-value">
                {selectedDateRow?.total ?? '—'}
              </span>
            </div>
            <div className="reco-check-summary-item">
              <span className="reco-check-summary-label">Reconciled</span>
              <span
                className="reco-check-summary-value"
                style={{ color: (selectedDateRow?.reconciled ?? 0) > 0 ? '#2e7d32' : undefined }}
              >
                {selectedDateRow?.reconciled ?? '—'}
              </span>
            </div>
            <div className="reco-check-summary-item">
              <span className="reco-check-summary-label">Pending</span>
              <span
                className="reco-check-summary-value"
                style={{ color: (selectedDateRow?.pending ?? 0) > 0 ? '#c62828' : undefined }}
              >
                {selectedDateRow?.pending ?? '—'}
              </span>
            </div>
          </div>

          {/* Processing spinner / error */}
          {processing && (
            <div className="reco-uploading-msg">
              <span className="reco-spinner" /> Processing {fmtDate(selectedDate)}…
            </div>
          )}
          {!processing && processError && (
            <div className="reco-upload-error">{processError}</div>
          )}

          {/* Result grid — only after a successful Processing run */}
          {processResult && (
            <>
              <div style={{ borderTop: '1px solid #e8ecf0', padding: '10px 20px 0' }}>
                <p className="reco-result-section-title">
                  Result — {fmtDate(processResult.reconDate)}
                </p>
              </div>
              {processResult.failed > 0 && (
                <div className="reco-result-warning">
                  {processResult.failed} ISIN{processResult.failed !== 1 ? 's' : ''} failed the
                  reconciliation check. Download the error report for details.
                </div>
              )}
              <div className="reco-result-grid">
                {[
                  { label: 'Checked',           value: processResult.checked },
                  { label: 'Reconciled',         value: processResult.reconciled },
                  { label: 'Failed',             value: processResult.failed },
                  { label: 'Already Reconciled', value: processResult.alreadyReconciled },
                  { label: 'Physical Present',   value: processResult.caseBreakdown?.physicalPresent ?? 0 },
                  { label: 'No Physical',        value: processResult.caseBreakdown?.noPhysical ?? 0 },
                ].map(item => (
                  <div className="reco-result-item" key={item.label}>
                    <div className="reco-result-label">{item.label}</div>
                    <div
                      className="reco-result-value"
                      style={{
                        color: item.label === 'Failed'      && item.value > 0 ? '#c62828'
                             : item.label === 'Reconciled'  && item.value > 0 ? '#2e7d32'
                             : undefined,
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Actions row */}
          <div className="reco-check-actions">
            <button className="btn-upload" onClick={handleProcess} disabled={anyBusy}>
              {processing && <span className="reco-spinner" style={{ marginRight: 6 }} />}
              PROCESSING
            </button>
            {processResult && (
              <>
                <button
                  className="btn-action btn-action--blue-outline"
                  onClick={handleExportAll}
                  disabled={anyBusy}
                >
                  {exportingAll && <span className="reco-spinner" style={{ marginRight: 6 }} />}
                  EXPORT ALL RECONCILED
                </button>
                <button
                  className="btn-action btn-action--blue-outline"
                  onClick={handleExportSelected}
                  disabled={anyBusy}
                >
                  {exportingSelected && <span className="reco-spinner" style={{ marginRight: 6 }} />}
                  EXPORT SELECTED DATE
                </button>
                {processResult.failed > 0 && (
                  <button
                    className="btn-action btn-action--blue-outline"
                    onClick={handleExportErrors}
                    disabled={anyBusy}
                  >
                    {exportingErrors && <span className="reco-spinner" style={{ marginRight: 6 }} />}
                    DOWNLOAD ERROR REPORT
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Date-picker popup ────────────────────────────────────────────────── */}
      {showDatePicker && (
        <ReconciliationModal
          dates={dates}
          loadingDates={loadingDates}
          datesError={datesError}
          onSelect={handleDateSelect}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* ── Upload modal ─────────────────────────────────────────────────────── */}
      {showUploadModal && (
        <RecoUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && <div className="reco-toast reco-toast--info">{toast}</div>}
    </div>
  );
}

export default RecoUpload;
