// frontend/src/api/apiService.js
import axios from 'axios';
import { API_ENDPOINTS } from '../constants';

// A base da API é lida a partir das variáveis de ambiente.
const API_URL = process.env.REACT_APP_API_BASE_URL;

const getAuthToken = () => localStorage.getItem('auth_token');
const getRefreshToken = () => localStorage.getItem('refresh_token');

let currentCsrfToken = null;
let isRefreshingAccessToken = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const setApiServiceCsrfToken = (token) => {
  currentCsrfToken = token;
};

export const getApiServiceCsrfToken = () => currentCsrfToken;

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

export const fetchAndSetCsrfToken = async () => {
  try {
    const response = await apiClient.get(API_ENDPOINTS.AUTH_CSRF);
    const newCsrfToken = response.headers['x-csrf-token'] || response.data?.csrfToken;
    if (newCsrfToken) {
      setApiServiceCsrfToken(newCsrfToken);
      return newCsrfToken;
    }
    console.warn('CSRF token not found in response from ' + API_ENDPOINTS.AUTH_CSRF);
    return null;
  } catch (error) {
    console.error('Error fetching CSRF token via apiService:', error.response?.data || error.message);
    if (error.response && error.response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'CSRF fetch unauthorized' }));
    }
    return null;
  }
};

apiClient.interceptors.request.use(
  async (config) => {
    const authToken = getAuthToken();
    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const isCsrfExemptGet = config.method?.toLowerCase() === 'get' &&
      (config.url?.startsWith(API_ENDPOINTS.AUTH_VERIFY_EMAIL) || config.url?.startsWith(API_ENDPOINTS.AUTH_RESET_PASSWORD_PAGE));

    if (config.url !== API_ENDPOINTS.AUTH_CSRF &&
      config.url !== API_ENDPOINTS.AUTH_REFRESH &&
      !isCsrfExemptGet &&
      (!config.method || config.method.toLowerCase() !== 'options')) {
      let csrfTokenToUse = getApiServiceCsrfToken();
      if (!csrfTokenToUse && !config._csrfAttempted) {
        config._csrfAttempted = true;
        csrfTokenToUse = await fetchAndSetCsrfToken();
      }

      if (csrfTokenToUse) {
        config.headers['X-CSRF-Token'] = csrfTokenToUse;
      } else if (config.url !== API_ENDPOINTS.AUTH_CSRF) {
        console.warn(`apiService Interceptor: CSRF token is still missing for ${config.method || 'GET'} request to ${config.url}.`);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ... (o interceptor de resposta continua o mesmo)
    return Promise.reject(error);
  }
);

export const apiLogin = (email, password) => apiClient.post(API_ENDPOINTS.AUTH_LOGIN, { email, password });
export const apiRegister = (username, email, password) => apiClient.post(API_ENDPOINTS.AUTH_REGISTER, { username, email, password });
export const apiLogout = () => apiClient.post(API_ENDPOINTS.AUTH_LOGOUT, {});
export const apiRequestPasswordReset = (email) => apiClient.post(API_ENDPOINTS.AUTH_REQUEST_PASSWORD_RESET, { email });
export const apiResetPassword = (token, password, confirm_password) => apiClient.post(API_ENDPOINTS.AUTH_RESET_PASSWORD, { token, password, confirm_password });
export const apiChangePassword = (currentPassword, newPassword, confirmNewPassword) => apiClient.post(API_ENDPOINTS.USER_CHANGE_PASSWORD, { current_password: currentPassword, new_password: newPassword, confirm_new_password: confirmNewPassword });
export const apiDeleteAccount = (password) => apiClient.post(API_ENDPOINTS.USER_DELETE_ACCOUNT, { password });
export const apiUploadFile = (formData, onUploadProgress) => apiClient.post(API_ENDPOINTS.UPLOAD, formData, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress });
export const apiFetchRealizedGainsData = () => apiClient.get(API_ENDPOINTS.REALIZEDGAINS_DATA);
export const apiFetchProcessedTransactions = () => apiClient.get(API_ENDPOINTS.PROCESSED_TRANSACTIONS);
export const apiFetchStockHoldings = () => apiClient.get(API_ENDPOINTS.STOCK_HOLDINGS);
export const apiFetchCurrentHoldingsValue = () => apiClient.get(API_ENDPOINTS.CURRENT_HOLDINGS_VALUE);
export const apiFetchOptionHoldings = () => apiClient.get(API_ENDPOINTS.OPTION_HOLDINGS);
export const apiFetchStockSales = () => apiClient.get(API_ENDPOINTS.STOCK_SALES);
export const apiFetchOptionSales = () => apiClient.get(API_ENDPOINTS.OPTION_SALES);
export const apiFetchDividendTaxSummary = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TAX_SUMMARY);
export const apiFetchDividendTransactions = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TRANSACTIONS);
export const apiCheckUserHasData = () => apiClient.get(API_ENDPOINTS.USER_HAS_DATA);
export const apiDeleteTransactions = (criteria) => apiClient.delete(API_ENDPOINTS.DELETE_TRANSACTIONS, { data: criteria });
export const apiVerifyEmail = (token) => apiClient.get(`${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${token}`);
export const apiFetchFees = () => apiClient.get(API_ENDPOINTS.FEES_DATA);
export const apiAddManualTransaction = (transactionData) => apiClient.post('/api/transactions/manual', transactionData);
export const apiFetchAdminStats = () => apiClient.get('/api/admin/stats');

export default apiClient;