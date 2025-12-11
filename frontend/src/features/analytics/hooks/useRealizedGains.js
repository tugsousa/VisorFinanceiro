import { useMemo } from 'react';
import { ALL_YEARS_OPTION } from '../../../constants';
import { useDashboardData } from './useDashboardData';
import { 
    filterPeriodSpecificData, 
    getAvailableYears, 
    calculateSummaryMetrics, 
    prepareHoldingsForView 
} from '../logic/dashboardTransformers';

export const useRealizedGains = (token, selectedYear) => {
    // 1. Fetch Data
    const { 
        stockSalesData, optionSalesData, dividendSummaryData,
        dividendTransactionsData, stockHoldingsByYearData, optionHoldingsData,
        currentHoldingsValueData, feesData, allTransactionsData,
        isHoldingsValueFetching, isLoading, isError, error
    } = useDashboardData(token);

    // 2. Transform Data using extracted logic
    const periodSpecificData = useMemo(() => {
        if (isLoading) return { stockSales: [], optionSales: [], dividendTransactions: [], fees: [], optionHoldings: [] };
        
        const rawData = {
            stockSales: stockSalesData || [],
            optionSales: optionSalesData || [],
            dividendTransactions: dividendTransactionsData || [],
            fees: feesData || [],
            optionHoldings: optionHoldingsData || [],
        };
        
        return filterPeriodSpecificData(rawData, selectedYear);
    }, [stockSalesData, optionSalesData, dividendTransactionsData, feesData, optionHoldingsData, selectedYear, isLoading]);

    const availableYears = useMemo(() => {
        if (isLoading) return [ALL_YEARS_OPTION];
        return getAvailableYears({ stockSalesData, optionSalesData, dividendSummaryData }, stockHoldingsByYearData);
    }, [stockSalesData, optionSalesData, dividendSummaryData, stockHoldingsByYearData, isLoading]);

    const unrealizedStockPL = useMemo(() => {
        if (!currentHoldingsValueData || selectedYear !== ALL_YEARS_OPTION) return 0;
        const totals = currentHoldingsValueData.reduce((acc, h) => {
            acc.marketValue += h.market_value_eur || 0;
            acc.costBasis += Math.abs(h.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        return totals.marketValue - totals.costBasis;
    }, [currentHoldingsValueData, selectedYear]);

    const summaryData = useMemo(() => {
        if (isLoading) return {};
        return calculateSummaryMetrics(periodSpecificData, allTransactionsData, selectedYear, unrealizedStockPL);
    }, [periodSpecificData, allTransactionsData, selectedYear, unrealizedStockPL, isLoading]);

    const holdingsForGroupedView = useMemo(() => {
        if (isLoading) return [];
        return prepareHoldingsForView(
            selectedYear, 
            currentHoldingsValueData, 
            stockHoldingsByYearData, 
            allTransactionsData, 
            stockSalesData, 
            optionSalesData
        );
    }, [selectedYear, currentHoldingsValueData, stockHoldingsByYearData, allTransactionsData, stockSalesData, optionSalesData, isLoading]);

    // Simple transformation for chart data (can stay here or move to logic if reused)
    const holdingsChartData = useMemo(() => {
        if (!holdingsForGroupedView || holdingsForGroupedView.length === 0) return { labels: [], datasets: [] };
        // This is purely visual formatting for one specific chart, kept light here.
        return { labels: [], datasets: [] }; // Placeholder, logic handled in component usually now
    }, [holdingsForGroupedView]);

    return {
        // Raw Data (Pass through)
        stockSalesData, optionSalesData, dividendSummaryData,
        dividendTransactionsData, stockHoldingsByYearData, optionHoldingsData,
        feesData, allTransactionsData, currentHoldingsValueData,
        
        // Derived Data
        periodSpecificData, 
        summaryData, 
        unrealizedStockPL,
        derivedDividendTaxSummary: dividendSummaryData,
        availableYears, 
        holdingsChartData, 
        holdingsForGroupedView,
        
        // Status
        isHoldingsValueFetching,
        isLoading, 
        isError, 
        error
    };
};