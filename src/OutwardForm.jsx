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
  getOtherRecipients,
} from './services/daakService';
import { getDpOptions } from './services/dpMasterService';
import { getIssuerOptions } from './services/issuerService';
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

  // ── Recipient type & DP autocomplete ──────────────────────────────────────
  const [recipientType, setRecipientType] = useState('OTHER');
  const [selectedDp,    setSelectedDp]    = useState(null);
  const [dpQuery,       setDpQuery]       = useState('');
  const [dpSuggestions, setDpSuggestions] = useState([]);
  const [showDpDrop,    setShowDpDrop]    = useState(false);
  const dpWrapRef = useRef(null);

  // ── Recipient company autocomplete ─────────────────────────────────────────
  const [selectedRecipientComp,  setSelectedRecipientComp]  = useState(null);
  const [recipCompQuery,         setRecipCompQuery]         = useState('');
  const [recipCompSuggestions,   setRecipCompSuggestions]   = useState([]);
  const [showRecipCompDrop,      setShowRecipCompDrop]      = useState(false);
  const recipCompWrapRef = useRef(null);

  const isOthers = selectedCompany?.issuerCode === OTHERS;

  // ── Recipient-name autocomplete (Other radio) ──────────────────────────────
  const [otherSuggestions, setOtherSuggestions] = useState([]);
  const [showOtherDrop,    setShowOtherDrop]    = useState(false);
  const otherWrapRef   = useRef(null);
  const otherPrefilled = useRef(false);

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

  // ── Address / phone helpers ────────────────────────────────────────────────
  const ADDR1_MAX = 100;
  function splitAddress(addr) {
    if (!addr) return ['', ''];
    if (addr.length <= ADDR1_MAX) return [addr, ''];
    const cut = addr.lastIndexOf(' ', ADDR1_MAX);
    if (cut <= 0) return [addr.slice(0, ADDR1_MAX), addr.slice(ADDR1_MAX).trim()];
    return [addr.slice(0, cut), addr.slice(cut + 1).trim()];
  }
  function normalizePhone(raw) {
    const digits = (raw ?? '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

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

  // ── DP autocomplete (debounced) ────────────────────────────────────────────
  useEffect(() => {
    if (recipientType !== 'DP') return;
    if (selectedDp) return;
    const q = dpQuery.trim();
    if (q.length < 2) { setDpSuggestions([]); setShowDpDrop(false); return; }
    setShowDpDrop(true);
    const timer = setTimeout(async () => {
      try {
        const opts = await getDpOptions(q);
        setDpSuggestions(opts);
      } catch { setDpSuggestions([]); }
    }, 400);
    return () => clearTimeout(timer);
  }, [dpQuery, selectedDp, recipientType]);

  // ── Recipient company autocomplete (debounced) ─────────────────────────────
  useEffect(() => {
    if (recipientType !== 'COMPANY') return;
    if (selectedRecipientComp) return;
    const q = recipCompQuery.trim();
    if (q.length < 2) { setRecipCompSuggestions([]); setShowRecipCompDrop(false); return; }
    setShowRecipCompDrop(true);
    const timer = setTimeout(async () => {
      try {
        const opts = await getIssuerOptions(q);
        setRecipCompSuggestions(opts);
      } catch { setRecipCompSuggestions([]); }
    }, 400);
    return () => clearTimeout(timer);
  }, [recipCompQuery, selectedRecipientComp, recipientType]);

  // ── Recipient-name autocomplete (Other radio, debounced) ───────────────────
  useEffect(() => {
    if (recipientType !== 'OTHER') return;
    if (otherPrefilled.current) { otherPrefilled.current = false; return; }
    const q = recipientName.trim();
    const timer = setTimeout(async () => {
      try {
        const opts = await getOtherRecipients(q);
        setOtherSuggestions(opts);
        if (opts.length > 0) setShowOtherDrop(true);
      } catch { setOtherSuggestions([]); }
    }, 400);
    return () => clearTimeout(timer);
  }, [recipientName, recipientType]);

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
        // Top block: company + ISIN
        if (rec.companyCode) {
          setSelectedCompany({ issuerCode: rec.companyCode, issuerName: rec.companyName || rec.companyCode });
          setSelectedIsin(rec.isin ?? '');
        } else {
          setSelectedCompany({ issuerCode: OTHERS, issuerName: 'Others' });
          setOtherCompName(rec.companyOtherName ?? '');
          setFreeIsin(rec.isin ?? '');
        }
        // Recipient details
        const rtype = rec.recipientType ?? 'OTHER';
        setRecipientType(rtype);
        if (rtype === 'DP' && rec.dpId) {
          setSelectedDp({ id: null, dpId: rec.dpId, dpName: rec.dpName || rec.dpId });
        } else if (rtype === 'OTHER') {
          otherPrefilled.current = true;
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
    if (!isOthers && !selectedIsin)                                  e.isin            = 'Required';
    if (isOthers && !freeIsin.trim())                                e.isin            = 'Required';
    if (recipientType === 'DP' && !selectedDp)                       e.dp              = 'Required';
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
      recipientType,
      companyCode:      isOthers ? null : (selectedCompany?.issuerCode ?? null),
      companyOtherName: isOthers ? otherCompName.trim() : null,
      dpId:             recipientType === 'DP' ? (selectedDp?.dpId ?? null) : null,
      dpName:           recipientType === 'DP' ? (selectedDp?.dpName ?? null) : null,
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

  // ── Recipient type handler ─────────────────────────────────────────────────
  function handleRecipientTypeChange(type) {
    setRecipientType(type);
    setSelectedDp(null); setDpQuery(''); setDpSuggestions([]); setShowDpDrop(false);
    setSelectedRecipientComp(null); setRecipCompQuery(''); setRecipCompSuggestions([]); setShowRecipCompDrop(false);
    setOtherSuggestions([]); setShowOtherDrop(false); otherPrefilled.current = false;
    setRecipientName(''); setRecipientEmail(''); setAddressLine1(''); setAddressLine2('');
    setPinCode(''); setCity(''); setStateField(''); setPhone('');
    setErrors({});
  }

  // ── DP combobox handler ────────────────────────────────────────────────────
  function handleDpSelect(dp) {
    setSelectedDp(dp);
    setDpQuery('');
    setShowDpDrop(false);
    const [a1, a2] = splitAddress(dp.address);
    setRecipientName(dp.dpName || '');
    setRecipientEmail(dp.email || '');
    setAddressLine1(a1);
    setAddressLine2(a2);
    setPinCode(dp.pincode || '');
    setCity('');
    setStateField(dp.state || '');
    setPhone(normalizePhone(dp.mobile));
    clrErr('dp'); clrErr('recipientName'); clrErr('addressLine1'); clrErr('pinCode'); clrErr('state');
  }

  // ── Recipient company combobox handlers ────────────────────────────────────
  function handleRecipientCompSelect(comp) {
    setSelectedRecipientComp(comp);
    setRecipCompQuery('');
    setShowRecipCompDrop(false);
    setRecipientName(comp.issuerName || '');
    setRecipientEmail(comp.email || '');
    const [a1, a2] = splitAddress(comp.address || '');
    setAddressLine1(a1);
    setAddressLine2(a2);
    setPinCode(comp.pincode || '');
    setCity(comp.city || '');
    setStateField(comp.state || '');
    setPhone(normalizePhone(comp.phone));
    clrErr('recipientName'); clrErr('addressLine1'); clrErr('pinCode'); clrErr('city'); clrErr('state');
  }

  function clearRecipientComp() {
    setSelectedRecipientComp(null);
    setRecipCompQuery('');
    setRecipCompSuggestions([]);
    setShowRecipCompDrop(false);
  }

  // ── Recipient-name pick handler (Other radio) ──────────────────────────────
  function handleRecipNameSelect(sug) {
    otherPrefilled.current = true;
    setRecipientName(sug.name);
    setShowOtherDrop(false);
    if (sug.addressLine1)   setAddressLine1(sug.addressLine1);
    if (sug.addressLine2)   setAddressLine2(sug.addressLine2);
    if (sug.city)           setCity(sug.city);
    if (sug.state)          setStateField(sug.state);
    if (sug.pinCode)        setPinCode(sug.pinCode);
    if (sug.recipientEmail) setRecipientEmail(sug.recipientEmail);
    if (sug.phone)          setPhone(normalizePhone(sug.phone));
    clrErr('recipientName'); clrErr('addressLine1'); clrErr('pinCode'); clrErr('state');
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
    ? (selectedCompany.issuerCode === OTHERS ? 'Others' : (selectedCompany.issuerName || selectedCompany.issuerCode))
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

          {/* Company Name (span 2) — always shown */}
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
                        onClick={() => selectCompany(item)}
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

          {/* Others company name — plain text */}
          {isOthers && (
            <div className="benpos-field">
              <label className="benpos-label">Company Name *</label>
              <input
                type="text"
                className={`benpos-date-input${errors.otherCompName ? ' dk-company-input--error' : ''}`}
                value={otherCompName}
                placeholder="Enter company name"
                onChange={e => { setOtherCompName(e.target.value); clrErr('otherCompName'); }}
              />
              {errors.otherCompName && <span className="ca-err">{errors.otherCompName}</span>}
            </div>
          )}

          {/* ISIN */}
          <div className="benpos-field">
            <label className="benpos-label">ISIN *</label>
            {isOthers ? (
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
            ) : !selectedCompany ? (
              <select className="benpos-select" disabled>
                <option>Select a company first</option>
              </select>
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

          {/* Recipient Type (span 4) */}
          <div className="benpos-field dk-field-span4">
            <label className="benpos-label">Recipient Type *</label>
            <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
              {[['COMPANY', 'Company'], ['DP', 'DP'], ['OTHER', 'Other']].map(([val, lbl]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  <input
                    type="radio"
                    name="recipientType"
                    value={val}
                    checked={recipientType === val}
                    onChange={() => handleRecipientTypeChange(val)}
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                  {lbl}
                </label>
              ))}
            </div>
          </div>

          {/* Recipient company selector (span 2) — COMPANY type only */}
          {recipientType === 'COMPANY' && (
            <div className="benpos-field dk-field-span2" ref={recipCompWrapRef}>
              <label className="benpos-label">Select Recipient Company</label>
              <div className="dk-company-wrap">
                <input
                  type="text"
                  className="dk-company-input"
                  value={selectedRecipientComp ? (selectedRecipientComp.issuerName || selectedRecipientComp.issuerCode) : recipCompQuery}
                  placeholder="— type to search —"
                  onChange={e => {
                    if (selectedRecipientComp) clearRecipientComp();
                    else setRecipCompQuery(e.target.value);
                  }}
                  onFocus={() => {
                    if (!selectedRecipientComp && recipCompSuggestions.length > 0) setShowRecipCompDrop(true);
                  }}
                  onBlur={e => {
                    if (!recipCompWrapRef.current?.contains(e.relatedTarget)) {
                      setTimeout(() => setShowRecipCompDrop(false), 150);
                    }
                  }}
                />
                {showRecipCompDrop && !selectedRecipientComp && (
                  <ul className="dk-company-dropdown">
                    {recipCompSuggestions.length === 0 ? (
                      <li className="dk-company-opt dk-company-opt--hint">Searching…</li>
                    ) : (
                      recipCompSuggestions.map(item => (
                        <li
                          key={item.issuerCode}
                          className="dk-company-opt"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleRecipientCompSelect(item)}
                        >
                          <strong>{item.issuerCode}</strong> — {item.issuerName || ''}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* DP selector (span 2) — DP type only */}
          {recipientType === 'DP' && (
            <div className="benpos-field dk-field-span2" ref={dpWrapRef}>
              <label className="benpos-label">DP *</label>
              <div className="dk-company-wrap">
                <input
                  type="text"
                  className={`dk-company-input${errors.dp ? ' dk-company-input--error' : ''}`}
                  value={selectedDp ? (selectedDp.dpName || selectedDp.dpId) : dpQuery}
                  placeholder="— type to search DP —"
                  onChange={e => {
                    if (selectedDp) { setSelectedDp(null); setDpQuery(e.target.value); }
                    else setDpQuery(e.target.value);
                    clrErr('dp');
                  }}
                  onFocus={() => {
                    if (!selectedDp && dpSuggestions.length > 0) setShowDpDrop(true);
                  }}
                  onBlur={e => {
                    if (!dpWrapRef.current?.contains(e.relatedTarget)) {
                      setTimeout(() => setShowDpDrop(false), 150);
                    }
                  }}
                />
                {showDpDrop && !selectedDp && (
                  <ul className="dk-company-dropdown">
                    {dpSuggestions.length === 0 ? (
                      <li className="dk-company-opt dk-company-opt--hint">Searching…</li>
                    ) : (
                      dpSuggestions.map(dp => (
                        <li
                          key={dp.id ?? dp.dpId}
                          className="dk-company-opt"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleDpSelect(dp)}
                        >
                          <strong>{dp.dpId}</strong> — {dp.dpName}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
              {errors.dp && <span className="ca-err">{errors.dp}</span>}
            </div>
          )}

          {/* Recipient Name (span 2) — autocomplete for OTHER, plain for DP/COMPANY */}
          {recipientType === 'OTHER' ? (
            <div className="benpos-field dk-field-span2" ref={otherWrapRef}>
              <label className="benpos-label">Recipient Name *</label>
              <div className="dk-company-wrap">
                <input
                  type="text"
                  className={`dk-company-input${errors.recipientName ? ' dk-company-input--error' : ''}`}
                  value={recipientName}
                  placeholder="— type to search or enter name —"
                  onChange={e => { setRecipientName(e.target.value); clrErr('recipientName'); }}
                  onFocus={async () => {
                    if (recipientName.trim() === '' && !otherPrefilled.current) {
                      try {
                        const opts = await getOtherRecipients('');
                        setOtherSuggestions(opts);
                        if (opts.length > 0) setShowOtherDrop(true);
                      } catch {}
                    } else if (otherSuggestions.length > 0) {
                      setShowOtherDrop(true);
                    }
                  }}
                  onBlur={e => {
                    if (!otherWrapRef.current?.contains(e.relatedTarget)) {
                      setTimeout(() => setShowOtherDrop(false), 150);
                    }
                  }}
                />
                {showOtherDrop && otherSuggestions.length > 0 && (
                  <ul className="dk-company-dropdown">
                    {otherSuggestions.map((sug, idx) => (
                      <li
                        key={idx}
                        className="dk-company-opt"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleRecipNameSelect(sug)}
                      >
                        {sug.name}
                        {(sug.addressLine1 || sug.state) && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            {[sug.addressLine1, sug.state].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {errors.recipientName && <span className="ca-err">{errors.recipientName}</span>}
            </div>
          ) : (
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
          )}

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
