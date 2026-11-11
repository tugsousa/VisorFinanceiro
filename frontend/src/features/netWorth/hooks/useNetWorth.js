import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { apiFetchNetWorth } from '../api/netWorthApi';

/** The net worth of the signed-in user: every portfolio plus the other assets. */
export const useNetWorth = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['netWorth', token],
        queryFn: async () => (await apiFetchNetWorth()).data,
        enabled: !!token,
        staleTime: 60 * 1000,
    });
};
