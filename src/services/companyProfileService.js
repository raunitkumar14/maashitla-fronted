import api from '../api/axios';

const BASE = '/admin/v1/company-profile';

export async function get() {
  const res = await api.get(BASE);
  return res.data?.data?.profile ?? {};
}

export async function update(payload) {
  const res = await api.put(BASE, payload);
  return res.data?.data?.profile ?? {};
}

export async function clear() {
  const res = await api.delete(BASE);
  return res.data?.data?.profile ?? {};
}
