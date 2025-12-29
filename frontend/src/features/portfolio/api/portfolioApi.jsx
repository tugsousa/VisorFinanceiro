import apiClient from 'lib/api';
import { API_ENDPOINTS } from 'constants';

// Portfolio Management
export const apiListPortfolios = () => apiClient.get('/api/portfolios');
export const apiCreatePortfolio = (name, description) => apiClient.post('/api/portfolios', { name, description });
export const apiDeletePortfolio = (id) => apiClient.delete(`/api/portfolios/${id}`);

// Transactions
export const apiFetchProcessedTransactions = (portfolioId) => 
    apiClient.get(API_ENDPOINTS.PROCESSED_TRANSACTIONS, { params: { portfolio_id: portfolioId } });

export const apiAddManualTransaction = (transactionData) => 
    apiClient.post('/api/transactions/manual', transactionData);

export const apiDeleteTransactions = (criteria) => 
    apiClient.delete(API_ENDPOINTS.DELETE_TRANSACTIONS, { data: criteria });

// File Upload (Often tied to portfolio data)
export const apiUploadFile = (formData, onUploadProgress) => 
    apiClient.post(API_ENDPOINTS.UPLOAD, formData, { onUploadProgress });

export const apiRefreshPortfolioSnapshot = (portfolioId) => 
    apiClient.post(`/api/portfolios/${portfolioId}/refresh-snapshot`);