import apiClient from 'lib/api';
import { API_ENDPOINTS } from 'constants';

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

export const apiFetchDividendMetrics = (portfolioId) => 
    apiClient.get('/api/dividend-metrics', { params: { portfolio_id: portfolioId } });