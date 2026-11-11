import { useQuery } from '@tanstack/react-query';
import { apiFetchAllocation } from '../api/allocationApi';
import { ALLOCATION_QUERY_KEY } from '../logic/allocationLogic';

/** The target allocation of a portfolio. Shared by the Alocação-alvo tab and the dashboard warning. */
export const useAllocation = (portfolioId) => useQuery({
    queryKey: [ALLOCATION_QUERY_KEY, portfolioId],
    queryFn: () => apiFetchAllocation(portfolioId).then(res => res.data),
    enabled: Boolean(portfolioId),
    staleTime: 5 * 60 * 1000,
});
