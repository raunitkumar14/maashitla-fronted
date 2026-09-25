import { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './CompanyDetail.css';
import './CompanyCdsl.css';
import { CompanyCounts } from './CompanyLayout';
import { deriveCategoryDescription } from './deriveCategoryDescription';

// ── Official CDSL column order (105 columns) ──────────────────────────────────

const ALL_COLS = [
  { field: 'isin',                            header: 'ISIN'                                                          },
  { field: 'beneficiaryOwnerAcNo',            header: 'Beneficiary Owner A/c No.'                                     },
  { field: 'firstHolderName',                 header: "First Holder's Name"                                           },
  { field: 'secondHolderName',                header: "Second Holder's Name"                                          },
  { field: 'thirdHolderName',                 header: "Third Holder's Name"                                           },
  { field: 'guardianName',                    header: "Guardian's Name"                                               },
  { field: 'nomineeName',                     header: "Nominee's Name"                                                },
  { field: 'fatherHusbandName',               header: "Father/Husband's Name"                                         },
  { field: 'sexOfFirstHolder',                header: 'Sex of sole/first holder'                                      },
  { field: 'birthDate',                       header: 'Birth Date',                           isDate:    true         },
  { field: 'accountStatus',                   header: 'Account Status'                                                },
  { field: 'boCategory',                      header: 'BO Category'                                                   },
  { field: 'boProduct',                       header: 'BO Product'                                                    },
  { field: 'customerType',                    header: 'Customer Type'                                                 },
  { field: 'categoryDescription',             header: 'Category Description'                                          },
  { field: 'boSubStatus',                     header: 'BO Sub Status'                                                 },
  { field: 'occupation',                      header: 'Occupation'                                                    },
  { field: 'panOfFirstHolder',                header: 'PAN of Sole/First holder'                                      },
  { field: 'panOfSecondHolder',               header: 'PAN of second holder'                                          },
  { field: 'panOfThirdHolder',                header: 'PAN of third holder'                                           },
  { field: 'boFreezeFlag',                    header: 'BO Freeze Flag'                                                },
  { field: 'freezeReasonCode',                header: 'Freeze Reason Code'                                            },
  { field: 'isinStatus',                      header: 'ISIN Status'                                                   },
  { field: 'acOpeningDate',                   header: 'A/C Opening Date',                     isDate:    true         },
  { field: 'sebiRegistrationNo',              header: 'SEBI Registration No'                                          },
  { field: 'stockExchangeId',                 header: 'Stock Exchange ID'                                             },
  { field: 'clearingHouseCorporationId',      header: 'Clearing House / Corporation ID'                               },
  { field: 'cmId',                            header: 'CM Id'                                                         },
  { field: 'tradingId',                       header: 'Trading Id'                                                    },
  { field: 'rbiRegistrationNo',               header: 'RBI Registration No.'                                          },
  { field: 'rbiApprovalDate',                 header: 'RBI Approval Date',                    isDate:    true         },
  { field: 'taxDeductionStatus',              header: 'Tax Deduction Status'                                          },
  { field: 'nationality',                     header: 'Nationality'                                                   },
  { field: 'boCorrespondenceAddress1',        header: 'BO Correspondence Address Line 1'                              },
  { field: 'boCorrespondenceAddress2',        header: 'BO Correspondence Address Line 2'                              },
  { field: 'boCorrespondenceAddress3',        header: 'BO Correspondence Address Line 3'                              },
  { field: 'boCorrespondenceCity',            header: 'BO Correspondence Address City'                                },
  { field: 'boCorrespondenceState',           header: 'BO Correspondence Address State'                               },
  { field: 'boCorrespondenceCountry',         header: 'BO Correspondence Address Country'                             },
  { field: 'boCorrespondencePinCode',         header: 'BO Correspondence Address Pin Code'                            },
  { field: 'boPermanentAddress1',             header: 'BO Address Line 1 (Permanent)'                                 },
  { field: 'boPermanentAddress2',             header: 'BO Address Line 2 (Permanent)'                                 },
  { field: 'boPermanentAddress3',             header: 'BO Address Line 3 (Permanent)'                                 },
  { field: 'boPermanentCity',                 header: 'BO Address City (Permanent)'                                   },
  { field: 'boPermanentState',                header: 'BO Address State (Permanent)'                                  },
  { field: 'boPermanentCountry',              header: 'BO Address Country (Permanent)'                                },
  { field: 'boPermanentPinCode',              header: 'BO Address Pin Code (Permanent)'                               },
  { field: 'primaryMobileNumber',             header: 'Primary Mobile Number'                                         },
  { field: 'secondaryTelephoneNumber',        header: 'Secondary Telephone Number'                                    },
  { field: 'boFaxNumber',                     header: 'BO Fax Number'                                                 },
  { field: 'primaryEmail',                    header: 'Primary E-mail'                                                },
  { field: 'ecsMandateFlag',                  header: 'ECS Mandate Flag'                                              },
  { field: 'dividendMicrNo',                  header: 'Dividend MICR No.(Bank Code)'                                  },
  { field: 'dividendBankIfsc',                header: 'Dividend Bank Branch (IFSC)'                                   },
  { field: 'bankName',                        header: 'Bank Name'                                                     },
  { field: 'bankAddress1',                    header: 'Bank Address Line 1'                                           },
  { field: 'bankAddress2',                    header: 'Bank Address Line 2'                                           },
  { field: 'bankAddress3',                    header: 'Bank Address Line 3'                                           },
  { field: 'bankAddressCity',                 header: 'Bank Address City'                                             },
  { field: 'bankAddressState',                header: 'Bank Address State'                                            },
  { field: 'bankAddressCountry',              header: 'Bank Address Cntry'                                            },
  { field: 'bankAddressZip',                  header: 'Bank Address Zip'                                              },
  { field: 'dividendBankCurrency',            header: 'Dividend Bank Currency'                                        },
  { field: 'dividendBankAccountType',         header: 'Dividend Bank Account Type'                                    },
  { field: 'dividendBankAccountNumber',       header: 'Dividend Bank Account Number'                                  },
  { field: 'totalHolding',                    header: 'Total Holding',                        isNumeric: true         },
  { field: 'totalLockIn',                     header: 'Total Lock-in',                        isNumeric: true         },
  { field: 'pledgeBalance',                   header: 'Pledge Balance',                       isNumeric: true         },
  { field: 'safeKeepBalance',                 header: 'Safe keep Balance',                    isNumeric: true         },
  { field: 'earmarkBalance',                  header: 'Earmark Balance',                      isNumeric: true         },
  { field: 'pendingRematConfirmation',        header: 'Pending Remat Confirmation',           isNumeric: true         },
  { field: 'freeBalance',                     header: 'Free Balance',                         isNumeric: true         },
  { field: 'pendingDematVerification',        header: 'Pending Demat Verification',           isNumeric: true         },
  { field: 'pendingDematConfirmation',        header: 'Pending Demat Confirmation',           isNumeric: true         },
  { field: 'dateOfBenpos',                    header: 'Date Of BenPos',                       isDate:    true         },
  { field: 'pledgeSetupBalance',              header: 'Pledge setup balance',                 isNumeric: true         },
  { field: 'rematAgainstLockInBalance',       header: 'Remat against lock in balance',        isNumeric: true         },
  { field: 'annualReportFlag',                header: 'Annual Report Flag'                                            },
  { field: 'uidOfFirstHolder',                header: 'UID of First Holder'                                           },
  { field: 'uidOfSecondHolder',               header: 'UID of Second Holder'                                          },
  { field: 'uidOfThirdHolder',                header: 'UID of Third Holder'                                           },
  { field: 'panOfGuardian',                   header: 'PAN of Guardian'                                               },
  { field: 'uidOfGuardian',                   header: 'UID of Guardian'                                               },
  { field: 'custodianPmsEmail',               header: 'Custodian / PMS email Address'                                 },
  { field: 'legalEntityIdentifier',           header: 'Legal Entity Identifier'                                       },
  { field: 'filler1',                         header: 'Filler1'                                                       },
  { field: 'filler2',                         header: 'Filler2'                                                       },
  { field: 'boRgessFlag',                     header: 'BO RGESS FLAG'                                                 },
  { field: 'modeOfOperation',                 header: 'MODE OF OPERATION'                                             },
  { field: 'communicationPreference',         header: 'COMMUNICATION PREFERENCE'                                      },
  { field: 'filler3',                         header: 'Filler3'                                                       },
  { field: 'filler4',                         header: 'Filler4'                                                       },
  { field: 'nomineeGuardianName',             header: "Nominee's Guardian Name"                                       },
  { field: 'nomineeRelationshipWithBo',       header: 'Nominee relationship with BO'                                  },
  { field: 'nomineePercentageOfShares',       header: 'Nominee percentage of shares',         isNumeric: true         },
  { field: 'secondNomineeName',               header: "Second Nominee's Name"                                         },
  { field: 'secondNomineeGuardianName',       header: "Second Nominee's Guardian Name"                                },
  { field: 'secondNomineeRelationshipWithBo', header: 'Second nominee relationship with BO'                           },
  { field: 'secondNomineePercentageOfShares', header: 'Second Nominee percentage of shares',  isNumeric: true         },
  { field: 'thirdNomineeName',                header: "Third Nominee's Name"                                          },
  { field: 'thirdNomineeGuardianName',        header: "Third Nominee's Guardian Name"                                 },
  { field: 'thirdNomineeRelationshipWithBo',  header: 'Third nominee relationship with BO'                            },
  { field: 'thirdNomineePercentageOfShares',  header: 'Third Nominee percentage of shares',   isNumeric: true         },
  { field: 'nduBalance',                      header: 'NDU Balance',                          isNumeric: true         },
  { field: 'otherEncumberedBalance',          header: 'Other Encumbered Balance',             isNumeric: true         },
  { field: 'beneficiaryIsinDate',             header: 'beneficiary_isin_date'                                         },
];

const ALL_FIELDS  = ALL_COLS.map(c => c.field);
const SS_COLS_KEY = 'cdsl_cols_selected';

function loadSelectedFields() {
  try {
    const raw = sessionStorage.getItem(SS_COLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const allFieldSet = new Set(ALL_FIELDS);
        // Drop stale fields (removed from spec), then add any new ones (default checked).
        const stored = new Set(parsed.filter(f => allFieldSet.has(f)));
        for (const f of ALL_FIELDS) stored.add(f);
        return stored;
      }
    }
  } catch {}
  return new Set(ALL_FIELDS);
}

