import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Response interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);

// ─── Device API ────────
export const deviceApi = {
  /** GET /device/status */
  getStatus: () => api.get('/device/status'),

  /** GET /device/history?deviceId=X&limit=N&page=N */
  getHistory: (params = {}) => api.get('/device/history', { params }),

  /** GET /device?deviceId=X&limit=N&page=N */
  getData: (params = {}) => api.get('/device', { params }),

  /** POST /device — save a real reading */
  postData: (payload) => api.post('/device', payload),

  /** PUT /device — update a reading */
  putData: (payload) => api.put('/device', payload),

  /** DELETE /device?deviceId=X — delete readings */
  deleteData: (params = {}) => api.delete('/device', { params }),

  /** DELETE /device/all — wipe ALL records */
  deleteAll: () => api.delete('/device/all'),


  /** POST /device/connect */
  connect: (payload) => api.post('/device/connect', payload),

  /** POST /device/connect (disconnect action) */
  disconnect: (deviceName) =>
    api.post('/device/connect', { action: 'disconnect', deviceName }),

  /** GET /health */
  health: () => api.get('/health'),
};

export default api;
