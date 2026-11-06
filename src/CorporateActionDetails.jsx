import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import { hasPermission } from './auth';
import {
  getCa,
  updateCa,
  updateNsdlCa,
  acceptCa,
  exportCa,
  downloadTemplate,
  downloadDnrTemplate,
  downloadNsdlTemplate,
  downloadNsdlDnrTemplate,
  getNsdlCodes,
  triggerDownload,
} from './services/corporateActionService';

const DETAIL_PAGE_SIZE = 20;
const DNR_PAGE_SIZE    = 20;

function fmtDate(iso) {
  if (!iso) return '—';
  const s = typeof iso === 'string' ? iso : new Date(iso).toISOString();
  if (s.length < 10) return s;
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
}

function isoToInputDate(iso) {
  if (!iso) return '';
  const s = typeof iso === 'string' ? iso : new Date(iso).toISOString();
  return s.slice(0, 10);
}

function fmtQty(n) {
  if (n == null) return '—';
  return Number(n).toFixed(3);
}

function fmtPrice(n) {
  if (n == null) return '—';
  return Number(n).toFixed(6);
}

function fmtAmount(n) {
  if (n == null) return '—';
  return Number(n).toFixed(2);
}

function fmtLockinReason(code, reason) {
  if (!code) return '—';
  return reason ? `${code} - ${reason}` : code;
}

function fmtRowError(e) {
  const parts = [];
  if (e.sheet) parts.push(`${e.sheet} sheet`);
  if (e.row != null) parts.push(`Row ${e.row}`);
  const prefix = parts.join(', ');
  const detail = e.column ? `${e.column}: ${e.message}` : e.message;
  return prefix ? `${prefix} — ${detail}` : detail;
}

function StatusBadge({ status }) {
  const cls = status === 'ACCEPTED' ? 'ca-status-badge ca-status-badge--accepted'
            : status === 'PENDING'  ? 'ca-status-badge ca-status-badge--pending'
            : 'ca-status-badge';
  const label = status === 'PENDING' ? 'Pending' : status === 'ACCEPTED' ? 'Accepted' : (status ?? '—');
  return <span className={cls}>{label}</span>;
}

function SummaryField({ label, value }) {
  return (
    <div className="ca-summary-field">
      <span className="ca-summary-label">{label}</span>
      <span className="ca-summary-value">{value ?? '—'}</span>
    </div>
  );
}

