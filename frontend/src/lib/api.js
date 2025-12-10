// frontend/src/api/apiService.js

import axios from 'axios';
import { API_ENDPOINTS } from '../constants';
import logger from '../lib/utils/logger';

let authRefresher = null;

export const setAuthRefresher = (refresher) => {
  authRefresher = refresher;
};

const API_URL = process.env.REACT_APP_API_BASE_URL;

const getAuthToken = () => localStorage.getItem('auth_token');

let currentCsrfToken = null;

export const setApiServiceCsrfToken = (token) => {
  currentCsrfToken = token;
};

export const getApiServiceCsrfToken = () => currentCsrfToken;

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
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
    logger.warn('CSRF token not found in response from ' + API_ENDPOINTS.AUTH_CSRF);
    return null;
  } catch (error) {
    logger.error('Error fetching CSRF token via apiService:', error.response?.data || error.message);
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

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else {
      config.headers['Content-Type'] = 'application/json';
    }

    const method = config.method?.toLowerCase();
    const csrfProtectedMethods = ['post', 'put', 'delete', 'patch'];
    
    if (csrfProtectedMethods.includes(method)) {
      const csrfTokenToUse = getApiServiceCsrfToken() || await fetchAndSetCsrfToken();
      if (csrfTokenToUse) {
        config.headers['X-CSRF-Token'] = csrfTokenToUse;
      } else {
        logger.error(`apiService Interceptor: Could not obtain a fresh CSRF token. Cancelling.`);
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
      logger.log("apiService: Received 401. Attempting token refresh.");
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

// --- Auth & Generic ---
export const apiRefreshToken = (refreshToken) => apiClient.post(API_ENDPOINTS.AUTH_REFRESH, { refresh_token: refreshToken });
export const apiLogin = (email, password) => apiClient.post(API_ENDPOINTS.AUTH_LOGIN, { email, password });
export const apiRegister = (username, email, password) => apiClient.post(API_ENDPOINTS.AUTH_REGISTER, { username, email, password });
export const apiLogout = () => apiClient.post(API_ENDPOINTS.AUTH_LOGOUT, {});
export const apiRequestPasswordReset = (email) => apiClient.post(API_ENDPOINTS.AUTH_REQUEST_PASSWORD_RESET, { email });
export const apiResetPassword = (token, password, confirm_password) => apiClient.post(API_ENDPOINTS.AUTH_RESET_PASSWORD, { token, password, confirm_password });
export const apiVerifyEmail = (token) => apiClient.get(`${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${token}`);
export const apiChangePassword = (currentPassword, newPassword, confirmNewPassword) => apiClient.post(API_ENDPOINTS.USER_CHANGE_PASSWORD, { current_password: currentPassword, new_password: newPassword, confirm_new_password: confirmNewPassword });
export const apiDeleteAccount = (password) => apiClient.post(API_ENDPOINTS.USER_DELETE_ACCOUNT, { password });
export const apiCheckUserHasData = () => apiClient.get(API_ENDPOINTS.USER_HAS_DATA);

// --- Portfolio Management ---
export const apiListPortfolios = () => apiClient.get('/api/portfolios');
export const apiCreatePortfolio = (name, description) => apiClient.post('/api/portfolios', { name, description });
export const apiDeletePortfolio = (id) => apiClient.delete(`/api/portfolios/${id}`);

// --- Data Operations (Updated to include portfolio_id) ---
export const apiUploadFile = (formData, onUploadProgress) => 
    apiClient.post(API_ENDPOINTS.UPLOAD, formData, { onUploadProgress });

export const apiDeleteTransactions = (criteria) => 
    apiClient.delete(API_ENDPOINTS.DELETE_TRANSACTIONS, { data: criteria });

export const apiAddManualTransaction = (transactionData) => 
    apiClient.post('/api/transactions/manual', transactionData);

export const apiFetchRealizedGainsData = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.REALIZEDGAINS_DATA, { params: { portfolio_id: portfolioId } });

export const apiFetchProcessedTransactions = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.PROCESSED_TRANSACTIONS, { params: { portfolio_id: portfolioId } });

export const apiFetchStockHoldings = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.STOCK_HOLDINGS, { params: { portfolio_id: portfolioId } });

export const apiFetchCurrentHoldingsValue = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.CURRENT_HOLDINGS_VALUE, { params: { portfolio_id: portfolioId } });

export const apiFetchOptionHoldings = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.OPTION_HOLDINGS, { params: { portfolio_id: portfolioId } });

export const apiFetchStockSales = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.STOCK_SALES, { params: { portfolio_id: portfolioId } });

export const apiFetchOptionSales = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.OPTION_SALES, { params: { portfolio_id: portfolioId } });

export const apiFetchDividendTaxSummary = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.DIVIDEND_TAX_SUMMARY, { params: { portfolio_id: portfolioId } });

export const apiFetchDividendTransactions = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.DIVIDEND_TRANSACTIONS, { params: { portfolio_id: portfolioId } });

export const apiFetchFees = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.FEES_DATA, { params: { portfolio_id: portfolioId } });

export const apiFetchHistoricalChartData = (portfolioId) => 
    apiClient.get('/api/history/chart', { params: { portfolio_id: portfolioId } });

// --- Admin ---
export const apiFetchAdminUsers = (params) => apiClient.get('/api/admin/users', { params });
export const apiRefreshUserMetrics = (userId) => apiClient.post(`/api/admin/users/${userId}/refresh-metrics`);
export const apiFetchAdminStats = (range = 'all_time') => apiClient.get('/api/admin/stats', { params: { range } });

// Updated to accept params
export const apiFetchAdminUserDetails = (userId, portfolioId = null) => {
    const params = portfolioId ? { portfolio_id: portfolioId } : {};
    return apiClient.get(`/api/admin/users/${userId}`, { params });
};

export const apiRefreshMultipleUserMetrics = (userIds) => apiClient.post('/api/admin/users/refresh-metrics-batch', { user_ids: userIds });
export const apiClearAdminStatsCache = () => apiClient.post('/api/admin/stats/clear-cache');

export default apiClient;