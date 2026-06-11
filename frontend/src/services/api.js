import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});


api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);


export const deviceApi = {

  getStatus: () => api.get('/device/status'),


  getHistory: (params = {}) => api.get('/device/history', { params }),


  getData: (params = {}) => api.get('/device', { params }),


  postData: (payload) => api.post('/device', payload),


  putData: (payload) => api.put('/device', payload),


  deleteData: (params = {}) => api.delete('/device', { params }),


  deleteAll: () => api.delete('/device/all'),



  connect: (payload) => api.post('/device/connect', payload),


  disconnect: (deviceName) =>
    api.post('/device/connect', { action: 'disconnect', deviceName }),


  health: () => api.get('/health'),
};

export default api;
