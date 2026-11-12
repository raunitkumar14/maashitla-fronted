import api from '../api/axios';

const BASE = '/admin/v1/dp-master';

export function normalizeDp(raw) {
  return {
    id:      raw.id,
    dpId:    raw.dpId    ?? raw.dp_id    ?? '',
    dpName:  raw.dpName  ?? raw.dp_name  ?? '',
    mobile:  raw.mobile  ?? '',
    address: raw.address ?? '',
    email:   raw.email   ?? '',
    state:   raw.state   ?? '',
    pincode: raw.pincode ?? '',
  };
}

export async function list({ search = '', page = 1, limit = 20 } = {}) {
  const res = await api.get(BASE, { params: { search, page, limit } });
  const d   = res.data?.data ?? res.data;
  const raw = d?.items ?? d?.rows ?? [];
  return {
    items:      raw.map(normalizeDp),
    total:      d?.total ?? d?.totalCount ?? 0,
    totalPages: d?.totalPages ?? Math.max(1, Math.ceil((d?.total ?? 0) / limit)),
  };
}

export async function create(payload) {
  const res = await api.post(BASE, payload);
  return res.data?.data ?? res.data;
}

export async function update(id, payload) {
  const res = await api.put(`${BASE}/${id}`, payload);
  return res.data?.data ?? res.data;
}

export async function remove(id) {
  await api.delete(`${BASE}/${id}`);
}

export async function getImportTemplate() {
  return api.get(`${BASE}/import-template`, { responseType: 'blob' });
}

export async function importFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post(`${BASE}/import`, fd);
  return res.data?.data ?? res.data;
}

export function normalizeDpOption(raw) {
  return {
    id:      raw.id,
    dpId:    raw.dpId    ?? raw.dp_id    ?? '',
    dpName:  raw.dpName  ?? raw.dp_name  ?? '',
    address: raw.address ?? '',
    mobile:  raw.mobile  ?? '',
    email:   raw.email   ?? '',
    state:   raw.state   ?? '',
    pincode: raw.pincode ?? '',
  };
}

export async function getDpOptions(search = '') {
  const res = await api.get(`${BASE}/options`, { params: { search } });
  const raw = res.data?.data ?? res.data;
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.rows ?? []);
  return arr.map(normalizeDpOption);
}