function saveSelectedFields(set) {
  try { sessionStorage.setItem(SS_COLS_KEY, JSON.stringify([...set])); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(val) {
  if (val == null || val === '') return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toISOString().slice(0, 10);
}

function getPageRange(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages       = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd   = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2)            pages.push('...');
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);
  if (windowEnd < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

// ── PaginationBar ─────────────────────────────────────────────────────────────

function PaginationBar({ page, perPage, totalCount, totalPages, goto, setPage, setGoto, onGoto }) {
  const first = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const last  = Math.min(page * perPage, totalCount);
  return (
    <div className="im-pagination">
      <span className="pagination-info">
        {totalCount === 0
          ? 'Showing 0 entries'
          : `Showing ${first} to ${last} of ${totalCount} entries`}
      </span>
      <div className="pagination-controls">
        {getPageRange(page, totalPages).map((item, idx) =>
          item === '...'
            ? <span key={`e-${idx}`} className="page-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`page-btn${item === page ? ' page-btn--active' : ''}`}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            )
        )}
        <span className="goto-label">Go to:</span>
        <input
          className="goto-input"
          type="number"
          min={1}
          max={totalPages || 1}
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

// ── SelectColumnsPopover ──────────────────────────────────────────────────────

function SelectColumnsPopover({ selectedFields, onChange }) {
  const [open,    setOpen]   = useState(false);
  const [search,  setSearch] = useState('');
  const btnRef  = useRef(null);
  const dropRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 880 });

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (btnRef.current?.contains(e.target) || dropRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect     = btnRef.current.getBoundingClientRect();
      const popWidth = Math.min(880, window.innerWidth - 32);
      let left = rect.right - popWidth;
      if (left < 16) left = 16;
      setDropPos({ top: rect.bottom + 6, left, width: popWidth });
    }
    setOpen(o => !o);
    if (open) setSearch('');
  }

  function toggle(field) {
    const next = new Set(selectedFields);
    if (next.has(field)) next.delete(field); else next.add(field);
    onChange(next);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? ALL_COLS.filter(c =>
        c.header.toLowerCase().includes(q) || c.field.toLowerCase().includes(q)
      )
    : ALL_COLS;

  return (
    <>
      <button ref={btnRef} className="btn-action btn-action--white" onClick={handleToggle}>
        ⊞ Select Columns ({selectedFields.size}/{ALL_COLS.length})
      </button>
      {open && (
        <div
          ref={dropRef}
          className="cdsl-col-dropdown"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          <div className="cdsl-col-toolbar">
            <input
              className="cdsl-col-search"
              placeholder="Filter columns…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <button className="cdsl-col-action-btn" onClick={() => onChange(new Set(ALL_FIELDS))}>
              Select All
            </button>
            <button className="cdsl-col-action-btn" onClick={() => onChange(new Set())}>
              Clear All
            </button>
          </div>
          <div className="cdsl-col-grid">
            {filtered.map((col, idx) => (
              <label key={`${col.field}-${idx}`} className="cdsl-col-option">
                <input
                  type="checkbox"
                  checked={selectedFields.has(col.field)}
                  onChange={() => toggle(col.field)}
                />
                <span className="cdsl-col-label">{col.header}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="cdsl-col-empty">No columns match "{search}"</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

function CompanyCdsl() {
  const { issuerCode } = useParams();
  const location       = useLocation();

  const isinCode = location.state?.isinCode
    ?? (() => { try { return sessionStorage.getItem(`co_isin_${issuerCode}`) ?? ''; } catch { return ''; } })();

  const { setCdslCount } = useContext(CompanyCounts);

  const [rows,    setRows]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [goto,    setGoto]    = useState('');

  const [selectedFields, setSelectedFields] = useState(() => loadSelectedFields());

  useEffect(() => { saveSelectedFields(selectedFields); }, [selectedFields]);
  useEffect(() => { setPage(1); }, [rows]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res      = await api.get('/admin/v1/benpos-cdsl', {
          params: { isin: isinCode, pageSize: 500, page: 1 },
        });
        if (cancelled) return;

        const allItems   = res.data?.data?.items ?? [];
        const totalCount = res.data?.data?.totalCount ?? allItems.length;

        // Client-side ISIN guard: harmless if the backend ?isin param already
        // filters, but ensures correctness if it doesn't (like Physical's pattern).
        const items = isinCode
          ? allItems.filter(r => r.isin === isinCode)
          : allItems;

        setRows(items);
        setCdslCount(totalCount);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load CDSL records.');
        setRows([]);
        setCdslCount(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGoto() {
    const t = parseInt(goto, 10);
    if (!isNaN(t) && t >= 1 && t <= totalPages) setPage(t);
    setGoto('');
  }

  const displayRows = rows ?? [];
  const totalCount  = displayRows.length;
  const totalPages  = Math.max(1, Math.ceil(totalCount / perPage));
  const pageRows    = displayRows.slice((page - 1) * perPage, page * perPage);

  const activeCols  = ALL_COLS.filter(c => selectedFields.has(c.field));
  const colSpan     = activeCols.length || 1;

  function renderCell(col, row) {
    if (col.field === 'categoryDescription') {
      if (row === pageRows[0]) {
        console.log('[CDSL debug] customerType:', row.customerType, typeof row.customerType);
        console.log('[CDSL debug] boSubStatus:', row.boSubStatus, typeof row.boSubStatus);
        console.log('[CDSL debug] result:', deriveCategoryDescription('CDSL', row.customerType, row.boSubStatus));
      }
      const result = deriveCategoryDescription('CDSL', row.customerType, row.boSubStatus);
      if (result.resolved) return result.description ?? '—';
      const raw = String(row.customerType ?? '').trim();
      if (!raw) return '—';
      return (
        <span title="Category code has multiple possible descriptions - couldn't resolve exactly with available data">
          {raw} ⚠
        </span>
      );
    }
    const val = row[col.field];
    if (col.isDate)                                     return formatDate(val);
    if (val === undefined || val === null || val === '') return '—';
    return val;
  }

  return (
    <div className="isin-master">
      <div className="im-card">

        <div className="im-card-header">
          <span>Benpos CDSL</span>
          <div className="im-header-actions">
            <SelectColumnsPopover selectedFields={selectedFields} onChange={setSelectedFields} />
            <label className="entries-label">
              Entries per page
              <select
                className="entries-select"
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="im-banner im-banner--error" style={{ margin: '10px 14px' }}>
            {error}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {activeCols.map((col, idx) => (
                  <th
                    key={`${col.field}-${idx}`}
                    style={col.isNumeric ? { textAlign: 'right' } : undefined}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="im-empty-state" colSpan={colSpan}>Loading…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={colSpan}>
                    No Benpos CDSL records found for this ISIN.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => (
                  <tr key={`${row.beneficiaryOwnerAcNo ?? ''}-${idx}`}>
                    {activeCols.map((col, ci) => (
                      <td
                        key={`${col.field}-${ci}`}
                        style={col.isNumeric ? { textAlign: 'right' } : undefined}
                      >
                        {renderCell(col, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}         perPage={perPage}
          totalCount={rows === null ? 0 : totalCount}
          totalPages={rows === null ? 0 : totalPages}
          goto={goto}         setPage={setPage}
          setGoto={setGoto}   onGoto={handleGoto}
        />

      </div>
    </div>
  );
}

export default CompanyCdsl;
