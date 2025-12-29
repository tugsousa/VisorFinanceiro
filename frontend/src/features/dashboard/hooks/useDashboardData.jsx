import { useQueries } from '@tanstack/react-query';
import {
    apiFetchStockSales,
    apiFetchOptionSales,
    apiFetchDividendTaxSummary,
    apiFetchDividendTransactions,
    apiFetchStockHoldings,
    apiFetchOptionHoldings,
    apiFetchCurrentHoldingsValue,
    apiFetchFees
} from 'features/analytics/api/analyticsApi';
import { apiFetchProcessedTransactions } from 'features/portfolio/api/portfolioApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';

export const useDashboardData = (token) => {
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;

    const results = useQueries({
        queries: [
            { 
                queryKey: ['stockSales', token, portfolioId], 
                queryFn: () => apiFetchStockSales(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['optionSales', token, portfolioId], 
                queryFn: () => apiFetchOptionSales(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data?.OptionSaleDetails || [] 
            },
            { 
                queryKey: ['dividendSummary', token, portfolioId], 
                queryFn: () => apiFetchDividendTaxSummary(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || {} 
            },
            { 
                queryKey: ['dividendTransactions', token, portfolioId], 
                queryFn: () => apiFetchDividendTransactions(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['stockHoldingsByYear', token, portfolioId], 
                queryFn: () => apiFetchStockHoldings(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || {} 
            },
            { 
                queryKey: ['optionHoldings', token, portfolioId], 
                queryFn: () => apiFetchOptionHoldings(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['currentHoldingsValue', token, portfolioId], 
                queryFn: () => apiFetchCurrentHoldingsValue(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['fees', token, portfolioId], 
                queryFn: () => apiFetchFees(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['allProcessedTransactions', token, portfolioId], 
                queryFn: () => apiFetchProcessedTransactions(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
        ]
    });

    const isLoading = results.some(q => q.isLoading);
    const isError = results.some(q => q.isError);
    const error = results.find(q => q.error)?.error;

    return {
        stockSalesData: results[0].data,
        optionSalesData: results[1].data,
        dividendSummaryData: results[2].data,
        dividendTransactionsData: results[3].data,
        stockHoldingsByYearData: results[4].data,
        optionHoldingsData: results[5].data,
        currentHoldingsValueData: results[6].data,
        feesData: results[7].data,
        allTransactionsData: results[8].data,
        isHoldingsValueFetching: results[6].isFetching,
        isLoading,
        isError,
        error
    };
};