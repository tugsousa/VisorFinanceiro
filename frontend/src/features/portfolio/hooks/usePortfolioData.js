import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
    apiFetchStockHoldings,
    apiFetchOptionHoldings,
    apiFetchCurrentHoldingsValue,
    apiFetchStockSales,
    apiFetchOptionSales
} from 'features/analytics/api/analyticsApi';
import { apiFetchProcessedTransactions } from 'features/portfolio/api/portfolioApi';
import { usePortfolio } from '../PortfolioContext';
import { calculateCombinedAggregatedMetricsByISIN } from '../../../lib/utils/aggregationUtils';

export const usePortfolioData = (token) => {
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;

    const results = useQueries({
        queries: [
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
                queryKey: ['allProcessedTransactions', token, portfolioId],
                queryFn: () => apiFetchProcessedTransactions(portfolioId),
                enabled: !!token && !!portfolioId,
                staleTime: 1000 * 60 * 5,
                select: (res) => res.data || []
            },
        ]
    });

    const [
        stockHoldingsQuery, 
        optionHoldingsQuery, 
        currentHoldingsQuery,
        stockSalesQuery,
        optionSalesQuery,
        allTransactionsQuery
    ] = results;

    const stockHoldingsByYear = stockHoldingsQuery.data || {};
    const currentHoldingsValue = currentHoldingsQuery.data || [];
    const stockSalesData = stockSalesQuery.data || [];
    const optionSalesData = optionSalesQuery.data || [];
    const allTransactionsData = allTransactionsQuery.data || [];

    // --- 1. Prepare Detailed View (Logic Unchanged) ---
    const detailedHoldingsForView = useMemo(() => {
        if (!stockHoldingsByYear || Object.keys(stockHoldingsByYear).length === 0) return [];
        
        const latestYear = Object.keys(stockHoldingsByYear).sort((a, b) => b.localeCompare(a))[0];
        const targetData = stockHoldingsByYear[latestYear] || [];
        
        const priceMap = {};
        currentHoldingsValue.forEach(h => {
            if (h.isin && h.current_price_eur) priceMap[h.isin] = h.current_price_eur;
        });

        return targetData.map(lot => ({
            ...lot,
            current_price_eur: priceMap[lot.isin] || 0
        }));
    }, [stockHoldingsByYear, currentHoldingsValue]);

    // --- 2. Prepare Grouped View  ---
    const holdingsForGroupedView = useMemo(() => {
        if (!currentHoldingsValue) return [];

        // Calculate aggregated metrics (Dividends, Commissions, Realized P/L)
        const metricsMap = calculateCombinedAggregatedMetricsByISIN(
            allTransactionsData, 
            stockSalesData, 
            optionSalesData
        );

        return currentHoldingsValue.map(holding => {
            // Get metrics for this specific ISIN
            const metrics = metricsMap[holding.isin] || { 
                totalRealizedStockPL: 0, 
                totalDividends: 0, 
                totalCommissions: 0 
            };

            return {
                ...holding,
                marketValueEUR: holding.market_value_eur,
                total_cost_basis_eur: Math.abs(holding.total_cost_basis_eur),
                totalRealizedStockPL: metrics.totalRealizedStockPL, 
                totalDividends: metrics.totalDividends, 
                totalCommissions: metrics.totalCommissions
            };
        });
    }, [currentHoldingsValue, allTransactionsData, stockSalesData, optionSalesData]);

    const holdingsChartData = useMemo(() => {
        if (!holdingsForGroupedView.length) return { labels: [], datasets: [] };
        const chartItems = holdingsForGroupedView.map(h => ({ name: h.product_name, value: h.marketValueEUR })).sort((a, b) => b.value - a.value);
        const topN = 7;
        const top = chartItems.slice(0, topN);
        const other = chartItems.slice(topN);
        const labels = top.map(item => item.name);
        const data = top.map(item => item.value);
        if (other.length > 0) { labels.push('Outros'); data.push(other.reduce((sum, i) => sum + i.value, 0)); }
        return { labels, datasets: [{ data }] };
    }, [holdingsForGroupedView]);

    const unrealizedStockPL = useMemo(() => {
        if (!currentHoldingsValue) return 0;
        const totals = currentHoldingsValue.reduce((acc, h) => {
            acc.marketValue += h.market_value_eur || 0;
            acc.costBasis += Math.abs(h.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        return totals.marketValue - totals.costBasis;
    }, [currentHoldingsValue]);

    return {
        holdingsForGroupedView,
        detailedHoldingsForView,
        optionHoldings: optionHoldingsQuery.data,
        holdingsChartData,
        unrealizedStockPL,
        isLoading: results.some(q => q.isLoading),
        isError: results.some(q => q.isError)
    };
};