function CorporateActionDetails() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const canUpdate = hasPermission('corporate_action:update');
  const canAccept = hasPermission('corporate_action:accept');

  // ── Page load state ────────────────────────────────────────────────────────
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [header,      setHeader]      = useState(null);
  const [details,     setDetails]     = useState([]);
  const [dnrRows,     setDnrRows]     = useState([]);

  // ── CDSL edit fields ───────────────────────────────────────────────────────
  const [caSeqNo,     setCaSeqNo]     = useState('');

  // ── File fields (shared CDSL / NSDL re-upload) ────────────────────────────
  const [fileName,    setFileName]    = useState('');
  const [fileObj,     setFileObj]     = useState(null);
  const [dnrFileName, setDnrFileName] = useState('');
  const [dnrFileObj,  setDnrFileObj]  = useState(null);

  // ── NSDL edit fields ───────────────────────────────────────────────────────
  const [nsdlCodes,        setNsdlCodes]        = useState(null);
  const [nCaTypeCode,      setNCaTypeCode]      = useState('');
  const [nCaSubType,       setNCaSubType]       = useState('');
  const [nIndicator,       setNIndicator]       = useState('D');
  const [nStampDutyPay,    setNStampDutyPay]    = useState('N');
  const [nStampDutyBasis,  setNStampDutyBasis]  = useState('00');
  const [nEbpName,         setNEbpName]         = useState('00');
  const [nFundsCollected,  setNFundsCollected]  = useState('00');
  const [nAllotmentDate,   setNAllotmentDate]   = useState('');
  const [nExecutionDate,   setNExecutionDate]   = useState('');
  const [nRtaRefNo,        setNRtaRefNo]        = useState('');

  // ── Operation states ───────────────────────────────────────────────────────
  const [saving,         setSaving]         = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const [accepting,      setAccepting]      = useState(false);
  const [saveErrors,     setSaveErrors]     = useState([]);
  const [saveErrMsg,     setSaveErrMsg]     = useState('');
  const [opMsg,          setOpMsg]          = useState('');
  const [showAcceptDlg,  setShowAcceptDlg]  = useState(false);

  // ── Inner table pagination ─────────────────────────────────────────────────
  const [detailPage, setDetailPage] = useState(1);
  const [dnrPage,    setDnrPage]    = useState(1);

  const fileInputRef  = useRef(null);
  const dnrFileRef    = useRef(null);

  async function loadRecord() {
    setPageLoading(true);
    setLoadError('');
    try {
      const data = await getCa(id);
      setHeader(data.header);
      setDetails(data.details ?? []);
      setDnrRows(data.dnrRows ?? []);
      // CDSL pre-populate
      setCaSeqNo(data.header?.caSeqNo ?? '');
      // NSDL pre-populate
      if (data.header?.depository === 'NSDL') {
        const h = data.header;
        setNCaTypeCode(h.caTypeCode ?? '');
        setNCaSubType(h.caSubType ?? '');
        setNIndicator(h.indicator ?? 'D');
        setNStampDutyPay(h.stampDutyPayable ?? 'N');
        setNStampDutyBasis(h.stampDutyBasis ?? '00');
        setNEbpName(h.ebpName ?? '00');
        setNFundsCollected(h.fundsCollected ?? '00');
        setNAllotmentDate(isoToInputDate(h.allotmentDate));
        setNExecutionDate(isoToInputDate(h.executionDate));
        setNRtaRefNo(h.rtaInternalRefNo ?? '');
        // Load NSDL option codes once
        setNsdlCodes(prev => prev || null);
        getNsdlCodes().then(d => setNsdlCodes(d)).catch(() => {});
      }
    } catch (err) {
      setLoadError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load record.');
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (id) loadRecord();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setFileObj(f);
  }

  function handleDnrFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setDnrFileName(f.name);
    setDnrFileObj(f);
  }

  async function handleDownloadTemplate() {
    try { const res = await downloadTemplate(); triggerDownload(res.data, 'ca_detail_template.xlsx'); }
    catch { alert('Failed to download template.'); }
  }

  async function handleDownloadDnrTemplate() {
    try { const res = await downloadDnrTemplate(); triggerDownload(res.data, 'ca_dnr_template.xlsx'); }
    catch { alert('Failed to download template.'); }
  }

  async function handleDownloadNsdlTemplate(mode) {
    try { const res = await downloadNsdlTemplate(mode); triggerDownload(res.data, `ca_nsdl_${mode.toLowerCase()}_template.xlsx`); }
    catch { alert('Failed to download template.'); }
  }

  async function handleDownloadNsdlDnrTemplate(mode) {
    try { const res = await downloadNsdlDnrTemplate(mode); triggerDownload(res.data, `ca_nsdl_${mode.toLowerCase()}_dnr_template.xlsx`); }
    catch { alert('Failed to download template.'); }
  }

  async function handleSave() {
    setSaveErrors([]);
    setSaveErrMsg('');
    setOpMsg('');

    setSaving(true);
    try {
      if (isCdsl) {
        const fd = new FormData();
        fd.append('caSeqNo', caSeqNo.trim());
        if (fileObj)    fd.append('file',    fileObj);
        if (dnrFileObj) fd.append('dnrFile', dnrFileObj);
        await updateCa(id, fd);
      } else {
        // NSDL
        const fd = new FormData();
        fd.append('caTypeCode',       nCaTypeCode);
        fd.append('caSubType',        nCaSubType);
        if (header.caTypeMode === 'NORMAL') fd.append('indicator', nIndicator);
        fd.append('allotmentDate',    nAllotmentDate);
        fd.append('executionDate',    nExecutionDate);
        fd.append('stampDutyPayable', nStampDutyPay);
        fd.append('stampDutyBasis',   nStampDutyBasis);
        if (header.caTypeMode === 'NORMAL') {
          fd.append('ebpName',        nEbpName);
          fd.append('fundsCollected', nFundsCollected);
        }
        if (nRtaRefNo.trim()) fd.append('rtaInternalRefNo', nRtaRefNo.trim());
        if (fileObj)    fd.append('file',    fileObj);
        if (dnrFileObj) fd.append('dnrFile', dnrFileObj);
        await updateNsdlCa(id, fd);
      }
      setFileObj(null);    setFileName('');
      setDnrFileObj(null); setDnrFileName('');
      setOpMsg('Saved successfully.');
      await loadRecord();
    } catch (err) {
      const details = err.response?.data?.error?.details;
      if (Array.isArray(details) && details.length > 0) setSaveErrors(details);
      else setSaveErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await exportCa(id);
      const cd = res.headers?.['content-disposition'] ?? '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const fallback = header?.depository === 'NSDL'
        ? `${id}.txt`
        : (header?.fileName || `${id}.ipf`);
      triggerDownload(res.data, match?.[1] || fallback);
    } catch (err) {
      alert(err.response?.data?.error?.message ?? 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  async function handleAcceptConfirm() {
    setShowAcceptDlg(false);
    setOpMsg('');
    setAccepting(true);
    try {
      await acceptCa(id);
      setOpMsg('Accepted successfully. The record is now read-only.');
      await loadRecord();
    } catch (err) {
      setSaveErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Accept failed.');
    } finally {
      setAccepting(false);
    }
  }

  // ── Detail table pagination ────────────────────────────────────────────────
  const detailTotalPages = Math.max(1, Math.ceil(details.length / DETAIL_PAGE_SIZE));
  const detailSlice = details.slice(
    (detailPage - 1) * DETAIL_PAGE_SIZE,
    detailPage * DETAIL_PAGE_SIZE
  );

  const dnrTotalPages = Math.max(1, Math.ceil(dnrRows.length / DNR_PAGE_SIZE));
  const dnrSlice = dnrRows.slice(
    (dnrPage - 1) * DNR_PAGE_SIZE,
    dnrPage * DNR_PAGE_SIZE
  );

  const isCdsl      = header?.depository === 'CDSL';
  const isNsdl      = header?.depository === 'NSDL';
  const isSim       = header?.caTypeMode === 'SIMULTANEOUS';
  const isPending   = header?.status === 'PENDING';
  const canEdit     = isPending && canUpdate;
  const canAcceptBtn = isPending && canAccept;

  // NSDL option lists
  const nCaTypeCodes    = isSim ? (nsdlCodes?.caTypeCodes?.SIMULTANEOUS ?? []) : (nsdlCodes?.caTypeCodes?.NORMAL ?? []);
  const nCaSubTypes     = nsdlCodes?.caSubTypes ?? [];
  const nStampDutyOpts  = nsdlCodes?.stampDutyBasis ?? [];
  const nEbpOpts        = nsdlCodes?.ebpNames ?? [];
  const nFundsOpts      = nsdlCodes?.fundsCollected ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="isin-master">
        <h1 className="page-heading">Details</h1>
        <div className="im-card" style={{ padding: '30px 20px', textAlign: 'center', color: '#8898aa' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="isin-master">
        <h1 className="page-heading">Details</h1>
        <div className="im-banner im-banner--error" style={{ margin: '0 0 12px' }}>⚠ {loadError}</div>
        <button className="btn-action btn-action--white" onClick={() => navigate(-1)}>← Back</button>
      </div>
    );
  }

  return (
    <div className="isin-master">
      <h1 className="page-heading">Details</h1>

      <div className="im-card">
        {/* Blue gradient header with download links */}
        <div className="im-card-header">
          <span>Corporate Action Details</span>
          <div className="ca-dl-links">
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlTemplate('NORMAL')}>↓ NSDL</span>
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlDnrTemplate('NORMAL')}>↓ DNR</span>
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlTemplate('SIMULTANEOUS')}>↓ NSDL (Simultaneous)</span>
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlDnrTemplate('SIMULTANEOUS')}>↓ DNR (Simultaneous)</span>
            <span className="ca-dl-link" onClick={handleDownloadTemplate}>↓ CDSL</span>
            <span className="ca-dl-link" onClick={handleDownloadDnrTemplate}>↓ CDSL DNR</span>
          </div>
        </div>

        {/* Operation messages */}
        {opMsg && (
          <div className="im-banner im-banner--success" style={{ margin: '10px 20px 0' }}>✓ {opMsg}</div>
        )}
        {saveErrMsg && (
          <div className="im-banner im-banner--error" style={{ margin: '10px 20px 0' }}>⚠ {saveErrMsg}</div>
        )}
        {saveErrors.length > 0 && (
          <div className="ca-row-errors-box">
            <div className="ca-row-errors-heading">Validation errors ({saveErrors.length}):</div>
            <ul className="ca-row-error-list">
              {saveErrors.map((e, i) => (
                <li key={i} className="ca-row-error-item">{fmtRowError(e)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Read-only summary ── */}
        <div className="ca-summary-grid">
          <SummaryField label="Company"           value={header?.companyName} />
          <SummaryField label="ISIN"              value={header?.isin} />
          <SummaryField label="Depository"        value={header?.depository} />
          <SummaryField label="Status"            value={<StatusBadge status={header?.status} />} />
          {isCdsl && <SummaryField label="CA Seq No"   value={header?.caSeqNo} />}
          {isCdsl && <SummaryField label="Serial No"   value={header?.serialNo} />}
          {isCdsl && <SummaryField label="File Name"   value={header?.fileName} />}
          {isNsdl && header?.caTypeMode && (
            <SummaryField label="CA Type" value={header.caTypeMode.charAt(0) + header.caTypeMode.slice(1).toLowerCase()} />
          )}
          {isNsdl && header?.caTypeCode && <SummaryField label="CA Type Code"  value={header.caTypeCode} />}
          {isNsdl && header?.caSubType   && <SummaryField label="CA Sub Type"   value={header.caSubType} />}
          {isNsdl && header?.caTypeMode === 'NORMAL' && header?.indicator && (
            <SummaryField label="Indicator" value={header.indicator} />
          )}
          {isNsdl && header?.caTypeMode === 'SIMULTANEOUS' && header?.debitIsin && (
            <SummaryField label="Debit ISIN" value={header.debitIsin} />
          )}
          {isNsdl && header?.allotmentDate && (
            <SummaryField label="Allotment Date" value={fmtDate(header.allotmentDate)} />
          )}
          {isNsdl && header?.executionDate && (
            <SummaryField label="Execution Date" value={fmtDate(header.executionDate)} />
          )}
          {isNsdl && header?.stampDutyPayable && (
            <SummaryField label="Stamp Duty Payable" value={header.stampDutyPayable} />
          )}
          {isNsdl && header?.stampDutyBasis != null && (
            <SummaryField label="Stamp Duty Basis" value={header.stampDutyBasis} />
          )}
          {isNsdl && header?.caTypeMode === 'NORMAL' && header?.ebpName != null && (
            <SummaryField label="EBP Name" value={header.ebpName} />
          )}
          {isNsdl && header?.caTypeMode === 'NORMAL' && header?.fundsCollected != null && (
            <SummaryField label="Funds Collected" value={header.fundsCollected} />
          )}
          {isNsdl && header?.rtaInternalRefNo && (
            <SummaryField label="RTA Internal Ref No" value={header.rtaInternalRefNo} />
          )}
          <SummaryField label="Total Records"     value={header?.totalRecords} />
          <SummaryField label="Total Current Qty" value={fmtQty(header?.totalCurrentQty)} />
          {isCdsl && <SummaryField label="Total Freeze Qty"  value={fmtQty(header?.totalFreezeQty)} />}
          <SummaryField label="Total Lock-in Qty" value={fmtQty(header?.totalLockinQty)} />
          <SummaryField label="Has DNR"           value={header?.hasDnr ? 'Yes' : 'No'} />
          <SummaryField label="Created By"        value={header?.createdByName} />
          <SummaryField label="Created On"        value={fmtDate(header?.createdAt)} />
          {header?.acceptedByName && <SummaryField label="Accepted By" value={header.acceptedByName} />}
          {header?.acceptedAt     && <SummaryField label="Accepted On" value={fmtDate(header.acceptedAt)} />}
        </div>

        {/* ── Editable section ── */}
        {canEdit && (
          <>
            <div className="ca-section-heading" style={{ borderTop: '1px solid #e9ecef', marginTop: 4 }}>
              Edit
            </div>
            <div className="ca-form-grid" style={{ paddingTop: 16 }}>

              {isCdsl && (
                <>
                  {/* CA Seq No */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">CA Seq No</label>
                    <input
                      type="text"
                      className="benpos-date-input"
                      value={caSeqNo}
                      maxLength={6}
                      onChange={e => setCaSeqNo(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                    <span className="ca-hint">Optional — digits only, max 6.</span>
                  </div>
                  <div className="benpos-field ca-field-span2" />

                  {/* Re-upload File */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Re-upload File (.xlsx)</label>
                    <div className="ca-file-wrap">
                      <span className="ca-file-name">{fileName || 'No file chosen'}</span>
                      <button type="button" className="ca-browse-btn" onClick={() => fileInputRef.current?.click()}>↑ Browse</button>
                      <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
                    </div>
                    <span className="ca-hint">Replaces all existing detail rows.</span>
                  </div>

                  {/* Re-upload DNR File */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Re-upload DNR File (.xlsx)</label>
                    <div className="ca-file-wrap">
                      <span className="ca-file-name">{dnrFileName || 'No file chosen'}</span>
                      <button type="button" className="ca-browse-btn" onClick={() => dnrFileRef.current?.click()}>↑ Browse</button>
                      <input ref={dnrFileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleDnrFileChange} />
                    </div>
                    <span className="ca-hint">Replaces all existing DNR rows.</span>
                  </div>
                </>
              )}

              {isNsdl && (
                <>
                  {/* CA Type Code */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">CA Type Code</label>
                    <select className="benpos-select" value={nCaTypeCode} onChange={e => setNCaTypeCode(e.target.value)}>
                      <option value="">— select —</option>
                      {nCaTypeCodes.map(o => (
                        <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* CA Sub Type */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">CA Sub Type</label>
                    <select className="benpos-select" value={nCaSubType} onChange={e => setNCaSubType(e.target.value)}>
                      <option value="">— select —</option>
                      {nCaSubTypes.map(o => (
                        <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Indicator — Normal only */}
                  {!isSim && (
                    <div className="benpos-field ca-field-span2">
                      <label className="benpos-label">Indicator</label>
                      <select className="benpos-select" value={nIndicator} onChange={e => setNIndicator(e.target.value)}>
                        <option value="D">D — Debit</option>
                        <option value="C">C — Credit</option>
                      </select>
                    </div>
                  )}

                  {/* Stamp Duty Payable */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Stamp Duty Payable</label>
                    <select className="benpos-select" value={nStampDutyPay} onChange={e => setNStampDutyPay(e.target.value)}>
                      <option value="Y">Y — Yes</option>
                      <option value="N">N — No</option>
                    </select>
                  </div>

                  {/* Stamp Duty Basis */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Stamp Duty Basis</label>
                    <select className="benpos-select" value={nStampDutyBasis} onChange={e => setNStampDutyBasis(e.target.value)}>
                      {nStampDutyOpts.map(o => (
                        <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* EBP Name — Normal only */}
                  {!isSim && (
                    <div className="benpos-field ca-field-span2">
                      <label className="benpos-label">EBP Name</label>
                      <select className="benpos-select" value={nEbpName} onChange={e => setNEbpName(e.target.value)}>
                        {nEbpOpts.map(o => (
                          <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Funds Collected — Normal only */}
                  {!isSim && (
                    <div className="benpos-field ca-field-span2">
                      <label className="benpos-label">Funds Collected</label>
                      <select className="benpos-select" value={nFundsCollected} onChange={e => setNFundsCollected(e.target.value)}>
                        {nFundsOpts.map(o => (
                          <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Allotment Date */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Allotment Date</label>
                    <input
                      type="date"
                      className="benpos-date-input"
                      value={nAllotmentDate}
                      onChange={e => setNAllotmentDate(e.target.value)}
                    />
                  </div>

                  {/* Execution Date */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Execution Date</label>
                    <input
                      type="date"
                      className="benpos-date-input"
                      value={nExecutionDate}
                      onChange={e => setNExecutionDate(e.target.value)}
                    />
                  </div>

                  {/* RTA Internal Ref No */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">RTA Internal Ref No</label>
                    <input
                      type="text"
                      className="benpos-date-input"
                      value={nRtaRefNo}
                      maxLength={16}
                      onChange={e => setNRtaRefNo(e.target.value)}
                    />
                    <span className="ca-hint">Optional — leave blank to keep existing.</span>
                  </div>

                  <div className="benpos-field ca-field-span2" />

                  {/* Re-upload File */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Re-upload File (.xlsx)</label>
                    <div className="ca-file-wrap">
                      <span className="ca-file-name">{fileName || 'No file chosen'}</span>
                      <button type="button" className="ca-browse-btn" onClick={() => fileInputRef.current?.click()}>↑ Browse</button>
                      <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
                    </div>
                    <span className="ca-hint">Replaces all existing detail rows.</span>
                  </div>

                  {/* Re-upload DNR File */}
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">Re-upload DNR File (.xlsx)</label>
                    <div className="ca-file-wrap">
                      <span className="ca-file-name">{dnrFileName || 'No file chosen'}</span>
                      <button type="button" className="ca-browse-btn" onClick={() => dnrFileRef.current?.click()}>↑ Browse</button>
                      <input ref={dnrFileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleDnrFileChange} />
                    </div>
                    <span className="ca-hint">Replaces all existing DNR rows.</span>
                  </div>
                </>
              )}

            </div>
          </>
        )}

        {/* ── Action buttons ── */}
        <div className="ca-form-footer">
          {canEdit && (
            <button
              className="btn-action btn-action--pink"
              onClick={handleSave}
              disabled={saving}
              style={{ borderRadius: 5, padding: '11px 30px', fontSize: 12.5 }}
            >
              {saving ? 'Saving…' : 'SAVE'}
            </button>
          )}
          <button
            className="btn-action"
            onClick={handleExport}
            disabled={exporting}
            style={{ borderRadius: 5, padding: '11px 30px', fontSize: 12.5, background: '#2e86e0', color: '#fff' }}
          >
            {exporting ? 'Exporting…' : isNsdl ? 'EXPORT (.txt)' : 'EXPORT (.ipf)'}
          </button>
          {canAcceptBtn && (
            <button
              className="btn-action"
              onClick={() => setShowAcceptDlg(true)}
              disabled={accepting}
              style={{ borderRadius: 5, padding: '11px 30px', fontSize: 12.5, background: '#2e7d32', color: '#fff' }}
            >
              {accepting ? 'Accepting…' : 'ACCEPT'}
            </button>
          )}
        </div>
      </div>

      {/* ── Detail records table ── */}
      {details.length > 0 && (
        <div className="im-card" style={{ marginTop: 16 }}>
          <div className="ca-section-heading">Detail Records ({details.length})</div>
          <div className="im-table-wrapper">

            {/* CDSL detail table */}
            {isCdsl && (
              <table className="im-table" style={{ minWidth: 2800 }}>
                <thead>
                  <tr>
                    <th style={{ width: 55  }}>ROW #</th>
                    <th style={{ width: 140 }}>BO ID</th>
                    <th style={{ width: 110 }}>RTA INT REF</th>
                    <th style={{ width: 130 }}>DR ISIN</th>
                    <th style={{ width: 120 }}>DR CURRENT QTY</th>
                    <th style={{ width: 120 }}>DR FROZEN QTY</th>
                    <th style={{ width: 120 }}>DR LOCK-IN QTY</th>
                    <th style={{ width: 200 }}>DR LOCK-IN REASON</th>
                    <th style={{ width: 130 }}>DR LOCK-IN EXPIRY</th>
                    <th style={{ width: 100 }}>DR D/C FLAG</th>
                    <th style={{ width: 130 }}>CR BENEFIT ISIN</th>
                    <th style={{ width: 120 }}>CR CURRENT QTY</th>
                    <th style={{ width: 120 }}>CR FROZEN QTY</th>
                    <th style={{ width: 120 }}>CR LOCK-IN QTY</th>
                    <th style={{ width: 200 }}>CR LOCK-IN REASON</th>
                    <th style={{ width: 130 }}>CR LOCK-IN EXPIRY</th>
                    <th style={{ width: 100 }}>CR D/C FLAG</th>
                    <th style={{ width: 120 }}>OFFER PRICE</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map(row => (
                    <tr key={row.id ?? row.rowNo}>
                      <td>{row.rowNo}</td>
                      <td>{row.boId}</td>
                      <td>{row.rtaIntRefNo || '—'}</td>
                      <td>{row.drIsin}</td>
                      <td>{fmtQty(row.drCurrentQty)}</td>
                      <td>{fmtQty(row.drFrozenQty)}</td>
                      <td>{fmtQty(row.drLockinQty)}</td>
                      <td>{fmtLockinReason(row.drLockinReasonCode, row.drLockinReason)}</td>
                      <td>{fmtDate(row.drLockinExpiryDate)}</td>
                      <td>{row.drDebitCreditFlag || '—'}</td>
                      <td>{row.crBenefitIsin}</td>
                      <td>{fmtQty(row.crCurrentQty)}</td>
                      <td>{fmtQty(row.crFrozenQty)}</td>
                      <td>{fmtQty(row.crLockinQty)}</td>
                      <td>{fmtLockinReason(row.crLockinReasonCode, row.crLockinReason)}</td>
                      <td>{fmtDate(row.crLockinExpiryDate)}</td>
                      <td>{row.crDebitCreditFlag || '—'}</td>
                      <td>{row.offerPrice != null ? fmtQty(row.offerPrice) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* NSDL Normal detail table */}
            {isNsdl && !isSim && (
              <table className="im-table" style={{ minWidth: 1500 }}>
                <thead>
                  <tr>
                    <th style={{ width: 55  }}>ROW #</th>
                    <th style={{ width: 120 }}>DP ID</th>
                    <th style={{ width: 120 }}>CLIENT ID</th>
                    <th style={{ width: 110 }}>ACCT CAT</th>
                    <th style={{ width: 130 }}>ALLOTMENT QTY</th>
                    <th style={{ width: 160 }}>LOCKIN REASON</th>
                    <th style={{ width: 130 }}>LOCKIN RELEASE</th>
                    <th style={{ width: 120 }}>ISSUE PRICE</th>
                    <th style={{ width: 130 }}>ISSUED AMOUNT</th>
                    <th style={{ width: 120 }}>PAIDUP PRICE</th>
                    <th style={{ width: 130 }}>PAIDUP AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map(row => (
                    <tr key={row.id ?? row.rowNo}>
                      <td>{row.rowNo}</td>
                      <td>{row.dpId || '—'}</td>
                      <td>{row.clientId || '—'}</td>
                      <td>{row.clientAccountCategory || '—'}</td>
                      <td>{fmtQty(row.allotmentQty)}</td>
                      <td>{row.lockinReasonCode || '—'}</td>
                      <td>{fmtDate(row.lockinReleaseDate)}</td>
                      <td>{fmtPrice(row.issuePrice)}</td>
                      <td>{fmtAmount(row.issuedAmount)}</td>
                      <td>{fmtPrice(row.paidupPrice)}</td>
                      <td>{fmtAmount(row.paidupAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* NSDL Simultaneous detail table */}
            {isNsdl && isSim && (
              <table className="im-table" style={{ minWidth: 2400 }}>
                <thead>
                  <tr>
                    <th style={{ width: 55  }}>ROW #</th>
                    <th style={{ width: 120 }}>CR DP ID</th>
                    <th style={{ width: 120 }}>CR CLIENT ID</th>
                    <th style={{ width: 110 }}>CR ACCT CAT</th>
                    <th style={{ width: 120 }}>DR DP ID</th>
                    <th style={{ width: 120 }}>DR CLIENT ID</th>
                    <th style={{ width: 110 }}>DR ACCT CAT</th>
                    <th style={{ width: 130 }}>CR ALLOTMENT QTY</th>
                    <th style={{ width: 130 }}>DR ALLOTMENT QTY</th>
                    <th style={{ width: 160 }}>CR LOCKIN REASON</th>
                    <th style={{ width: 130 }}>CR LOCKIN RELEASE</th>
                    <th style={{ width: 160 }}>DR LOCKIN REASON</th>
                    <th style={{ width: 130 }}>DR LOCKIN RELEASE</th>
                    <th style={{ width: 120 }}>ISSUE PRICE</th>
                    <th style={{ width: 130 }}>ISSUED AMOUNT</th>
                    <th style={{ width: 120 }}>PAIDUP PRICE</th>
                    <th style={{ width: 130 }}>PAIDUP AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map(row => (
                    <tr key={row.id ?? row.rowNo}>
                      <td>{row.rowNo}</td>
                      <td>{row.dpId || '—'}</td>
                      <td>{row.clientId || '—'}</td>
                      <td>{row.clientAccountCategory || '—'}</td>
                      <td>{row.debitDpId || '—'}</td>
                      <td>{row.debitClientId || '—'}</td>
                      <td>{row.debitClientAccountCategory || '—'}</td>
                      <td>{fmtQty(row.allotmentQty)}</td>
                      <td>{fmtQty(row.debitAllotmentQty)}</td>
                      <td>{row.lockinReasonCode || '—'}</td>
                      <td>{fmtDate(row.lockinReleaseDate)}</td>
                      <td>{row.debitLockinReasonCode || '—'}</td>
                      <td>{fmtDate(row.debitLockinReleaseDate)}</td>
                      <td>{fmtPrice(row.issuePrice)}</td>
                      <td>{fmtAmount(row.issuedAmount)}</td>
                      <td>{fmtPrice(row.paidupPrice)}</td>
                      <td>{fmtAmount(row.paidupAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>
          {detailTotalPages > 1 && (
            <div className="ca-mini-pagination">
              <span style={{ fontSize: 12, color: '#8898aa' }}>
                {(detailPage - 1) * DETAIL_PAGE_SIZE + 1}–{Math.min(detailPage * DETAIL_PAGE_SIZE, details.length)} of {details.length}
              </span>
              <button className="page-btn" disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)}>‹</button>
              <button className="page-btn" disabled={detailPage === detailTotalPages} onClick={() => setDetailPage(p => p + 1)}>›</button>
            </div>
          )}
        </div>
      )}

      {/* ── DNR records table ── */}
      {dnrRows.length > 0 && (
        <div className="im-card" style={{ marginTop: 16 }}>
          <div className="ca-section-heading">DNR Records ({dnrRows.length})</div>
          <div className="im-table-wrapper">

            {/* CDSL DNR table */}
            {isCdsl && (
              <table className="im-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: 55  }}>ROW #</th>
                    <th style={{ width: 130 }}>CA ISIN</th>
                    <th style={{ width: 180 }}>DN FROM</th>
                    <th style={{ width: 180 }}>DN TO</th>
                    <th style={{ width: 140 }}>DN QUANTITY</th>
                    <th style={{ width: 100 }}>D/C FLAG</th>
                  </tr>
                </thead>
                <tbody>
                  {dnrSlice.map(row => (
                    <tr key={row.id ?? row.rowNo}>
                      <td>{row.rowNo}</td>
                      <td>{row.caIsin}</td>
                      <td>{row.dnFrom}</td>
                      <td>{row.dnTo}</td>
                      <td>{row.dnQuantity}</td>
                      <td>{row.debitCreditFlag}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* NSDL Normal DNR table */}
            {isNsdl && !isSim && (
              <table className="im-table" style={{ minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ width: 55  }}>ROW #</th>
                    <th style={{ width: 180 }}>DN FROM</th>
                    <th style={{ width: 180 }}>DN TO</th>
                    <th style={{ width: 140 }}>DN QUANTITY</th>
                    <th style={{ width: 110 }}>STATUS FLAG</th>
                    <th style={{ width: 130 }}>CA TYPE CODE</th>
                  </tr>
                </thead>
                <tbody>
                  {dnrSlice.map(row => (
                    <tr key={row.id ?? row.rowNo}>
                      <td>{row.rowNo}</td>
                      <td>{row.dnFrom}</td>
                      <td>{row.dnTo}</td>
                      <td>{row.dnQuantity}</td>
                      <td>{row.dnStatusFlag || '—'}</td>
                      <td>{row.dnrCaTypeCode || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* NSDL Simultaneous DNR table */}
            {isNsdl && isSim && (
              <table className="im-table" style={{ minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th style={{ width: 55  }}>ROW #</th>
                    <th style={{ width: 130 }}>CA ISIN</th>
                    <th style={{ width: 90  }}>D/C FLAG</th>
                    <th style={{ width: 180 }}>DN FROM</th>
                    <th style={{ width: 180 }}>DN TO</th>
                    <th style={{ width: 140 }}>DN QUANTITY</th>
                    <th style={{ width: 110 }}>STATUS FLAG</th>
                    <th style={{ width: 130 }}>CA TYPE CODE</th>
                  </tr>
                </thead>
                <tbody>
                  {dnrSlice.map(row => (
                    <tr key={row.id ?? row.rowNo}>
                      <td>{row.rowNo}</td>
                      <td>{row.caIsin || '—'}</td>
                      <td>{row.debitCreditFlag || '—'}</td>
                      <td>{row.dnFrom}</td>
                      <td>{row.dnTo}</td>
                      <td>{row.dnQuantity}</td>
                      <td>{row.dnStatusFlag || '—'}</td>
                      <td>{row.dnrCaTypeCode || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>
          {dnrTotalPages > 1 && (
            <div className="ca-mini-pagination">
              <span style={{ fontSize: 12, color: '#8898aa' }}>
                {(dnrPage - 1) * DNR_PAGE_SIZE + 1}–{Math.min(dnrPage * DNR_PAGE_SIZE, dnrRows.length)} of {dnrRows.length}
              </span>
              <button className="page-btn" disabled={dnrPage === 1} onClick={() => setDnrPage(p => p - 1)}>‹</button>
              <button className="page-btn" disabled={dnrPage === dnrTotalPages} onClick={() => setDnrPage(p => p + 1)}>›</button>
            </div>
          )}
        </div>
      )}

      {/* ── Accept confirm dialog ── */}
      {showAcceptDlg && (
        <div className="ca-accept-overlay" onClick={() => setShowAcceptDlg(false)}>
          <div className="ca-accept-box" onClick={e => e.stopPropagation()}>
            <p className="ca-accept-msg">Once accepted this cannot be edited. Continue?</p>
            <div className="ca-accept-actions">
              <button
                className="btn-action btn-action--pink"
                style={{ borderRadius: 5, padding: '9px 24px', fontSize: 12.5 }}
                onClick={handleAcceptConfirm}
              >
                Yes, Accept
              </button>
              <button
                className="btn-action btn-action--white"
                style={{ borderRadius: 5, padding: '9px 24px', fontSize: 12.5 }}
                onClick={() => setShowAcceptDlg(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CorporateActionDetails;
