// frontend/src/api/apiService.js
import axios from 'axios';
import { API_ENDPOINTS } from '../constants';

// A base da API é lida a partir das variáveis de ambiente.
// Em desenvolvimento, será http://localhost:8080 (do .env.development)
// Em produção, será https://www.rumoclaro.pt (do .env.production)
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
  baseURL: API_URL, // <-- ALTERAÇÃO PRINCIPAL AQUI
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

export const fetchAndSetCsrfToken = async () => {
  try {
    // As chamadas usam URLs relativos, pois o baseURL já está definido.
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
      } else {
        if (config.url !== API_ENDPOINTS.AUTH_CSRF) {
          console.warn(`apiService Interceptor: CSRF token is still missing for ${config.method || 'GET'} request to ${config.url}.`);
        }
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
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
      return Promise.reject(error);
    }
    if (error.response && error.response.status === 403 && !originalRequest._retryCSRF) {
      console.warn(`apiService: Received 403 for ${originalRequest.method?.toUpperCase()} ${originalRequest.url}. Sent CSRF: ${originalRequest.headers['X-CSRF-Token'] ? 'Yes' : 'No'}. Attempting to refresh CSRF token and retry.`);
      originalRequest._retryCSRF = true;
      try {
        await fetchAndSetCsrfToken();
        return apiClient(originalRequest);
      } catch (csrfError) {
        console.error('apiService: Failed to refresh CSRF token after 403, or retry failed:', csrfError);
        window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'CSRF refresh failed after 403' }));
        return Promise.reject(csrfError);
      }
    }

    if (error.response && error.response.status === 401 && !originalRequest._retryAuth) {
      if (originalRequest.url === API_ENDPOINTS.AUTH_LOGIN || originalRequest.url === API_ENDPOINTS.AUTH_REFRESH) {
        if (originalRequest.url === API_ENDPOINTS.AUTH_REFRESH) {
          console.error('apiService: Refresh token itself failed (401) on /refresh. Logging out.');
          window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'Refresh token invalid on /refresh (401)' }));
        }
        return Promise.reject(error);
      }

      if (isRefreshingAccessToken) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(newAccessToken => {
          originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;
          return apiClient(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retryAuth = true;
      isRefreshingAccessToken = true;
      const localRefreshToken = getRefreshToken();

      if (!localRefreshToken) {
        console.error('apiService: No refresh token found for 401 renewal. Logging out.');
        isRefreshingAccessToken = false;
        window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'No refresh token' }));
        return Promise.reject(error);
      }

      let csrfForRefresh = getApiServiceCsrfToken();
      if (!csrfForRefresh) {
        csrfForRefresh = await fetchAndSetCsrfToken();
      }
      const refreshConfig = { headers: {} };
      if (csrfForRefresh) {
        refreshConfig.headers['X-CSRF-Token'] = csrfForRefresh;
      }

      return apiClient.post(API_ENDPOINTS.AUTH_REFRESH, { refresh_token: localRefreshToken }, refreshConfig)
        .then(res => {
          const { access_token, refresh_token: new_refresh_token } = res.data;
          localStorage.setItem('auth_token', access_token);
          if (new_refresh_token) {
            localStorage.setItem('refresh_token', new_refresh_token);
          }
          originalRequest.headers['Authorization'] = 'Bearer ' + access_token;
          processQueue(null, access_token);
          return apiClient(originalRequest);
        })
        .catch(refreshErr => {
          console.error('apiService: Refresh token failed or session expired.', refreshErr.response?.data || refreshErr.message);
          processQueue(refreshErr, null);
          window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'Refresh token failed' }));
          return Promise.reject(refreshErr);
        })
        .finally(() => {
          isRefreshingAccessToken = false;
        });
    }

    if (error.response) {
      console.error(`API Service: ${error.response.status} error for ${error.config.method?.toUpperCase()} ${error.config.url}. CSRF sent: ${error.config.headers['X-CSRF-Token'] ? 'Yes' : 'No'}. CSRF available: ${getApiServiceCsrfToken() ? 'Yes' : 'No'}`);
    }
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
export const apiFetchOptionHoldings = () => apiClient.get(API_ENDPOINTS.OPTION_HOLDINGS);
export const apiFetchStockSales = () => apiClient.get(API_ENDPOINTS.STOCK_SALES);
export const apiFetchOptionSales = () => apiClient.get(API_ENDPOINTS.OPTION_SALES);
export const apiFetchDividendTaxSummary = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TAX_SUMMARY);
export const apiFetchDividendTransactions = () => apiClient.get(API_ENDPOINTS.DIVIDEND_TRANSACTIONS);
export const apiCheckUserHasData = () => apiClient.get(API_ENDPOINTS.USER_HAS_DATA);
export const apiDeleteAllTransactions = () => apiClient.delete(API_ENDPOINTS.DELETE_ALL_TRANSACTIONS);

export default apiClient;