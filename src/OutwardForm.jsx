import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from './api/axios';
import {
  getDocumentTypes,
  getCouriers,
  addDocumentType,
  addCourier,
  createOutward,
  updateOutward,
  getOutward,
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

function OutwardForm() {
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
  const [selectedCompany,    setSelectedCompany]    = useState(null);
  const compWrapRef = useRef(null);

  const isOthers = selectedCompany?.issuerCode === OTHERS;

  // ── ISIN ──────────────────────────────────────────────────────────────────
  const [companyIsins, setCompanyIsins] = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(false);
  const [selectedIsin, setSelectedIsin] = useState('');
  const [freeIsin,     setFreeIsin]     = useState('');

  // ── Form fields ────────────────────────────────────────────────────────────
  const [dispatchDate,    setDispatchDate]    = useState('');
  const [otherCompName,   setOtherCompName]   = useState('');
  const [recipientName,   setRecipientName]   = useState('');
  const [recipientEmail,  setRecipientEmail]  = useState('');
  const [addressLine1,    setAddressLine1]    = useState('');
  const [addressLine2,    setAddressLine2]    = useState('');
  const [pinCode,         setPinCode]         = useState('');
  const [city,            setCity]            = useState('');
  const [stateField,      setStateField]      = useState('');
  const [phone,           setPhone]           = useState('');
  const [selectedCourier, setSelectedCourier] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [podNumber,       setPodNumber]       = useState('');
  const [cost,            setCost]            = useState('');
  const [drn,             setDrn]             = useState('');
  const [senderUserId,    setSenderUserId]    = useState('');
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
  const [showAddDT,    setShowAddDT]    = useState(false);
  const [newDTName,    setNewDTName]    = useState('');
  const [newDTReqDrn,  setNewDTReqDrn]  = useState(false);
  const [addDTErr,     setAddDTErr]     = useState('');
  const [addDTLoading, setAddDTLoading] = useState(false);

  // ── Add courier dialog ─────────────────────────────────────────────────────
  const [showAddCr,    setShowAddCr]    = useState(false);
  const [newCrName,    setNewCrName]    = useState('');
  const [addCrErr,     setAddCrErr]     = useState('');
  const [addCrLoading, setAddCrLoading] = useState(false);

  // ── Load masters ───────────────────────────────────────────────────────────
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
        console.error('[OutwardForm] Failed to load users:', err, '\nResponse data:', err.response?.data);
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
        const rec = await getOutward(id);
        if (!rec) return;
        setDispatchDate(rec.dispatchDate ?? '');
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
        setRecipientName(rec.recipientName ?? '');
        setRecipientEmail(rec.recipientEmail ?? '');
        setAddressLine1(rec.addressLine1 ?? '');
        setAddressLine2(rec.addressLine2 ?? '');
        setPinCode(rec.pinCode ?? '');
        setCity(rec.city ?? '');
        setStateField(rec.state ?? '');
        setPhone(rec.phone ?? '');
        setSelectedCourier(rec.courierCompanyId != null ? String(rec.courierCompanyId) : '');
        setSelectedDocType(rec.documentTypeId   != null ? String(rec.documentTypeId)   : '');
        setPodNumber(rec.podNumber ?? '');
        setCost(rec.cost != null ? String(rec.cost) : '');
        setDrn(rec.drn ?? '');
        setSenderUserId(rec.senderUserId != null ? String(rec.senderUserId) : '');
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
    if (!dispatchDate)                                               e.dispatchDate    = 'Required';
    if (!selectedCompany)                                            e.company         = 'Required';
    if (isOthers && !otherCompName.trim())                           e.otherCompName   = 'Required';
    if (isOthers ? !freeIsin.trim() : !selectedIsin)                e.isin            = 'Required';
    if (!recipientName.trim())                                       e.recipientName   = 'Required';
    if (!addressLine1.trim())                                        e.addressLine1    = 'Required';
    if (!pinCode.trim())                                             e.pinCode         = 'Required';
    if (!city.trim())                                                e.city            = 'Required';
    if (!stateField.trim())                                          e.state           = 'Required';
    if (!selectedCourier)                                            e.courierCompanyId = 'Required';
    if (!selectedDocType)                                            e.documentTypeId  = 'Required';
    if (showDrn && !drn.trim())                                      e.drn             = 'Required';
    if (recipientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim()))
                                                                     e.recipientEmail  = 'Invalid email format';
    if (cost.trim() && isNaN(parseFloat(cost)))                      e.cost            = 'Must be a number';
    return e;
  }

  function buildPayload() {
    return {
      dispatchDate,
      companyCode:      isOthers ? null : (selectedCompany?.issuerCode ?? null),
      companyOtherName: isOthers ? otherCompName.trim() : null,
      isin:             isOthers ? freeIsin.trim() : selectedIsin,
      recipientName:    recipientName.trim(),
      recipientEmail:   recipientEmail.trim() || null,
      addressLine1:     addressLine1.trim(),
      addressLine2:     addressLine2.trim() || null,
      pinCode:          pinCode.trim(),
      city:             city.trim(),
      state:            stateField.trim(),
      phone:            phone.trim() || null,
      courierCompanyId: parseInt(selectedCourier),
      documentTypeId:   parseInt(selectedDocType),
      drn:              showDrn ? drn.trim() : null,
      podNumber:        podNumber.trim() || null,
      cost:             cost.trim() ? parseFloat(cost) : null,
      senderUserId:     senderUserId ? parseInt(senderUserId) : null,
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
        await updateOutward(id, payload);
        setSubmitSuccess('Record updated successfully.');
      } else {
        await createOutward(payload);
        setSubmitSuccess('Record created successfully.');
        setTimeout(() => navigate('/outward'), 1200);
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
        {/* Section 1 — Outward Details                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header"><span>Outward Details</span></div>

        <div className="dk-form-grid">

          {/* Dispatch Date */}
          <div className="benpos-field">
            <label className="benpos-label">Dispatch Date *</label>
            <input
              type="date"
              className="benpos-date-input"
              style={fldStyle('dispatchDate')}
              value={dispatchDate}
              onChange={e => { setDispatchDate(e.target.value); clrErr('dispatchDate'); }}
            />
            {errors.dispatchDate && <span className="ca-err">{errors.dispatchDate}</span>}
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

          {/* Others company name text box */}
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

          {/* ISIN */}
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
        {/* Section 2 — Recipient Details                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header" style={{ marginTop: 2 }}><span>Recipient Details</span></div>

        <div className="dk-form-grid">

          {/* Recipient Name (span 2) */}
          <div className="benpos-field dk-field-span2">
            <label className="benpos-label">Recipient Name *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('recipientName')}
              value={recipientName}
              onChange={e => { setRecipientName(e.target.value); clrErr('recipientName'); }}
            />
            {errors.recipientName && <span className="ca-err">{errors.recipientName}</span>}
          </div>

          {/* Recipient Email (span 2) */}
          <div className="benpos-field dk-field-span2">
            <label className="benpos-label">Recipient Email</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('recipientEmail')}
              value={recipientEmail}
              onChange={e => { setRecipientEmail(e.target.value); clrErr('recipientEmail'); }}
            />
            {errors.recipientEmail && <span className="ca-err">{errors.recipientEmail}</span>}
          </div>

          {/* Address Line 1 (span 2) */}
          <div className="benpos-field dk-field-span2">
            <label className="benpos-label">Address Line 1 *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('addressLine1')}
              value={addressLine1}
              onChange={e => { setAddressLine1(e.target.value); clrErr('addressLine1'); }}
            />
            {errors.addressLine1 && <span className="ca-err">{errors.addressLine1}</span>}
          </div>

          {/* Address Line 2 (span 2) */}
          <div className="benpos-field dk-field-span2">
            <label className="benpos-label">Address Line 2</label>
            <input
              type="text"
              className="benpos-date-input"
              value={addressLine2}
              onChange={e => setAddressLine2(e.target.value)}
            />
          </div>

          {/* Pin Code */}
          <div className="benpos-field">
            <label className="benpos-label">Pin Code *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('pinCode')}
              value={pinCode}
              onChange={e => { setPinCode(e.target.value); clrErr('pinCode'); }}
            />
            {errors.pinCode && <span className="ca-err">{errors.pinCode}</span>}
          </div>

          {/* City */}
          <div className="benpos-field">
            <label className="benpos-label">City *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('city')}
              value={city}
              onChange={e => { setCity(e.target.value); clrErr('city'); }}
            />
            {errors.city && <span className="ca-err">{errors.city}</span>}
          </div>

          {/* State */}
          <div className="benpos-field">
            <label className="benpos-label">State *</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('state')}
              value={stateField}
              onChange={e => { setStateField(e.target.value); clrErr('state'); }}
            />
            {errors.state && <span className="ca-err">{errors.state}</span>}
          </div>

          {/* Phone */}
          <div className="benpos-field">
            <label className="benpos-label">Phone No</label>
            <input
              type="text"
              className="benpos-date-input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 3 — Courier Details                                       */}
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

          {/* Document Type */}
          <div className="benpos-field">
            <label className="benpos-label">Document Type *</label>
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

          {/* Staff / Department — read-only */}
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

          {/* POD Number */}
          <div className="benpos-field">
            <label className="benpos-label">POD Number</label>
            <input
              type="text"
              className="benpos-date-input"
              value={podNumber}
              onChange={e => setPodNumber(e.target.value)}
            />
          </div>

          {/* Cost */}
          <div className="benpos-field">
            <label className="benpos-label">Cost</label>
            <input
              type="text"
              className="benpos-date-input"
              style={fldStyle('cost')}
              value={cost}
              onChange={e => { setCost(e.target.value); clrErr('cost'); }}
            />
            {errors.cost && <span className="ca-err">{errors.cost}</span>}
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
        {/* Section 4 — Remarks & Sender                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="im-card-header" style={{ marginTop: 2 }}><span>Remarks &amp; Sender</span></div>

        <div className="dk-form-grid">

          {/* Sender Name (user dropdown) */}
          <div className="benpos-field">
            <label className="benpos-label">Sender Name</label>
            <select
              className="benpos-select"
              value={senderUserId}
              onChange={e => setSenderUserId(e.target.value)}
            >
              <option value="">— select —</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>{userDisplayNames[u.id]}</option>
              ))}
            </select>
            {usersError && <span className="ca-err">{usersError}</span>}
          </div>

          {/* Remarks — full row */}
          <div className="benpos-field dk-field-span4">
            <label className="benpos-label">Remarks</label>
            <textarea
              className="dk-textarea"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>

        </div>

        {/* ── Submit button ─────────────────────────────────────────────────── */}
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
                  id="ow-req-drn"
                  checked={newDTReqDrn}
                  onChange={e => setNewDTReqDrn(e.target.checked)}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <label htmlFor="ow-req-drn" style={{ fontSize: 13, cursor: 'pointer', fontFamily: 'Arial, Helvetica, sans-serif' }}>
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

export default OutwardForm;
