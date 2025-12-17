import apiClient from 'lib/api';

export const apiFetchAdminUsers = (params) => apiClient.get('/api/admin/users', { params });
export const apiRefreshUserMetrics = (userId) => apiClient.post(`/api/admin/users/${userId}/refresh-metrics`);
export const apiFetchAdminStats = (range = 'all_time') => apiClient.get('/api/admin/stats', { params: { range } });

export const apiFetchAdminUserDetails = (userId, portfolioId = null) => {
    const params = portfolioId ? { portfolio_id: portfolioId } : {};
    return apiClient.get(`/api/admin/users/${userId}`, { params });
};

export const apiRefreshMultipleUserMetrics = (userIds) => apiClient.post('/api/admin/users/refresh-metrics-batch', { user_ids: userIds });
export const apiClearAdminStatsCache = () => apiClient.post('/api/admin/stats/clear-cache');

export const apiImpersonateUser = (userId) => apiClient.post(`/api/admin/users/${userId}/impersonate`);