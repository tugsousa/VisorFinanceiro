// frontend/src/features/analytics/hooks/useAnalyticsData.js
import { useQueries } from '@tanstack/react-query';
import {
    apiFetchStockSales,
    apiFetchOptionSales,
    apiFetchDividendTaxSummary,
    apiFetchDividendTransactions,
    apiFetchFees,
    apiFetchDividendMetrics, 
} from 'features/analytics/api/analyticsApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';

export const useAnalyticsData = (token, types = ['all']) => {
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;

    const shouldFetch = (type) => types.includes('all') || types.includes(type);

    const results = useQueries({
        queries: [
            {
                queryKey: ['stockSales', token, portfolioId],
                queryFn: () => apiFetchStockSales(portfolioId),
                enabled: !!token && !!portfolioId && shouldFetch('stocks'),
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data || []
            },
            {
                queryKey: ['optionSales', token, portfolioId],
                queryFn: () => apiFetchOptionSales(portfolioId),
                enabled: !!token && !!portfolioId && shouldFetch('options'),
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data?.OptionSaleDetails || []
            },
            {
                queryKey: ['dividendSummary', token, portfolioId],
                queryFn: () => apiFetchDividendTaxSummary(portfolioId),
                enabled: !!token && !!portfolioId && (shouldFetch('dividends') || shouldFetch('performance')),
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data || {}
            },
            {
                queryKey: ['dividendTransactions', token, portfolioId],
                queryFn: () => apiFetchDividendTransactions(portfolioId),
                enabled: !!token && !!portfolioId && shouldFetch('dividends'),
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data || []
            },
            {
                queryKey: ['fees', token, portfolioId],
                queryFn: () => apiFetchFees(portfolioId),
                enabled: !!token && !!portfolioId && shouldFetch('fees'),
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data || []
            },
            {
                queryKey: ['dividendMetrics', token, portfolioId],
                queryFn: () => apiFetchDividendMetrics(portfolioId),
                enabled: !!token && !!portfolioId && shouldFetch('metrics'),
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data || {}
            }
        ]
    });

    const [stockSalesQ, optionSalesQ, dividendSummaryQ, dividendTxsQ, feesQ, dividendMetricsQ] = results;

    return {
        stockSalesData: stockSalesQ.data,
        optionSalesData: optionSalesQ.data,
        dividendSummaryData: dividendSummaryQ.data,
        dividendTransactionsData: dividendTxsQ.data,
        feesData: feesQ.data,

        dividendMetricsData: dividendMetricsQ.data,
        
        isLoading: results.some(q => q.isLoading && q.fetchStatus !== 'idle'),
        isError: results.some(q => q.isError)
    };
};