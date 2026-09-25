import { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './CompanyDetail.css';
import './CompanyNsdl.css';
import { CompanyCounts } from './CompanyLayout';

// ── Official NSDL column order (78 columns) ───────────────────────────────────
// Matches the NSDL file layout spec exactly. All checked by default.

const ALL_COLS = [
  { field: 'recordType',                                      header: 'Record Type'                                                             },
  { field: 'lineNumber',                                      header: 'Line Number'                                                             },
  { field: 'dpId',                                            header: 'DP ID'                                                                   },
  { field: 'beneficiaryAccountNumber',                        header: 'Beneficiary Account Number'                                              },
  { field: 'beneficiaryType',                                 header: 'Beneficiary Type'                                                        },
  { field: 'beneficiarySubType',                              header: 'Beneficiary sub type'                                                    },
  { field: 'beneficiaryAccountCategory',                      header: 'Beneficiary Account Category'                                            },
  { field: 'beneficiaryOccupation',                           header: 'Beneficiary Occupation'                                                  },
  { field: 'firstHolderName',                                 header: "First Holder's Name/BP Name"                                             },
  { field: 'firstHolderFatherHusbandName',                    header: "First Holder's Father/Husband name"                                      },
  { field: 'beneficiaryAddress1',                             header: 'Beneficiary Address Part 1/BP Addr 1'                                    },
  { field: 'beneficiaryAddress2',                             header: 'Beneficiary Address Part 2/BP Addr 2'                                    },
  { field: 'beneficiaryAddress3',                             header: 'Beneficiary Address Part 3/BP Addr 3'                                    },
  { field: 'beneficiaryAddress4',                             header: 'Beneficiary Address Part 4/BP Addr 4'                                    },
  { field: 'beneficiaryPinCode',                              header: 'Beneficiary Address Pin code/BP Pin Code'                                },
  { field: 'beneficiaryPhoneNumber',                          header: 'Beneficiary Phone Number/BP Phone No'                                    },
  { field: 'beneficiaryFaxNumber',                            header: 'Beneficiary Fax Number/BP Fax No'                                        },
  { field: 'secondHolderName',                                header: "Second Holder's Name"                                                    },
  { field: 'secondHolderFatherHusbandName',                   header: "Second Holder's Father/Husband name"                                     },
  { field: 'thirdHolderName',                                 header: "Third Holder's Name"                                                     },
  { field: 'thirdHolderFatherHusbandName',                    header: "Third Holder's Father/Husband name"                                      },
  { field: 'filler1',                                         header: 'Filler 1'                                                                },
  { field: 'filler2',                                         header: 'Filler 2'                                                                },
  { field: 'firstHolderPan',                                  header: "First holder's Income Tax PAN"                                           },
  { field: 'secondHolderPan',                                 header: "Second holder's Income Tax PAN"                                          },
  { field: 'thirdHolderPan',                                  header: "Third holder's Income Tax PAN"                                           },
  { field: 'nomineeGuardianIndicator',                        header: 'Nominee/Guardian Indicator'                                              },
  { field: 'nomineeGuardianName',                             header: 'Nominee/Guardian Name'                                                   },
  { field: 'nomineeGuardianAddress1',                         header: 'Nominee/Guardian Address Part 1'                                         },
  { field: 'nomineeGuardianAddress2',                         header: 'Nominee/Guardian Address Part 2'                                         },
  { field: 'nomineeGuardianAddress3',                         header: 'Nominee/Guardian Address Part 3'                                         },
  { field: 'nomineeGuardianAddress4',                         header: 'Nominee/Guardian Address Part 4'                                         },
  { field: 'nomineeGuardianPinCode',                          header: 'Nominee/Guardian Address Pin code'                                       },
  { field: 'minorDateOfBirth',                                header: 'Date of Birth in case of minor',              isDate:    true             },
  { field: 'minorIndicator',                                  header: 'Minor Indicator'                                                         },
  { field: 'beneficiaryBankAccountNumber',                    header: 'Beneficiary Bank Account Number'                                         },
  { field: 'bankNameAndBranch',                               header: 'Bank Name and Branch'                                                    },
  { field: 'bankAddress1',                                    header: 'Bank Address Part 1'                                                     },
  { field: 'bankAddress2',                                    header: 'Bank Address Part 2'                                                     },
  { field: 'bankAddress3',                                    header: 'Bank Address Part 3'                                                     },
  { field: 'bankAddress4',                                    header: 'Bank Address Part 4'                                                     },
  { field: 'bankAddressPinCode',                              header: 'Bank Address Pin code'                                                   },
  { field: 'rbiReferenceNumber',                              header: 'RBI Reference Number (In case of NRI)'                                   },
  { field: 'rbiApprovalDate',                                 header: 'RBI Approval Date (In case of NRI)',          isDate:    true             },
  { field: 'sebiRegistrationNumber',                          header: 'SEBI Registration Number'                                                },
  { field: 'beneficiaryTaxDeductionStatus',                   header: 'Beneficiary Tax Deduction Status'                                        },
  { field: 'beneficiaryStatus',                               header: 'Beneficiary Status'                                                      },
  { field: 'beneficiaryFreePositions',                        header: 'Beneficiary Free Positions',                  isNumeric: true             },
  { field: 'beneficiaryLockInPositions',                      header: 'Beneficiary Lock-in Positions',               isNumeric: true             },
  { field: 'beneficiaryBlockPositions',                       header: 'Beneficiary Block Positions',                 isNumeric: true             },
  { field: 'beneficiaryPledgedPositions',                     header: 'Beneficiary Pledged Positions',               isNumeric: true             },
  { field: 'beneficiaryPledgedWithLockInPositions',           header: 'Beneficiary Pledged with Lock-in Positions',  isNumeric: true             },
  { field: 'beneficiaryPledgedUnconfirmedPositions',          header: 'Beneficiary Pledged Unconfirmed Positions',   isNumeric: true             },
  { field: 'beneficiaryUnconfirmedPledgedWithLockInPositions',header: 'Beneficiary Un confirmed Pledged with Lock-in Positions', isNumeric: true },
  { field: 'beneficiaryRematPositions',                       header: 'Beneficiary Remat Positions',                 isNumeric: true             },
  { field: 'beneficiaryRematLockInPositions',                 header: 'Beneficiary Remat Lock-in Positions',         isNumeric: true             },
  { field: 'beneficiaryCmIddPositions',                       header: 'Beneficiary/CM IDD Positions',                isNumeric: true             },
  { field: 'cmPoolPositions',                                 header: 'CM Pool Positions (this will include Pool + delivery)', isNumeric: true   },
  { field: 'ccSettlementPositions',                           header: 'CC Settlement Positions',                     isNumeric: true             },
  { field: 'micrCode',                                        header: 'MICR Code'                                                               },
  { field: 'ifsc',                                            header: 'IFSC'                                                                    },
  { field: 'bankAccountType',                                 header: 'Bank Account Type'                                                       },
  { field: 'filler3',                                         header: 'Filler 3'                                                                },
  { field: 'firstHolderMapinId',                              header: 'First Holder Mapin ID'                                                   },
  { field: 'secondHolderMapinId',                             header: 'Second Holder Mapin ID'                                                  },
  { field: 'thirdHolderMapinId',                              header: 'Third Holder Mapin ID'                                                   },
  { field: 'firstHolderEmailId',                              header: 'First Holder Email ID'                                                   },
  { field: 'secondHolderEmailId',                             header: 'Second Holder Email ID'                                                  },
  { field: 'thirdHolderEmailId',                              header: 'Third Holder Email ID'                                                   },
  { field: 'rgessFlag',                                       header: 'RGESS Flag'                                                              },
  { field: 'beneficiaryFreePositionsHoldNdu',                 header: 'Beneficiary Free Positions - Hold due to NDU',            isNumeric: true },
  { field: 'beneficiaryLockInPositionsHoldNdu',               header: 'Beneficiary Lock-in Positions - Hold due to NDU',         isNumeric: true },
  { field: 'beneficiaryUnconfirmedFreePositionsHoldNdu',      header: 'Beneficiary Unconfirmed Free Positions - Hold due to NDU',isNumeric: true },
  { field: 'beneficiaryUnconfirmedLockInPositionsHoldNdu',    header: 'Beneficiary Unconfirmed Lock-in Positions - Hold due to NDU', isNumeric: true },
  { field: 'filler4',                                         header: 'Filler 4'                                                                },
  { field: 'isin',                                            header: 'ISIN'                                                                    },
  { field: 'date',                                            header: 'Date',                                        isDate:    true             },
  { field: 'dpBenIsinDate',                                   header: 'dp_ben_isin_date',                            isDate:    true             },
];

// All 78 fields, in spec order — this is the default checked state.
const ALL_FIELDS = ALL_COLS.map(c => c.field);

const SS_COLS_KEY = 'nsdl_cols_selected';

function loadSelectedFields() {
  try {
    const raw = sessionStorage.getItem(SS_COLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const stored = new Set(parsed);
        // Any field in ALL_FIELDS not yet in stored is a newly-added column — check it by default.
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

// ── PaginationBar (same pattern as CompanyPhysical) ───────────────────────────

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
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
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
          className="nsdl-col-dropdown"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          <div className="nsdl-col-toolbar">
            <input
              className="nsdl-col-search"
              placeholder="Filter columns…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <button className="nsdl-col-action-btn" onClick={() => onChange(new Set(ALL_FIELDS))}>
              Select All
            </button>
            <button className="nsdl-col-action-btn" onClick={() => onChange(new Set())}>
              Clear All
            </button>
          </div>
          <div className="nsdl-col-grid">
            {filtered.map((col, idx) => (
              <label key={`${col.field}-${idx}`} className="nsdl-col-option">
                <input
                  type="checkbox"
                  checked={selectedFields.has(col.field)}
                  onChange={() => toggle(col.field)}
                />
                <span className="nsdl-col-label">{col.header}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="nsdl-col-empty">No columns match "{search}"</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

function CompanyNsdl() {
  const { issuerCode } = useParams();
  const location       = useLocation();

  const isinCode = location.state?.isinCode
    ?? (() => { try { return sessionStorage.getItem(`co_isin_${issuerCode}`) ?? ''; } catch { return ''; } })();

  const { setNsdlCount } = useContext(CompanyCounts);

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
        const res        = await api.get('/admin/v1/benpos-nsdl', {
          params: { isin: isinCode, pageSize: 500, page: 1 },
        });
        if (cancelled) return;
        const items      = res.data?.data?.items ?? [];
        const totalCount = res.data?.data?.totalCount ?? items.length;
        setRows(items);
        setNsdlCount(totalCount);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error?.message ?? err.message ?? 'Failed to load NSDL records.');
        setRows([]);
        setNsdlCount(0);
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

  // Preserve the spec-defined column order; only include checked fields.
  const activeCols  = ALL_COLS.filter(c => selectedFields.has(c.field));
  const colSpan     = activeCols.length || 1;

  function renderCell(col, row) {
    const val = row[col.field];
    if (col.isDate)                                    return formatDate(val);
    if (val === undefined || val === null || val === '') return '—';
    return val;
  }

  return (
    <div className="isin-master">
      <div className="im-card">

        <div className="im-card-header">
          <span>Benpos NSDL</span>
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
                    No Benpos NSDL records found for this ISIN.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => (
                  <tr key={`${row.beneficiaryAccountNumber ?? ''}-${idx}`}>
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

export default CompanyNsdl;
