import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
    apiFetchStockHoldings,
    apiFetchOptionHoldings,
    apiFetchCurrentHoldingsValue
} from 'features/analytics/api/analyticsApi';
import { usePortfolio } from '../PortfolioContext';

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
            }
        ]
    });

    const [stockHoldingsQuery, optionHoldingsQuery, currentHoldingsQuery] = results;
    const stockHoldingsByYear = stockHoldingsQuery.data || {};
    const currentHoldingsValue = currentHoldingsQuery.data || [];

    // --- FIX: Logic to prepare "Detailed View" data ---
    const detailedHoldingsForView = useMemo(() => {
        // If we have no historical data, return empty
        if (!stockHoldingsByYear || Object.keys(stockHoldingsByYear).length === 0) return [];

        // We want the most recent year's detailed lots for the "Current" view
        // Sort years descending (e.g. 2024, 2023...) and take the first one
        const latestYear = Object.keys(stockHoldingsByYear).sort((a, b) => b.localeCompare(a))[0];
        const targetData = stockHoldingsByYear[latestYear] || [];

        // Map current prices to these lots for P/L calculation
        const priceMap = {};
        currentHoldingsValue.forEach(h => {
            if (h.isin && h.current_price_eur) priceMap[h.isin] = h.current_price_eur;
        });

        return targetData.map(lot => ({
            ...lot,
            current_price_eur: priceMap[lot.isin] || 0
        }));
    }, [stockHoldingsByYear, currentHoldingsValue]);
    // --------------------------------------------------

    const holdingsForGroupedView = useMemo(() => {
        if (!currentHoldingsValue) return [];
        return currentHoldingsValue.map(holding => ({
            ...holding,
            marketValueEUR: holding.market_value_eur,
            total_cost_basis_eur: Math.abs(holding.total_cost_basis_eur),
            totalRealizedStockPL: 0, 
            totalDividends: 0, 
            totalCommissions: 0
        }));
    }, [currentHoldingsValue]);

    // ... (holdingsChartData and unrealizedStockPL logic remains the same)
    // Re-paste standard allocation chart logic here if needed, omitted for brevity as it was correct.
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
        detailedHoldingsForView, // <--- Export this new variable
        optionHoldings: optionHoldingsQuery.data,
        holdingsChartData,
        unrealizedStockPL,
        isLoading: results.some(q => q.isLoading),
        isError: results.some(q => q.isError)
    };
};