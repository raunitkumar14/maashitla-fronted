import api from '../api/axios';

const BASE = '/admin/v1/daak';

export async function getDocumentTypes() {
  const res = await api.get(`${BASE}/masters/document-types`);
  return res.data?.data ?? res.data ?? [];
}

export async function getCouriers() {
  const res = await api.get(`${BASE}/masters/couriers`);
  return res.data?.data ?? res.data ?? [];
}

export async function addDocumentType(name, requires_drn) {
  const res = await api.post(`${BASE}/masters/document-types`, { name, requires_drn });
  return res.data?.data ?? res.data;
}

export async function addCourier(name) {
  const res = await api.post(`${BASE}/masters/couriers`, { name });
  return res.data?.data ?? res.data;
}

export async function listInward(params) {
  const res = await api.get(`${BASE}/inward`, { params });
  const d = res.data?.data ?? res.data;
  return { rows: d?.items ?? [], total: d?.total ?? 0 };
}

export async function getInward(id) {
  const res = await api.get(`${BASE}/inward/${id}`);
  return res.data?.data ?? res.data;
}

export async function createInward(payload) {
  const res = await api.post(`${BASE}/inward`, payload);
  return res.data?.data ?? res.data;
}

export async function updateInward(id, payload) {
  const res = await api.put(`${BASE}/inward/${id}`, payload);
  return res.data?.data ?? res.data;
}

export async function exportInward(params) {
  return api.get(`${BASE}/inward/export`, { params, responseType: 'blob' });
}

// ── Outward ────────────────────────────────────────────────────────────────

export async function listOutward(params) {
  const res = await api.get(`${BASE}/outward`, { params });
  const d = res.data?.data ?? res.data;
  return { rows: d?.items ?? [], total: d?.total ?? 0 };
}

export async function getOutward(id) {
  const res = await api.get(`${BASE}/outward/${id}`);
  return res.data?.data ?? res.data;
}

export async function createOutward(payload) {
  const res = await api.post(`${BASE}/outward`, payload);
  return res.data?.data ?? res.data;
}

export async function updateOutward(id, payload) {
  const res = await api.put(`${BASE}/outward/${id}`, payload);
  return res.data?.data ?? res.data;
}

export async function exportOutward(params) {
  return api.get(`${BASE}/outward/export`, { params, responseType: 'blob' });
}

export async function uploadOutward(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post(`${BASE}/outward/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data ?? res.data;
}

const USERS_PAGE_SIZE = 100;
const USERS_MAX_PAGES = 50;

function extractUsersPage(responseData) {
  if (responseData?.data?.items && Array.isArray(responseData.data.items)) {
    return { items: responseData.data.items, totalPages: responseData.data.totalPages ?? 1 };
  }
  if (Array.isArray(responseData?.data))  return { items: responseData.data,  totalPages: 1 };
  if (Array.isArray(responseData?.items)) return { items: responseData.items, totalPages: 1 };
  if (Array.isArray(responseData?.users)) return { items: responseData.users, totalPages: 1 };
  if (Array.isArray(responseData))        return { items: responseData,       totalPages: 1 };
  return { items: [], totalPages: 1 };
}

export async function getUsersForDropdown() {
  let allItems = [];

  for (let page = 1; page <= USERS_MAX_PAGES; page++) {
    const res = await api.get('/admin/v1/users', { params: { page, pageSize: USERS_PAGE_SIZE } });
    const { items, totalPages } = extractUsersPage(res.data);
    allItems = allItems.concat(items);
    if (items.length < USERS_PAGE_SIZE || page >= totalPages) break;
  }

  const active = allItems.filter(u => {
    if ('isActive' in u) return u.isActive !== false;
    if ('status'   in u) return typeof u.status === 'string'
      ? u.status.toUpperCase() === 'ACTIVE'
      : (u.status === 1 || u.status === true);
    return true;
  });

  return active.map(u => ({
    id:         u.id,
    name:       u.name       ?? '',
    email:      u.email      ?? '',
    department: u.department ?? '',
  }));
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
