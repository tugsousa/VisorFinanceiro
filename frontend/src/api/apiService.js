// frontend/src/api/apiService.js
import axios from 'axios';
import { API_ENDPOINTS } from '../constants';

// This is a simplified way to access tokens.
const getAuthToken = () => localStorage.getItem('auth_token');

let currentCsrfToken = null;

export const setApiServiceCsrfToken = (token) => {
  currentCsrfToken = token;
  // console.log('apiService: CSRF token set to:', token ? token.substring(0, 10) + '...' : null);
};

export const getApiServiceCsrfToken = () => currentCsrfToken;

const apiClient = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

export const fetchAndSetCsrfToken = async () => {
  try {
    // console.log('apiService: Attempting to fetch CSRF token from', API_ENDPOINTS.AUTH_CSRF);
    const response = await apiClient.get(API_ENDPOINTS.AUTH_CSRF);
    const headerToken = response.headers['x-csrf-token'];
    const bodyToken = response.data?.csrfToken;
    const newCsrfToken = headerToken || bodyToken;
    if (newCsrfToken) {
      setApiServiceCsrfToken(newCsrfToken);
      return newCsrfToken;
    }
    console.warn('CSRF token not found in response from ' + API_ENDPOINTS.AUTH_CSRF);
    return null;
  } catch (error) {
    console.error('Error fetching CSRF token via apiService:', error.response?.data || error.message);
    return null;
  }
};

apiClient.interceptors.request.use(
  async (config) => {
    const authToken = getAuthToken();
    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Add CSRF token for all requests except the CSRF fetch endpoint itself and OPTIONS
    // This is the key change: CSRF token is now added for GET requests too if backend expects it.
    if (config.url !== API_ENDPOINTS.AUTH_CSRF && (!config.method || config.method.toLowerCase() !== 'options')) {
      let csrfTokenToUse = getApiServiceCsrfToken();
      if (!csrfTokenToUse) {
        // console.log(`apiService Interceptor: CSRF token missing for ${config.url}, attempting to fetch...`);
        csrfTokenToUse = await fetchAndSetCsrfToken();
      }

      if (csrfTokenToUse) {
        config.headers['X-CSRF-Token'] = csrfTokenToUse;
        // console.log(`apiService Interceptor: Attached X-CSRF-Token for ${config.url}: ${csrfTokenToUse.substring(0,10)}...`);
      } else {
        console.warn(`apiService Interceptor: CSRF token is still missing for ${config.method || 'GET'} request to ${config.url}. The request might fail if CSRF is required.`);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.error('API Service: Unauthorized (401) error. Token might be invalid or expired.');
      // Consider dispatching a custom event that AuthContext can listen to for global logout
      // window.dispatchEvent(new Event('auth-error-401'));
    }
    if (error.response && error.response.status === 403) {
      console.error(`API Service: Forbidden (403) error for ${error.config.method?.toUpperCase()} ${error.config.url}. CSRF token issue or insufficient permissions. Sent CSRF: ${error.config.headers['X-CSRF-Token'] ? 'Yes' : 'No'}`);
    }
    return Promise.reject(error);
  }
);

export const apiLogin = (username, password) => {
  return apiClient.post(API_ENDPOINTS.AUTH_LOGIN, { username, password });
};
export const apiRegister = (username, password) => {
  return apiClient.post(API_ENDPOINTS.AUTH_REGISTER, { username, password });
};
export const apiLogout = () => {
  return apiClient.post(API_ENDPOINTS.AUTH_LOGOUT, {});
};

export const apiUploadFile = (formData, onUploadProgress) => { // Added onUploadProgress
  return apiClient.post(API_ENDPOINTS.UPLOAD, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress, // Pass progress callback
  });
};

export const apiFetchDashboardData = () => apiClient.get(API_ENDPOINTS.DASHBOARD_DATA);
export const apiFetchProcessedTransactions = () => apiClient.get(API_ENDPOINTS.PROCESSED_TRANSACTIONS);
export const apiFetchStockHoldings = () => apiClient.get(API_ENDPOINTS.STOCK_HOLDINGS);
export const apiFetchOptionHoldings = () => apiClient.get(API_ENDPOINTS.OPTION_HOLDINGS);
export const apiFetchStockSales = () => apiClient.get(API_ENDPOINTS.STOCK_SALES);
export const apiFetchOptionSales = () => apiClient.get(API_ENDPOINTS.OPTION_SALES);
export const apiFetchDividendTaxSummary = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TAX_SUMMARY);
export const apiFetchDividendTransactions = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TRANSACTIONS);
export const apiCheckUserHasData = () => apiClient.get(API_ENDPOINTS.USER_HAS_DATA);

export default apiClient;