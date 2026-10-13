import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './ColumnSelector.css';

export function ColumnSelector({
  columns,
  visibleKeys,
  onToggle,
  onSetAll,
  onSetGroup,   // optional — enables per-group All/None buttons
  onReset,
}) {
  const [open,   setOpen]   = useState(false);
  const [pos,    setPos]    = useState({ top: 0, right: 0 });
  const [search, setSearch] = useState('');
  const btnRef     = useRef(null);
  const popoverRef = useRef(null);

  const visCount  = columns.filter(c => visibleKeys[c.key]).length;
  const hasGroups = columns.some(c => c.group);

  // Build group structure once (order preserved from columns array)
  const groupOrder = [];
  const groupedMap  = {};
  if (hasGroups) {
    for (const col of columns) {
      const g = col.group ?? '__ungrouped__';
      if (!groupedMap[g]) { groupOrder.push(g); groupedMap[g] = []; }
      groupedMap[g].push(col);
    }
  }

  function handleBtnClick() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  }

  // Clear the search filter whenever the popover is closed
  useEffect(() => { if (!open) setSearch(''); }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        btnRef.current    && !btnRef.current.contains(e.target)
      ) setOpen(false);
    }
    function onEscape(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown',   onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown',   onEscape);
    };
  }, [open]);

  const lowerSearch = search.toLowerCase();

  function renderCheckbox(col) {
    const checked  = !!visibleKeys[col.key];
    const disabled = !!col.locked || (checked && visCount <= 1);
    return (
      <label
        key={col.key}
        className={`col-sel-item${disabled ? ' col-sel-item--disabled' : ''}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(col.key)}
        />
        <span>{col.label}</span>
      </label>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="col-sel-btn"
        onClick={handleBtnClick}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Columns ({visCount}/{columns.length})
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={popoverRef}
          className="col-sel-popover"
          role="dialog"
          aria-label="Show/hide columns"
          style={{ top: pos.top, right: pos.right }}
        >
          {/* Search */}
          <div className="col-sel-search">
            <input
              className="col-sel-search-input"
              type="text"
              placeholder="Search column…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Global actions */}
          <div className="col-sel-actions">
            <button type="button" className="col-sel-act" onClick={() => onSetAll(true)}>
              Select all
            </button>
            <span className="col-sel-sep" aria-hidden="true">·</span>
            <button type="button" className="col-sel-act" onClick={() => onSetAll(false)}>
              Clear
            </button>
            <span className="col-sel-sep" aria-hidden="true">·</span>
            <button type="button" className="col-sel-act" onClick={onReset}>
              Reset to default
            </button>
          </div>

          {/* Column list — grouped or flat */}
          <div className="col-sel-list">
            {hasGroups ? (
              groupOrder.map(grp => {
                const grpCols = groupedMap[grp];
                const displayed = lowerSearch
                  ? grpCols.filter(c => c.label.toLowerCase().includes(lowerSearch))
                  : grpCols;
                if (displayed.length === 0) return null;
                const nonLockedKeys = grpCols.filter(c => !c.locked).map(c => c.key);
                return (
                  <div key={grp} className="col-sel-group">
                    {grp !== '__ungrouped__' && (
                      <div className="col-sel-group-hd">
                        <span className="col-sel-group-name">{grp}</span>
                        {onSetGroup && nonLockedKeys.length > 0 && (
                          <div className="col-sel-group-acts">
                            <button
                              type="button"
                              className="col-sel-group-act"
                              onClick={() => onSetGroup(nonLockedKeys, true)}
                            >
                              All
                            </button>
                            <button
                              type="button"
                              className="col-sel-group-act"
                              onClick={() => onSetGroup(nonLockedKeys, false)}
                            >
                              None
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {displayed.map(col => renderCheckbox(col))}
                  </div>
                );
              })
            ) : (
              (lowerSearch
                ? columns.filter(c => c.label.toLowerCase().includes(lowerSearch))
                : columns
              ).map(col => renderCheckbox(col))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
