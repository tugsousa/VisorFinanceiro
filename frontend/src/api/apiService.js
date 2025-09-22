// frontend/src/api/apiService.js

// --- O CÓDIGO EXISTENTE PERMANECE IGUAL ATÉ ÀS FUNÇÕES DA API ---
import axios from 'axios';
import { API_ENDPOINTS } from '../constants';

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

// --- FUNÇÕES DE API EXISTENTES ---
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

// --- ATUALIZAÇÃO AQUI ---
/**
 * Busca a lista de utilizadores para o admin com suporte para paginação.
 * @param {object} params - Objeto com os parâmetros de paginação.
 * @param {number} params.page - O número da página (1-based).
 * @param {number} params.pageSize - O número de itens por página.
 * @param {string} [params.sortBy] - A coluna para ordenação.
 * @param {string} [params.order] - A direção da ordenação ('ASC' ou 'DESC').
 * @returns {Promise} A promessa da chamada da API.
 */
export const apiFetchAdminUsers = (params) => apiClient.get('/api/admin/users', { params });

export const apiRefreshUserMetrics = (userId) => apiClient.post(`/api/admin/users/${userId}/refresh-metrics`);


/**
 * Busca as estatísticas do dashboard de administrador, com um filtro de data opcional.
 * @param {string} range - O intervalo de datas (ex: 'all_time', 'last_30_days').
 * @returns {Promise} A promessa da chamada da API.
 */
export const apiFetchAdminStats = (range = 'all_time') => 
    apiClient.get('/api/admin/stats', {
        params: {
            range: range
        }
    });

/**
 * Busca os detalhes completos de um utilizador específico para a vista de drill-down.
 * @param {string|number} userId - O ID do utilizador.
 * @returns {Promise} A promessa da chamada da API.
 */
export const apiFetchAdminUserDetails = (userId) => apiClient.get(`/api/admin/users/${userId}`);


/**
 * Pede ao backend para atualizar as métricas para múltiplos utilizadores em lote.
 * @param {Array<string|number>} userIds - Um array com os IDs dos utilizadores.
 * @returns {Promise} A promessa da chamada da API.
 */
export const apiRefreshMultipleUserMetrics = (userIds) => 
    apiClient.post('/api/admin/users/refresh-metrics-batch', { user_ids: userIds });

// >>> INÍCIO DA NOVA FUNÇÃO QUE FALTAVA <<<
/**
 * Pede ao backend para limpar a cache das estatísticas do admin.
 * @returns {Promise} A promessa da chamada da API.
 */
export const apiClearAdminStatsCache = () => apiClient.post('/api/admin/stats/clear-cache');
// >>> FIM DA NOVA FUNÇÃO QUE FALTAVA <<<

export default apiClient;