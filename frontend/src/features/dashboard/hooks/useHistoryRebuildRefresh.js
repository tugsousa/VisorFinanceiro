import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetchJobs } from 'features/analytics/api/analyticsApi';

const POLL_INTERVAL_MS = 3000;

const isUnfinishedRebuild = (job, portfolioId) =>
    job.type === 'rebuild_history'
    && job.payload?.portfolio_id === portfolioId
    && (job.status === 'pending' || job.status === 'running');

// The history is rebuilt in the background after an upload, so the chart has to be
// fetched again when that finishes. Polls only while a rebuild is unfinished.
export const useHistoryRebuildRefresh = (portfolioId) => {
    const queryClient = useQueryClient();
    const wasRebuilding = useRef(false);

    const { data: isRebuilding = false } = useQuery({
        queryKey: ['historyRebuildRunning', portfolioId],
        queryFn: async () => {
            const res = await apiFetchJobs();
            return (res.data?.jobs || []).some(job => isUnfinishedRebuild(job, portfolioId));
        },
        enabled: !!portfolioId,
        staleTime: 0,
        refetchInterval: (query) => (query.state.data ? POLL_INTERVAL_MS : false),
    });

    useEffect(() => {
        if (wasRebuilding.current && !isRebuilding) {
            queryClient.invalidateQueries({ queryKey: ['historicalChartData'] });
            queryClient.invalidateQueries({ queryKey: ['currentHoldingsValue'] });
        }
        wasRebuilding.current = isRebuilding;
    }, [isRebuilding, queryClient]);
};
