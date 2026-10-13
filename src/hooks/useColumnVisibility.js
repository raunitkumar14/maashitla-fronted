import { useState, useCallback } from 'react';

const STORAGE_PREFIX = 'colvis:v1:';

function getDefaults(columns) {
  const map = {};
  for (const col of columns) {
    map[col.key] = col.locked ? true : (col.defaultVisible !== false);
  }
  return map;
}

function loadFromStorage(tableKey, columns) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (typeof saved !== 'object' || Array.isArray(saved) || saved === null) return null;
    const map = {};
    for (const col of columns) {
      if (col.locked) {
        map[col.key] = true;
      } else if (Object.prototype.hasOwnProperty.call(saved, col.key) && typeof saved[col.key] === 'boolean') {
        map[col.key] = saved[col.key];
      } else {
        // key not in saved (new column) — use defaultVisible
        map[col.key] = col.defaultVisible !== false;
      }
    }
    return map;
  } catch {
    return null;
  }
}

function saveToStorage(tableKey, map) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(map));
  } catch {
    // storage blocked or quota exceeded — silent
  }
}

export function useColumnVisibility(tableKey, columns) {
  const [visibleKeys, setVisibleKeys] = useState(
    () => loadFromStorage(tableKey, columns) ?? getDefaults(columns)
  );

  const isVisible = useCallback((key) => !!visibleKeys[key], [visibleKeys]);

  const toggle = useCallback((key) => {
    setVisibleKeys(prev => {
      const col = columns.find(c => c.key === key);
      if (!col || col.locked) return prev;
      const visCount = Object.values(prev).filter(Boolean).length;
      if (prev[key] && visCount <= 1) return prev; // must keep at least one visible
      const next = { ...prev, [key]: !prev[key] };
      saveToStorage(tableKey, next);
      return next;
    });
  }, [tableKey, columns]);

  const setAll = useCallback((bool) => {
    setVisibleKeys(() => {
      const next = {};
      for (const col of columns) {
        next[col.key] = col.locked ? true : bool;
      }
      // When clearing, ensure at least one column stays visible
      if (!bool && !columns.some(c => c.locked)) {
        next[columns[0].key] = true;
      }
      saveToStorage(tableKey, next);
      return next;
    });
  }, [tableKey, columns]);

  // Set all non-locked columns in a specific group of keys to bool.
  // Guarantees at least one column stays visible globally.
  const setGroup = useCallback((keys, bool) => {
    setVisibleKeys(prev => {
      const keySet = new Set(keys);
      const next = { ...prev };
      for (const key of keys) {
        const col = columns.find(c => c.key === key);
        if (!col || col.locked) continue;
        next[key] = bool;
      }
      if (!bool && !Object.values(next).some(Boolean)) {
        const outside = columns.find(c => !c.locked && !keySet.has(c.key));
        if (outside) {
          next[outside.key] = true;
        } else {
          const first = columns.find(c => !c.locked && keySet.has(c.key));
          if (first) next[first.key] = true;
        }
      }
      saveToStorage(tableKey, next);
      return next;
    });
  }, [tableKey, columns]);

  const reset = useCallback(() => {
    const d = getDefaults(columns);
    saveToStorage(tableKey, d);
    setVisibleKeys(d);
  }, [tableKey, columns]);

  return { visibleKeys, isVisible, toggle, setAll, setGroup, reset };
}
