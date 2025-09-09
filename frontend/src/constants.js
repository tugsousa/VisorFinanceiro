// frontend/src/constants.js
    const API_BASE_PATH = '/api'; 

    export const API_ENDPOINTS = {
      AUTH_CSRF: `${API_BASE_PATH}/auth/csrf`,
      AUTH_LOGIN: `${API_BASE_PATH}/auth/login`,
      AUTH_REGISTER: `${API_BASE_PATH}/auth/register`,
      AUTH_LOGOUT: `${API_BASE_PATH}/auth/logout`,
      AUTH_REFRESH: `${API_BASE_PATH}/auth/refresh`,
      AUTH_VERIFY_EMAIL: `${API_BASE_PATH}/auth/verify-email`,
      AUTH_REQUEST_PASSWORD_RESET: `${API_BASE_PATH}/auth/request-password-reset`,
      AUTH_RESET_PASSWORD: `${API_BASE_PATH}/auth/reset-password`,
      AUTH_RESET_PASSWORD_PAGE: `${API_BASE_PATH}/auth/reset-password`, 
      AUTH_GOOGLE_LOGIN: `${API_BASE_PATH}/auth/google/login`,

      UPLOAD: `${API_BASE_PATH}/upload`,
      REALIZEDGAINS_DATA: `${API_BASE_PATH}/realizedgains-data`,
      PROCESSED_TRANSACTIONS: `${API_BASE_PATH}/transactions/processed`,
      STOCK_HOLDINGS: `${API_BASE_PATH}/holdings/stocks`,
      CURRENT_HOLDINGS_VALUE: `${API_BASE_PATH}/holdings/current-value`,
      OPTION_HOLDINGS: `${API_BASE_PATH}/holdings/options`,
      STOCK_SALES: `${API_BASE_PATH}/stock-sales`,
      OPTION_SALES: `${API_BASE_PATH}/option-sales`,
      DIVIDEND_TAX_SUMMARY: `${API_BASE_PATH}/dividend-tax-summary`,
      DIVIDEND_TRANSACTIONS: `${API_BASE_PATH}/dividend-transactions`,
      USER_HAS_DATA: `${API_BASE_PATH}/user/has-data`,
      DELETE_ALL_TRANSACTIONS: `${API_BASE_PATH}/transactions/all`,
      FEES_DATA: `${API_BASE_PATH}/fees`,
      USER_CHANGE_PASSWORD: `${API_BASE_PATH}/user/change-password`,
      USER_DELETE_ACCOUNT: `${API_BASE_PATH}/user/delete-account`,
    };

    export const ALL_YEARS_OPTION = 'all';
    export const NO_YEAR_SELECTED = '';

    export const MONTH_NAMES_CHART = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    export const UI_TEXT = {
      errorLoadingData: "Error loading data. Please try again.",
      userNotAuthenticated: "User not authenticated. Please sign in.",
      noDataAvailable: "No data available.",
    };

    export const ALLOWED_FILE_TYPES = ['text/csv', 'application/vnd.ms-excel'];
    export const MAX_FILE_SIZE_MB = 5;
    export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;