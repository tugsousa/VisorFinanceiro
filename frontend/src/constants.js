// frontend/src/constants.js
// API Configuration
const API_BASE_PATH = '/api'; // Relative path

export const API_ENDPOINTS = {
  AUTH_CSRF: `${API_BASE_PATH}/auth/csrf`,
  AUTH_LOGIN: `${API_BASE_PATH}/auth/login`,
  AUTH_REGISTER: `${API_BASE_PATH}/auth/register`,
  AUTH_LOGOUT: `${API_BASE_PATH}/auth/logout`,
  AUTH_REFRESH: `${API_BASE_PATH}/auth/refresh`,
  UPLOAD: `${API_BASE_PATH}/upload`,
  DASHBOARD_DATA: `${API_BASE_PATH}/dashboard-data`,
  PROCESSED_TRANSACTIONS: `${API_BASE_PATH}/transactions/processed`,
  STOCK_HOLDINGS: `${API_BASE_PATH}/holdings/stocks`,
  OPTION_HOLDINGS: `${API_BASE_PATH}/holdings/options`,
  STOCK_SALES: `${API_BASE_PATH}/stock-sales`,
  OPTION_SALES: `${API_BASE_PATH}/option-sales`,
  DIVIDEND_TAX_SUMMARY: `${API_BASE_PATH}/dividend-tax-summary`,
  DIVIDEND_TRANSACTIONS: `${API_BASE_PATH}/dividend-transactions`,
  USER_HAS_DATA: `${API_BASE_PATH}/user/has-data`,
};

// Filter/Selection Constants
export const ALL_YEARS_OPTION = 'all';
export const NO_YEAR_SELECTED = '';

// Charting Constants
export const MONTH_NAMES_CHART = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// UI Text or Keys
export const UI_TEXT = {
  errorLoadingData: "Error loading data. Please try again.",
  userNotAuthenticated: "User not authenticated. Please sign in.",
  noDataAvailable: "No data available.",
};

// File Upload Constants
export const ALLOWED_FILE_TYPES = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;