import apiClient from 'lib/api';

/** The dividends of the positions held: the last 3 months and the next 12. */
export const apiFetchDividendCalendar = (portfolioId) =>
    apiClient.get('/api/dividends/calendar', { params: { portfolio_id: portfolioId } });
