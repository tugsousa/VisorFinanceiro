import apiClient from 'lib/api';

/** The groups, the assignments and how far each group is from its target. */
export const apiFetchAllocation = (portfolioId) =>
    apiClient.get('/api/allocation', { params: { portfolio_id: portfolioId } });

/**
 * Replaces all the groups of the portfolio. A group with an id keeps it (and its holdings).
 * @param {number} portfolioId
 * @param {Array<{id?: number, name: string, target_pct: number, color: string, includes_cash: boolean}>} groups
 */
export const apiSaveAllocationGroups = (portfolioId, groups) =>
    apiClient.put('/api/allocation/groups', { groups }, { params: { portfolio_id: portfolioId } });

/**
 * Replaces the group of every holding.
 * @param {number} portfolioId
 * @param {Array<{isin: string, group_id: number, preferred: boolean}>} assignments
 */
export const apiSaveAllocationAssignments = (portfolioId, assignments) =>
    apiClient.put('/api/allocation/assignments', { assignments }, { params: { portfolio_id: portfolioId } });

/** Stores the tolerance, in percentage points. */
export const apiSaveAllocationSettings = (portfolioId, tolerancePP) =>
    apiClient.put('/api/allocation/settings', { tolerance_pp: tolerancePP }, { params: { portfolio_id: portfolioId } });

/** Splits a deposit across the groups, buying only. Nothing is stored. */
export const apiFetchDepositPlan = (portfolioId, amount) =>
    apiClient.get('/api/allocation/deposit-plan', { params: { portfolio_id: portfolioId, amount } });

/** The message of an API error, without the generic prefix the backend adds. */
export const allocationErrorMessage = (error, fallback = 'Não foi possível guardar.') => {
    const message = error?.response?.data?.error;
    if (!message) return fallback;
    const separator = message.indexOf(': ');
    return separator >= 0 ? message.slice(separator + 2) : message;
};
