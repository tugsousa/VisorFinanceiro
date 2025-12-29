import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics } from '../api/adminApi';

export const useAdminStats = (token, range = 'all_time') => {
  return useQuery({
    queryKey: ['adminStats', token, range],
    queryFn: () => apiFetchAdminStats(range).then(res => res.data),
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
  });
};

export const useAdminUsers = (token, paginationModel, sortModel) => {
  return useQuery({
    queryKey: ['adminUsers', token, paginationModel, sortModel],
    queryFn: () => {
      const params = {
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        sortBy: sortModel[0]?.field || 'created_at',
        order: sortModel[0]?.sort || 'desc',
      };
      return apiFetchAdminUsers(params).then(res => res.data);
    },
    enabled: !!token,
    placeholderData: (prev) => prev, // Mantém dados anteriores enquanto carrega novos (melhor UX)
  });
};

export const useAdminUserMetricsRefresh = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId) => apiRefreshUserMetrics(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['adminUsers']);
      queryClient.invalidateQueries(['adminStats']); // Atualiza stats globais também
    },
  });
};