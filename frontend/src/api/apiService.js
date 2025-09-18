// frontend/src/api/apiService.js
import axios from 'axios';
import { API_ENDPOINTS } from '../constants';

const API_URL = process.env.REACT_APP_API_BASE_URL;

const getAuthToken = () => localStorage.getItem('auth_token');

let currentCsrfToken = null;

export const setApiServiceCsrfToken = (token) => {
  currentCsrfToken = token;
};

export const getApiServiceCsrfToken = () => currentCsrfToken;

// --- START OF CORRECTION (Part 1) ---
// We remove the default Content-Type header from the initial client creation.
// It will now be set dynamically and correctly by the request interceptor.
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    // 'Content-Type': 'application/json', // REMOVED FROM HERE
    'Accept': 'application/json',
  },
});
// --- END OF CORRECTION (Part 1) ---

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
    // Add Authorization token if it exists
    const authToken = getAuthToken();
    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    // --- START OF CORRECTION (Part 2) ---
    // This is the core logic fix. We dynamically set headers based on request type.
    if (config.data instanceof FormData) {
      // If the data is FormData, we MUST NOT set the Content-Type header.
      // The browser needs to set it automatically with a unique boundary string.
      // We explicitly delete it here to override any potential defaults.
      delete config.headers['Content-Type'];
    } else {
      // For all other requests (like login, etc.), we ensure the Content-Type is JSON.
      config.headers['Content-Type'] = 'application/json';
    }
    // --- END OF CORRECTION (Part 2) ---

    // CSRF Token Logic (from previous step, remains correct)
    const method = config.method?.toLowerCase();
    const csrfProtectedMethods = ['post', 'put', 'delete', 'patch'];
    
    if (csrfProtectedMethods.includes(method)) {
      const csrfTokenToUse = await fetchAndSetCsrfToken();
      if (csrfTokenToUse) {
        config.headers['X-CSRF-Token'] = csrfTokenToUse;
      } else {
        console.error(`apiService Interceptor: Could not obtain a fresh CSRF token for protected method ${method.toUpperCase()} to ${config.url}. Cancelling request.`);
        return Promise.reject(new axios.Cancel('CSRF token fetch failed.'));
      }
    }
    
    return config;
  },
  (error) => {
    if (axios.isCancel(error)) {
        console.log('Request canceled:', error.message);
    }
    return Promise.reject(error);
  }
);


apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

// --- API Functions (no changes here) ---

export const apiUploadFile = (formData, onUploadProgress) => 
  apiClient.post(API_ENDPOINTS.UPLOAD, formData, { 
    onUploadProgress 
  });

export const apiLogin = (email, password) => apiClient.post(API_ENDPOINTS.AUTH_LOGIN, { email, password });
export const apiRegister = (username, email, password) => apiClient.post(API_ENDPOINTS.AUTH_REGISTER, { username, email, password });
export const apiLogout = () => apiClient.post(API_ENDPOINTS.AUTH_LOGOUT, {});
export const apiRequestPasswordReset = (email) => apiClient.post(API_ENDPOINTS.AUTH_REQUEST_PASSWORD_RESET, { email });
export const apiResetPassword = (token, password, confirm_password) => apiClient.post(API_ENDPOINTS.AUTH_RESET_PASSWORD, { token, password, confirm_password });
export const apiVerifyEmail = (token) => apiClient.get(`${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${token}`);
export const apiChangePassword = (currentPassword, newPassword, confirmNewPassword) => apiClient.post(API_ENDPOINTS.USER_CHANGE_PASSWORD, { current_password: currentPassword, new_password: newPassword, confirm_new_password: confirmNewPassword });
export const apiDeleteAccount = (password) => apiClient.post(API_ENDPOINTS.USER_DELETE_ACCOUNT, { password });
export const apiCheckUserHasData = () => apiClient.get(API_ENDPOINTS.USER_HAS_DATA);
export const apiDeleteTransactions = (criteria) => apiClient.delete(API_ENDPOINTS.DELETE_TRANSACTIONS, { data: criteria });
export const apiAddManualTransaction = (transactionData) => apiClient.post('/api/transactions/manual', transactionData);
export const apiFetchRealizedGainsData = () => apiClient.get(API_ENDPOINTS.REALIZEDGAINS_DATA);
export const apiFetchProcessedTransactions = () => apiClient.get(API_ENDPOINTS.PROCESSED_TRANSACTIONS);
export const apiFetchStockHoldings = () => apiClient.get(API_ENDPOINTS.STOCK_HOLDINGS);
export const apiFetchCurrentHoldingsValue = () => apiClient.get(API_ENDPOINTS.CURRENT_HOLDINGS_VALUE);
export const apiFetchOptionHoldings = () => apiClient.get(API_ENDPOINTS.OPTION_HOLDINGS);
export const apiFetchStockSales = () => apiClient.get(API_ENDPOINTS.STOCK_SALES);
export const apiFetchOptionSales = () => apiClient.get(API_ENDPOINTS.OPTION_SALES);
export const apiFetchDividendTaxSummary = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TAX_SUMMARY);
export const apiFetchDividendTransactions = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TRANSACTIONS);
export const apiFetchFees = () => apiClient.get(API_ENDPOINTS.FEES_DATA);
export const apiFetchAdminStats = () => apiClient.get('/api/admin/stats');
export const apiFetchAdminUsers = () => apiClient.get('/api/admin/users');

export default apiClient;