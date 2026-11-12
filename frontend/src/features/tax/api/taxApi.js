import apiClient from 'lib/api';

/**
 * Simulates selling part of a position today. Nothing is stored.
 * @param {number} portfolioId
 * @param {{isin: string, quantity: number, price?: number, commission?: number}} params
 *   A missing or empty price means the current market price.
 */
export const apiSimulateSale = (portfolioId, { isin, quantity, price, commission }) =>
    apiClient.get('/api/tax/simulate-sale', {
        params: {
            portfolio_id: portfolioId,
            isin,
            quantity,
            price: price || undefined,
            commission: commission || undefined,
        },
    });

/** The capital gains balance of this year so far, and the unrealized result of each position. */
export const apiFetchTaxYearStatus = (portfolioId) =>
    apiClient.get('/api/tax/year-status', { params: { portfolio_id: portfolioId } });

/** The message of an API error, without the generic prefix the backend adds. */
export const simulationErrorMessage = (error) => {
    const message = error?.response?.data?.error;
    if (!message) return 'Não foi possível simular a venda.';
    const separator = message.indexOf(': ');
    return separator >= 0 ? message.slice(separator + 2) : message;
};

/**
 * The sales of positions at a loss that would lower this year's tax, and how many shares of each. Nothing is stored.
 * @param {number} portfolioId
 * @param {number} [commission] - expected commission of each sale
 */
export const apiFetchTaxLossHarvest = (portfolioId, commission) =>
    apiClient.get('/api/tax/loss-harvest', {
        params: { portfolio_id: portfolioId, commission: commission || undefined },
    });
