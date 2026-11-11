import apiClient from 'lib/api';

/** Every portfolio of the user plus the other assets, with the totals and the monthly history. */
export const apiFetchNetWorth = () => apiClient.get('/api/net-worth');

/** @param {object} asset {type, name, opened_at?, closed_at?, details?, initial_value?, initial_date?} */
export const apiCreateOtherAsset = (asset) => apiClient.post('/api/other-assets', asset);

/** Replaces the asset's name, dates and details; its type can't change. */
export const apiUpdateOtherAsset = (id, asset) => apiClient.put(`/api/other-assets/${id}`, asset);

export const apiDeleteOtherAsset = (id) => apiClient.delete(`/api/other-assets/${id}`);

/** @param {object} entry {date: 'YYYY-MM-DD', kind, amount, note?} */
export const apiAddOtherAssetEntry = (id, entry) => apiClient.post(`/api/other-assets/${id}/entries`, entry);

export const apiDeleteOtherAssetEntry = (id, entryId) => apiClient.delete(`/api/other-assets/${id}/entries/${entryId}`);

/** The message of an API error, for the user. */
export const netWorthErrorMessage = (error, fallback = 'Não foi possível guardar.') =>
    error?.response?.data?.error || fallback;
