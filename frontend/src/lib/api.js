// frontend/src/lib/api.js
import axios from 'axios';
import { API_ENDPOINTS } from 'constants'; // Absolute import working!
import logger from 'lib/utils/logger';

// --- Axios Configuration ---
const API_URL = process.env.REACT_APP_API_BASE_URL;
const getAuthToken = () => localStorage.getItem('auth_token');

let authRefresher = null;
let currentCsrfToken = null;

export const setAuthRefresher = (refresher) => {
  authRefresher = refresher;
};

export const setApiServiceCsrfToken = (token) => {
  currentCsrfToken = token;
};

export const getApiServiceCsrfToken = () => currentCsrfToken;

// --- The Core Client ---
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
  },
});

// --- CSRF Logic ---
export const fetchAndSetCsrfToken = async () => {
  try {
    const response = await apiClient.get(API_ENDPOINTS.AUTH_CSRF);
    const newCsrfToken = response.headers['x-csrf-token'] || response.data?.csrfToken;
    if (newCsrfToken) {
      setApiServiceCsrfToken(newCsrfToken);
      return newCsrfToken;
    }
    logger.warn('CSRF token not found in response');
    return null;
  } catch (error) {
    logger.error('Error fetching CSRF token:', error);
    if (error.response && error.response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'CSRF fetch unauthorized' }));
    }
    return null;
  }
};

// --- Interceptors ---
apiClient.interceptors.request.use(
  async (config) => {
    const authToken = getAuthToken();
    if (authToken) config.headers['Authorization'] = `Bearer ${authToken}`;

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else {
      config.headers['Content-Type'] = 'application/json';
    }

    const method = config.method?.toLowerCase();
    if (['post', 'put', 'delete', 'patch'].includes(method)) {
      const csrfTokenToUse = getApiServiceCsrfToken() || await fetchAndSetCsrfToken();
      if (csrfTokenToUse) {
        config.headers['X-CSRF-Token'] = csrfTokenToUse;
      } else {
        return Promise.reject(new axios.Cancel('CSRF token fetch failed.'));
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      if (authRefresher) {
        try {
          const newAccessToken = await authRefresher();
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          return Promise.reject(refreshError);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;