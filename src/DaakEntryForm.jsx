import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from './api/axios';
import {
  getDocumentTypes,
  getCouriers,
  addDocumentType,
  addCourier,
  createInward,
  updateInward,
  getInward,
  getUsersForDropdown,
} from './services/daakService';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import './DaakEntry.css';

const OTHERS = '_OTHERS';

function isAdminUser() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return (user?.role?.permissions ?? []).some(p => p.code === '*');
  } catch { return false; }
}

function DaakEntryForm() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = Boolean(id);
  const admin    = isAdminUser();

  // ── Masters ────────────────────────────────────────────────────────────────
  const [documentTypes, setDocumentTypes] = useState([]);
  const [couriers,      setCouriers]      = useState([]);
  const [users,         setUsers]         = useState([]);
  const [usersError,    setUsersError]    = useState('');
  const [department,    setDepartment]    = useState('');

  // ── Company autocomplete ───────────────────────────────────────────────────
  const [companyQuery,       setCompanyQuery]       = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showCompDrop,       setShowCompDrop]       = useState(false);
  // null | { issuerCode, issuerName } | { issuerCode: '_OTHERS', issuerName: 'Others' }
  const [selectedCompany,    setSelectedCompany]    = useState(null);
  const compWrapRef = useRef(null);

  const isOthers = selectedCompany?.issuerCode === OTHERS;

  // ── ISIN ──────────────────────────────────────────────────────────────────
  const [companyIsins, setCompanyIsins] = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(false);
  const [selectedIsin, setSelectedIsin] = useState('');
  const [freeIsin,     setFreeIsin]     = useState('');

  // ── Form fields ────────────────────────────────────────────────────────────
  const [receivedDate,    setReceivedDate]    = useState('');
  const [otherCompName,   setOtherCompName]   = useState('');
  const [senderName,      setSenderName]      = useState('');
  const [senderPhone,     setSenderPhone]     = useState('');
  const [senderEmail,     setSenderEmail]     = useState('');
  const [senderAddress,   setSenderAddress]   = useState('');
  const [description,     setDescription]     = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [itemCount,       setItemCount]       = useState('');
  const [drn,             setDrn]             = useState('');
  const [selectedCourier, setSelectedCourier] = useState('');
  const [courierAwb,      setCourierAwb]      = useState('');
  const [receivedByUser,  setReceivedByUser]  = useState('');
  const [remarks,         setRemarks]         = useState('');

  // ── Conditional DRN ───────────────────────────────────────────────────────
  const showDrn = useMemo(() => {
    if (!selectedDocType) return false;
    return documentTypes.find(d => String(d.id) === String(selectedDocType))?.requiresDrn ?? false;
  }, [selectedDocType, documentTypes]);

  const userDisplayNames = useMemo(() => {
    const counts = {};
    users.forEach(u => { const n = u.name || ''; counts[n] = (counts[n] || 0) + 1; });
    const map = {};
    users.forEach(u => {
      const name = u.name || u.email || String(u.id);
      map[u.id] = counts[u.name] > 1 ? `${name} (${u.email})` : name;
    });
    return map;
  }, [users]);

  // ── Validation / status ────────────────────────────────────────────────────
  const [errors,        setErrors]        = useState({});
  const [submitError,   setSubmitError]   = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitting,    setSubmitting]    = useState(false);

  // ── Add document type dialog ───────────────────────────────────────────────
  const [showAddDT,       setShowAddDT]       = useState(false);
  const [newDTName,       setNewDTName]       = useState('');
  const [newDTReqDrn,     setNewDTReqDrn]     = useState(false);
  const [addDTErr,        setAddDTErr]        = useState('');
  const [addDTLoading,    setAddDTLoading]    = useState(false);

  // ── Add courier dialog ─────────────────────────────────────────────────────
  const [showAddCr,    setShowAddCr]    = useState(false);
  const [newCrName,    setNewCrName]    = useState('');
  const [addCrErr,     setAddCrErr]     = useState('');
  const [addCrLoading, setAddCrLoading] = useState(false);

  // ── Load masters (called on mount and after adding new items) ──────────────
  const loadMasters = useCallback(async () => {
    try {
      const [dts, cvrs] = await Promise.all([getDocumentTypes(), getCouriers()]);
      setDocumentTypes(Array.isArray(dts)  ? dts.filter(d => d.is_active  !== false) : []);
      setCouriers(     Array.isArray(cvrs) ? cvrs.filter(c => c.is_active !== false) : []);
    } catch {}
  }, []);

  useEffect(() => {
    loadMasters();
    getUsersForDropdown()
      .then(result => setUsers(result))
      .catch(err => {
        const status  = err.response?.status ?? 'N/A';
        const message = err.response?.data?.error?.message ?? err.message ?? 'Unknown error';
        console.error('[DaakEntryForm] Failed to load users:', err, '\nResponse data:', err.response?.data);
        setUsersError(`Could not load users (status ${status}): ${message}`);
      });
    api.get('/admin/v1/profile')
      .then(res => setDepartment(res.data?.data?.department ?? ''))
      .catch(() => {});
  }, [loadMasters]);

  // ── Company autocomplete (debounced) ───────────────────────────────────────
  useEffect(() => {
    if (selectedCompany) return;
    const q = companyQuery.trim();
    if (q.length < 2) { setCompanySuggestions([]); setShowCompDrop(false); return; }
    setShowCompDrop(true);
    const timer = setTimeout(async () => {
      try {
        const [byName, byCode] = await Promise.allSettled([
          api.get('/admin/v1/issuers', { params: { issuerName: q, pageSize: 10 } }),
          api.get('/admin/v1/issuers', { params: { issuerCode: q, pageSize: 10 } }),
        ]);
        const seen = new Map();
        for (const r of [byName, byCode]) {
          if (r.status === 'fulfilled') {
            for (const item of (r.value.data?.data?.items ?? [])) {
              if (!seen.has(item.issuerCode)) seen.set(item.issuerCode, item);
            }
          }
        }
        setCompanySuggestions([...seen.values()].slice(0, 10));
      } catch { setCompanySuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [companyQuery, selectedCompany]);

  // ── Load ISINs when company changes ───────────────────────────────────────
  useEffect(() => {
    if (!selectedCompany || isOthers) { setCompanyIsins([]); setSelectedIsin(''); return; }
    setIsinsLoading(true);
    api.get('/admin/v1/isins', { params: { issuerCode: selectedCompany.issuerCode, pageSize: 200 } })
      .then(res => setCompanyIsins(res.data?.data?.items ?? []))
      .catch(() => setCompanyIsins([]))
      .finally(() => setIsinsLoading(false));
  }, [selectedCompany, isOthers]);

  // ── Pre-fill on edit ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const rec = await getInward(id);
        if (!rec) return;
        setReceivedDate(rec.receivedDate ?? '');
        if (rec.companyOtherName) {
          setSelectedCompany({ issuerCode: OTHERS, issuerName: 'Others' });
          setOtherCompName(rec.companyOtherName);
          setFreeIsin(rec.isin ?? '');
        } else if (rec.companyCode) {
          setSelectedCompany({
            issuerCode: rec.companyCode,
            issuerName: rec.companyName || rec.companyCode,
          });
          setSelectedIsin(rec.isin ?? '');
        }
        setSenderName(rec.senderName ?? '');
        setSenderPhone(rec.senderPhone ?? '');
        setSenderEmail(rec.senderEmail ?? '');
        setSenderAddress(rec.senderAddress ?? '');
        setDescription(rec.description ?? '');
        setSelectedDocType(rec.documentTypeId != null ? String(rec.documentTypeId) : '');
        setItemCount(rec.itemCount != null ? String(rec.itemCount) : '');
        setDrn(rec.drn ?? '');
        setSelectedCourier(rec.courierCompanyId != null ? String(rec.courierCompanyId) : '');
        setCourierAwb(rec.courierAwb ?? '');
        setReceivedByUser(rec.receivedByUserId != null ? String(rec.receivedByUserId) : '');
        setRemarks(rec.remarks ?? '');
      } catch (err) {
        setSubmitError(err.response?.data?.error?.message ?? 'Failed to load record.');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function clrErr(key) { setErrors(prev => ({ ...prev, [key]: '' })); }

  function fldStyle(key) { return errors[key] ? { borderColor: '#d32f2f' } : {}; }

  function validate() {
    const e = {};
    if (!receivedDate)                                              e.receivedDate    = 'Required';
    if (!selectedCompany)                                           e.company         = 'Required';
    if (isOthers && !otherCompName.trim())                          e.otherCompName   = 'Required';
    if (isOthers ? !freeIsin.trim() : !selectedIsin)               e.isin            = 'Required';
    if (!senderName.trim())                                         e.senderName      = 'Required';
    if (senderPhone.length !== 10)                                  e.senderPhone     = 'Enter a valid 10 digit phone number';
    if (senderEmail.trim()) {
      const emailTrimmed = senderEmail.trim();
      if (emailTrimmed.length > 100 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(emailTrimmed))
                                                                    e.senderEmail     = 'Invalid email format';
    }
    if (!senderAddress.trim())                                      e.senderAddress   = 'Required';
    if (!description.trim())                                        e.description     = 'Required';
    if (!selectedDocType)                                           e.documentTypeId  = 'Required';
    if (!itemCount.trim() || !Number.isInteger(Number(itemCount)) || parseInt(itemCount) < 1)
                                                                    e.itemCount       = 'Must be a positive whole number';
    if (showDrn && !drn.trim())                                     e.drn             = 'Required';
    if (!selectedCourier)                                           e.courierCompanyId = 'Required';
    if (!courierAwb.trim())                                         e.courierAwb      = 'Required';
    if (!receivedByUser)                                            e.receivedByUserId = 'Required';
    return e;
  }

  function buildPayload() {
    return {
      receivedDate,
      companyCode:      isOthers ? null : (selectedCompany?.issuerCode ?? null),
      companyOtherName: isOthers ? otherCompName.trim() : null,
      isin:             isOthers ? freeIsin.trim() : selectedIsin,
      senderName:       senderName.trim(),
      senderAddress:    senderAddress.trim(),
      senderPhone:      senderPhone.trim(),
      senderEmail:      senderEmail.trim() || null,
      description:      description.trim(),
      documentTypeId:   parseInt(selectedDocType),
      drn:              showDrn ? drn.trim() : null,
      itemCount:        parseInt(itemCount),
      courierCompanyId: parseInt(selectedCourier),
      courierAwb:       courierAwb.trim(),
      receivedByUserId: parseInt(receivedByUser),
      remarks:          remarks.trim() || null,
    };
  }

  async function handleSubmit() {
    setSubmitError('');
    setSubmitSuccess('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateInward(id, payload);
        setSubmitSuccess('Record updated successfully.');
      } else {
        await createInward(payload);
        setSubmitSuccess('Record created successfully.');
        setTimeout(() => navigate('/daak-entry'), 1200);
      }
    } catch (err) {
      setSubmitError(err.response?.data?.error?.message ?? err.message ?? 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Add document type ──────────────────────────────────────────────────────
  async function handleSaveDocType() {
    if (!newDTName.trim()) { setAddDTErr('Name is required'); return; }
    setAddDTLoading(true);
    setAddDTErr('');
    try {
      const created = await addDocumentType(newDTName.trim(), newDTReqDrn);
      await loadMasters();
      if (created?.id) setSelectedDocType(String(created.id));
      setShowAddDT(false);
      setNewDTName('');
      setNewDTReqDrn(false);
    } catch (err) {
      setAddDTErr(err.response?.data?.error?.message ?? 'Failed to add.');
    } finally {
      setAddDTLoading(false);
    }
  }

  function closeDTDialog() {
    setShowAddDT(false);
    setNewDTName('');
    setNewDTReqDrn(false);
    setAddDTErr('');
  }

  // ── Add courier ────────────────────────────────────────────────────────────
  async function handleSaveCourier() {
    if (!newCrName.trim()) { setAddCrErr('Name is required'); return; }
    setAddCrLoading(true);
    setAddCrErr('');
    try {
      const created = await addCourier(newCrName.trim());
      await loadMasters();
      if (created?.id) setSelectedCourier(String(created.id));
      setShowAddCr(false);
      setNewCrName('');
    } catch (err) {
      setAddCrErr(err.response?.data?.error?.message ?? 'Failed to add.');
    } finally {
      setAddCrLoading(false);
    }
  }

  function closeCrDialog() {
    setShowAddCr(false);
    setNewCrName('');
    setAddCrErr('');
  }

  // ── Company combobox handlers ──────────────────────────────────────────────
  function selectCompany(comp) {
    setSelectedCompany(comp);
    setCompanyQuery('');
    setShowCompDrop(false);
    setOtherCompName('');
    setSelectedIsin('');
    setFreeIsin('');
    setCompanyIsins([]);
    clrErr('company');
  }

  function clearCompany() {
    setSelectedCompany(null);
    setCompanyQuery('');
    setCompanySuggestions([]);
    setShowCompDrop(false);
    setOtherCompName('');
    setSelectedIsin('');
    setFreeIsin('');
    setCompanyIsins([]);
  }

  const companyDisplay = selectedCompany
    ? (isOthers ? 'Others' : (selectedCompany.issuerName || selectedCompany.issuerCode))
    : companyQuery;

  const title       = isEdit ? 'Edit' : 'Add';
  const submitLabel = isEdit ? 'UPDATE' : 'SUBMIT';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="isin-master">
      <h1 className="page-heading">{title}</h1>

      {submitError   && <div className="im-banner im-banner--error">⚠ {submitError}</div>}
      {submitSuccess && <div className="im-banner im-banner--success">✓ {submitSuccess}</div>}

      <div className="im-card">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 1 — Daak Entry Details                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header"><span>Daak Entry Details</span></div>

        <div className="dk-form-grid">

          {/* Received Date */}
          <div className="benpos-field">
            <label className="benpos-label">Received Date *</label>
            <input
              type="date"
              className="benpos-date-input"
              style={fldStyle('receivedDate')}
              value={receivedDate}
              onChange={e => { setReceivedDate(e.target.value); clrErr('receivedDate'); }}
            />
            {errors.receivedDate && <span className="ca-err">{errors.receivedDate}</span>}
          </div>

          {/* Company Name (span 2) */}
          <div className="benpos-field dk-field-span2" ref={compWrapRef}>
            <label className="benpos-label">Company Name (related company / issuer) *</label>
            <div className="dk-company-wrap">
              <input
                type="text"
                className={`dk-company-input${errors.company ? ' dk-company-input--error' : ''}`}
                value={companyDisplay}
                placeholder="— type to search —"
                onChange={e => {
                  if (selectedCompany) clearCompany();
                  else setCompanyQuery(e.target.value);
                  clrErr('company');
                }}
                onFocus={() => {
                  if (!selectedCompany && companySuggestions.length > 0) setShowCompDrop(true);
                }}
                onBlur={e => {
                  if (!compWrapRef.current?.contains(e.relatedTarget)) {
                    setTimeout(() => setShowCompDrop(false), 150);
                  }
                }}
              />
              {showCompDrop && !selectedCompany && (
                <ul className="dk-company-dropdown">
                  {companySuggestions.length === 0 ? (
                    <li className="dk-company-opt dk-company-opt--hint">Searching…</li>
                  ) : (
                    companySuggestions.map(item => (
                      <li
                        key={item.issuerCode}
                        className="dk-company-opt"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selectCompany({ issuerCode: item.issuerCode, issuerName: item.issuerName || item.issuerCode })}
                      >
                        <strong>{item.issuerCode}</strong> — {item.issuerName || ''}
                      </li>
                    ))
                  )}
                  <li
                    className="dk-company-opt dk-company-opt--others"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectCompany({ issuerCode: OTHERS, issuerName: 'Others' })}
                  >
                    Others
                  </li>
                </ul>
              )}
            </div>
            {errors.company && <span className="ca-err">{errors.company}</span>}
          </div>

          {/* Others company name text box — fills col 4 of row 1 when Others */}
          {isOthers && (
            <div className="benpos-field">
              <label className="benpos-label">Company Name *</label>
              <input
                type="text"
                className="benpos-date-input"
                style={fldStyle('otherCompName')}
                value={otherCompName}
                onChange={e => { setOtherCompName(e.target.value); clrErr('otherCompName'); }}
              />
              {errors.otherCompName && <span className="ca-err">{errors.otherCompName}</span>}
            </div>
          )}

          {/* ISIN — always last in this section so it flows to col 4 (no-Others) or row 2 (Others) */}
          <div className="benpos-field">
            <label className="benpos-label">ISIN *</label>
            {!selectedCompany ? (
              <select className="benpos-select" disabled>
                <option>Select a company first</option>
              </select>
            ) : isOthers ? (
              <>
                <input
                  type="text"
                  className="benpos-date-input"
                  style={fldStyle('isin')}
                  value={freeIsin}
                  placeholder="Enter ISIN"
                  onChange={e => { setFreeIsin(e.target.value); clrErr('isin'); }}
                />
                {errors.isin && <span className="ca-err">{errors.isin}</span>}
              </>
            ) : (
              <>
                <select
                  className="benpos-select"
                  style={fldStyle('isin')}
                  value={selectedIsin}
                  onChange={e => { setSelectedIsin(e.target.value); clrErr('isin'); }}
                  disabled={isinsLoading}
                >
                  <option value="">{isinsLoading ? 'Loading…' : '— select ISIN —'}</option>
                  {companyIsins.map(item => (
                    <option key={item.isin} value={item.isin}>
                      {item.isin}{item.isinDescription ? ` - ${item.isinDescription}` : ''}
                    </option>
                  ))}
                </select>
                {errors.isin && <span className="ca-err">{errors.isin}</span>}
              </>
            )}
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 2 — Sender Details                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header" style={{ marginTop: 2 }}><span>Sender Details</span></div>

        <div className="dk-form-grid">

          {/* Sender Name */}
          <div className="benpos-field">
            <label className="benpos-label">Sender Name *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('senderName')}
              maxLength={100}
              value={senderName}
              onChange={e => { setSenderName(e.target.value); clrErr('senderName'); }}
            />
            {errors.senderName && <span className="ca-err">{errors.senderName}</span>}
          </div>

          {/* Telephone */}
          <div className="benpos-field">
            <label className="benpos-label">Telephone No. *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('senderPhone')}
              maxLength={10}
              value={senderPhone}
              onChange={e => {
                setSenderPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                clrErr('senderPhone');
              }}
            />
            {errors.senderPhone && <span className="ca-err">{errors.senderPhone}</span>}
          </div>

          {/* Email */}
          <div className="benpos-field">
            <label className="benpos-label">Email ID</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('senderEmail')}
              maxLength={100}
              value={senderEmail}
              onChange={e => { setSenderEmail(e.target.value); clrErr('senderEmail'); }}
            />
            {errors.senderEmail && <span className="ca-err">{errors.senderEmail}</span>}
          </div>

          {/* Sender Address — full row */}
          <div className="benpos-field dk-field-span4">
            <label className="benpos-label">Sender Address *</label>
            <textarea
              className={`dk-textarea${errors.senderAddress ? ' dk-textarea--error' : ''}`}
              maxLength={500}
              value={senderAddress}
              onChange={e => { setSenderAddress(e.target.value); clrErr('senderAddress'); }}
            />
            {errors.senderAddress && <span className="ca-err">{errors.senderAddress}</span>}
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 3 — Document Details                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header" style={{ marginTop: 2 }}><span>Document Details</span></div>

        <div className="dk-form-grid">

          {/* Description — full row */}
          <div className="benpos-field dk-field-span4">
            <label className="benpos-label">Description of Contents *</label>
            <textarea
              className={`dk-textarea${errors.description ? ' dk-textarea--error' : ''}`}
              maxLength={1000}
              value={description}
              onChange={e => { setDescription(e.target.value); clrErr('description'); }}
            />
            {errors.description && <span className="ca-err">{errors.description}</span>}
          </div>

          {/* Document Type */}
          <div className="benpos-field">
            <label className="benpos-label">Documents Type *</label>
            <select
              className="benpos-select"
              style={fldStyle('documentTypeId')}
              value={selectedDocType}
              onChange={e => {
                if (admin && e.target.value === '__ADD__') { setShowAddDT(true); return; }
                setSelectedDocType(e.target.value);
                clrErr('documentTypeId');
              }}
            >
              <option value="">— select —</option>
              {documentTypes.map(dt => (
                <option key={dt.id} value={String(dt.id)}>{dt.name}</option>
              ))}
              {admin && <option value="__ADD__">+ Add new…</option>}
            </select>
            {errors.documentTypeId && <span className="ca-err">{errors.documentTypeId}</span>}
          </div>

          {/* Item Count */}
          <div className="benpos-field">
            <label className="benpos-label">Item Count *</label>
            <input
              type="number"
              min="1"
              max="999999"
              step="1"
              className="benpos-date-input"
              style={fldStyle('itemCount')}
              value={itemCount}
              onChange={e => { setItemCount(e.target.value); clrErr('itemCount'); }}
            />
            {errors.itemCount && <span className="ca-err">{errors.itemCount}</span>}
          </div>

          {/* Staff / Department — read-only from profile */}
          <div className="benpos-field">
            <label className="benpos-label">Staff / Department</label>
            <input
              type="text"
              className="dk-readonly"
              value={department}
              readOnly
              tabIndex={-1}
            />
          </div>

          {/* DRN — only when doc type requires it */}
          {showDrn && (
            <div className="benpos-field">
              <label className="benpos-label">DRN *</label>
              <input
                type="text"
                className="benpos-date-input"
                style={fldStyle('drn')}
                value={drn}
                onChange={e => { setDrn(e.target.value); clrErr('drn'); }}
              />
              {errors.drn && <span className="ca-err">{errors.drn}</span>}
            </div>
          )}

        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 4 — Courier Details                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header" style={{ marginTop: 2 }}><span>Courier Details</span></div>

        <div className="dk-form-grid">

          {/* Courier Company */}
          <div className="benpos-field">
            <label className="benpos-label">Courier Company *</label>
            <select
              className="benpos-select"
              style={fldStyle('courierCompanyId')}
              value={selectedCourier}
              onChange={e => {
                if (admin && e.target.value === '__ADD__') { setShowAddCr(true); return; }
                setSelectedCourier(e.target.value);
                clrErr('courierCompanyId');
              }}
            >
              <option value="">— select —</option>
              {couriers.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
              {admin && <option value="__ADD__">+ Add new…</option>}
            </select>
            {errors.courierCompanyId && <span className="ca-err">{errors.courierCompanyId}</span>}
          </div>

          {/* Courier AWB */}
          <div className="benpos-field">
            <label className="benpos-label">Courier AWB / Docket Number *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('courierAwb')}
              maxLength={50}
              value={courierAwb}
              onChange={e => { setCourierAwb(e.target.value); clrErr('courierAwb'); }}
            />
            {errors.courierAwb && <span className="ca-err">{errors.courierAwb}</span>}
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 5 — Receipt Details                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header" style={{ marginTop: 2 }}><span>Receipt Details</span></div>

        <div className="dk-form-grid">

          {/* Received By */}
          <div className="benpos-field">
            <label className="benpos-label">Received By - User Name *</label>
            <select
              className="benpos-select"
              style={fldStyle('receivedByUserId')}
              value={receivedByUser}
              onChange={e => { setReceivedByUser(e.target.value); clrErr('receivedByUserId'); }}
            >
              <option value="">— select —</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>{userDisplayNames[u.id]}</option>
              ))}
            </select>
            {errors.receivedByUserId && <span className="ca-err">{errors.receivedByUserId}</span>}
            {usersError && <span className="ca-err">{usersError}</span>}
          </div>

          {/* Remarks — full row */}
          <div className="benpos-field dk-field-span4">
            <label className="benpos-label">Remarks</label>
            <textarea
              className="dk-textarea"
              maxLength={500}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>

        </div>

        {/* ── Submit button ────────────────────────────────────────────────── */}
        <div className="ca-form-footer">
          <button
            className="btn-action btn-action--pink"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ borderRadius: 22, padding: '11px 38px', fontSize: 12.5 }}
          >
            {submitting ? '…' : submitLabel}
          </button>
        </div>

      </div>

      {/* ── Add Document Type dialog ─────────────────────────────────────── */}
      {showAddDT && (
        <div className="dk-overlay">
          <div className="dk-dialog">
            <div className="dk-dialog-hdr">
              <span>Add Document Type</span>
              <button className="dk-dialog-close" onClick={closeDTDialog}>✕</button>
            </div>
            <div className="dk-dialog-body">
              <div>
                <label className="dk-dialog-lbl">Name *</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  value={newDTName}
                  onChange={e => { setNewDTName(e.target.value); setAddDTErr(''); }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="dk-req-drn"
                  checked={newDTReqDrn}
                  onChange={e => setNewDTReqDrn(e.target.checked)}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <label htmlFor="dk-req-drn" style={{ fontSize: 13, cursor: 'pointer', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  Requires DRN
                </label>
              </div>
              {addDTErr && <span className="ca-err" style={{ fontSize: 12 }}>{addDTErr}</span>}
            </div>
            <div className="dk-dialog-actions">
              <button className="btn-action btn-action--white" onClick={closeDTDialog}>Cancel</button>
              <button className="btn-action btn-action--pink" onClick={handleSaveDocType} disabled={addDTLoading}>
                {addDTLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Courier dialog ───────────────────────────────────────────── */}
      {showAddCr && (
        <div className="dk-overlay">
          <div className="dk-dialog">
            <div className="dk-dialog-hdr">
              <span>Add Courier Company</span>
              <button className="dk-dialog-close" onClick={closeCrDialog}>✕</button>
            </div>
            <div className="dk-dialog-body">
              <div>
                <label className="dk-dialog-lbl">Name *</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  value={newCrName}
                  onChange={e => { setNewCrName(e.target.value); setAddCrErr(''); }}
                  autoFocus
                />
              </div>
              {addCrErr && <span className="ca-err" style={{ fontSize: 12 }}>{addCrErr}</span>}
            </div>
            <div className="dk-dialog-actions">
              <button className="btn-action btn-action--white" onClick={closeCrDialog}>Cancel</button>
              <button className="btn-action btn-action--pink" onClick={handleSaveCourier} disabled={addCrLoading}>
                {addCrLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default DaakEntryForm;
