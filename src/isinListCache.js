import api from './api/axios';

// Module-level cache — same pattern as categoryMappingCache.js
let _isins   = null;
let _promise = null;

// loadAllIsins() is idempotent: first call fetches all pages and caches;
// subsequent calls return the same resolved promise immediately.
// If the fetch fails, _promise is reset so the next call retries.
export async function loadAllIsins() {
  if (_isins !== null) return _isins;
  if (_promise)        return _promise;
  _promise = (async () => {
    const PAGE_SIZE = 500;
    let page = 1;
    let all  = [];
    try {
      while (true) {
        const res  = await api.get('/admin/v1/isins', { params: { pageSize: PAGE_SIZE, page } });
        const data = res.data?.data;
        const items = data?.items ?? [];
        all = all.concat(items);
        const totalCount = data?.totalCount ?? items.length;
        if (all.length >= totalCount || items.length < PAGE_SIZE) break;
        page++;
      }
    } catch (err) {
      _promise = null; // allow retry on next call
      throw err;
    }
    _isins = all;
    return _isins;
  })();
  return _promise;
}
