import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Attach the JWT from localStorage to every outgoing request.
// This runs before the request is sent, so every API call is automatically
// authenticated without having to pass the token manually each time.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle authentication failures globally.
// When the server returns 401 with SESSION_REVOKED, the token is expired or
// invalidated server-side — there's no point retrying, so we wipe local auth
// state and send the user back to the login page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    if (status === 401 && code === 'SESSION_REVOKED') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
