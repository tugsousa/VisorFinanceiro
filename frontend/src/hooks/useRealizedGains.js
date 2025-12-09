// frontend/src/hooks/useRealizedGains.js

// ... imports remain the same
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
    apiFetchStockSales,
    apiFetchOptionSales,
    apiFetchDividendTaxSummary,
    apiFetchDividendTransactions,
    apiFetchStockHoldings,
    apiFetchOptionHoldings,
    apiFetchCurrentHoldingsValue,
    apiFetchFees,
    apiFetchProcessedTransactions
} from '../api/apiService';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED } from '../constants';
import { getYearString, extractYearsFromData } from '../utils/dateUtils'; // Removed calculateDaysHeld
import { calculateCombinedAggregatedMetricsByISIN } from '../utils/aggregationUtils';

export const useRealizedGains = (token, selectedYear) => {
    // ... [Previous useQueries code remains exactly the same] ...
    const results = useQueries({
        queries: [
            { queryKey: ['stockSales', token], queryFn: apiFetchStockSales, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['optionSales', token], queryFn: apiFetchOptionSales, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data?.OptionSaleDetails || [] },
            { queryKey: ['dividendSummary', token], queryFn: apiFetchDividendTaxSummary, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || {} },
            { queryKey: ['dividendTransactions', token], queryFn: apiFetchDividendTransactions, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['stockHoldingsByYear', token], queryFn: apiFetchStockHoldings, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || {} },
            { queryKey: ['optionHoldings', token], queryFn: apiFetchOptionHoldings, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['currentHoldingsValue', token], queryFn: apiFetchCurrentHoldingsValue, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['fees', token], queryFn: apiFetchFees, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['allProcessedTransactions', token], queryFn: apiFetchProcessedTransactions, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
        ]
    });

    const [
        stockSalesQuery, optionSalesQuery, dividendSummaryQuery,
        dividendTransactionsQuery, stockHoldingsByYearQuery, optionHoldingsQuery,
        currentHoldingsValueQuery, feesQuery, allTransactionsQuery
    ] = results;

    const stockSalesData = stockSalesQuery.data;
    const optionSalesData = optionSalesQuery.data;
    const dividendSummaryData = dividendSummaryQuery.data;
    const dividendTransactionsData = dividendTransactionsQuery.data;
    const stockHoldingsByYearData = stockHoldingsByYearQuery.data;
    const optionHoldingsData = optionHoldingsQuery.data;
    const currentHoldingsValueData = currentHoldingsValueQuery.data;
    const feesData = feesQuery.data;
    const allTransactionsData = allTransactionsQuery.data;

    const isLoading = results.some(q => q.isLoading);
    const isError = results.some(q => q.isError);
    const error = results.find(q => q.error)?.error;

    // ... [portfolioMetrics, availableYears, aggregatedMetrics, periodSpecificAggregatedMetricsByISIN, periodSpecificData, holdingsForGroupedView LOGIC REMAINS THE SAME] ...
    // Copying the previous logic for context, but skipping lines for brevity where unchanged.
    
    // !!! Insert this block to ensure periodSpecificData is defined before summaryData use !!!
    const periodSpecificData = useMemo(() => {
        const defaultStructure = { stockSales: [], optionSales: [], dividendTransactions: [], fees: [], optionHoldings: [] };
        if (isLoading) return defaultStructure;
        const dataSet = {
            stockSales: stockSalesData || [],
            optionSales: optionSalesData || [],
            dividendTransactions: dividendTransactionsData || [],
            fees: feesData || [],
            optionHoldings: optionHoldingsData || [],
        };
        if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) return dataSet;
        const currentYear = new Date().getFullYear().toString();
        return {
            stockSales: dataSet.stockSales.filter(s => getYearString(s.SaleDate) === selectedYear),
            optionSales: dataSet.optionSales.filter(o => getYearString(o.close_date) === selectedYear),
            dividendTransactions: dataSet.dividendTransactions.filter(tx => getYearString(tx.date) === selectedYear),
            fees: dataSet.fees.filter(fee => getYearString(fee.date) === selectedYear),
            optionHoldings: selectedYear === currentYear ? dataSet.optionHoldings : [],
        };
    }, [stockSalesData, optionSalesData, dividendTransactionsData, feesData, optionHoldingsData, selectedYear, isLoading]);

    // ... [holdingsForGroupedView and unrealizedStockPL logic remain the same] ...
    
    const availableYears = useMemo(() => {
        if (isLoading) return [ALL_YEARS_OPTION];
        const dateAccessors = { stockSales: 'SaleDate', optionSales: 'close_date', DividendTaxResult: null };
        const dataForYearExtraction = {
            stockSales: stockSalesData,
            optionSales: optionSalesData,
            DividendTaxResult: dividendSummaryData,
        };
        const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);
        const stockHoldingYears = stockHoldingsByYearData ? Object.keys(stockHoldingsByYearData) : [];
        const allYearsSet = new Set([...yearsFromUtil, ...stockHoldingYears]);
        const sortedYears = Array.from(allYearsSet)
            .filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED)
            .sort((a, b) => b.localeCompare(a));
        return [ALL_YEARS_OPTION, ...sortedYears];
    }, [stockSalesData, optionSalesData, dividendSummaryData, stockHoldingsByYearData, isLoading]);

    const aggregatedLifetimeMetricsByISIN = useMemo(() => {
        if (isLoading || !allTransactionsData || !stockSalesData || !optionSalesData) return {};
        return calculateCombinedAggregatedMetricsByISIN(allTransactionsData, stockSalesData, optionSalesData);
    }, [allTransactionsData, stockSalesData, optionSalesData, isLoading]);

    const periodSpecificAggregatedMetricsByISIN = useMemo(() => {
        if (isLoading || !allTransactionsData || selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
            return {};
        }
        const yearlyTransactions = (allTransactionsData || []).filter(tx => getYearString(tx.date) === selectedYear);
        const yearlyStockSales = (stockSalesData || []).filter(sale => getYearString(sale.SaleDate) === selectedYear);
        const yearlyOptionSales = (optionSalesData || []).filter(sale => getYearString(sale.close_date) === selectedYear);
        
        return calculateCombinedAggregatedMetricsByISIN(yearlyTransactions, yearlyStockSales, yearlyOptionSales);
    }, [allTransactionsData, stockSalesData, optionSalesData, selectedYear, isLoading]);

    const holdingsForGroupedView = useMemo(() => {
        const currentSystemYear = new Date().getFullYear().toString();
        const isCurrentOrTotalView = selectedYear === ALL_YEARS_OPTION || selectedYear === currentSystemYear;

        const metricsToUse = isCurrentOrTotalView
            ? aggregatedLifetimeMetricsByISIN
            : periodSpecificAggregatedMetricsByISIN;

        let baseHoldings = [];

        if (isCurrentOrTotalView) {
            baseHoldings = (currentHoldingsValueData || []).map(holding => ({
                ...holding,
                marketValueEUR: holding.market_value_eur,
                total_cost_basis_eur: Math.abs(holding.total_cost_basis_eur),
                isHistorical: false,
            }));
        } else if (stockHoldingsByYearData && stockHoldingsByYearData[selectedYear]) {
            const historicalLots = stockHoldingsByYearData[selectedYear];
            const groupedMap = historicalLots.reduce((acc, lot) => {
                if (!acc[lot.isin]) {
                    acc[lot.isin] = { isin: lot.isin, product_name: lot.product_name, quantity: 0, total_cost_basis_eur: 0, isHistorical: true };
                }
                acc[lot.isin].quantity += lot.quantity;
                acc[lot.isin].total_cost_basis_eur += Math.abs(lot.buy_amount_eur);
                return acc;
            }, {});
            baseHoldings = Object.values(groupedMap);
        }

        return baseHoldings.map(holding => ({
            ...holding,
            ...(metricsToUse[holding.isin] || { totalRealizedStockPL: 0, totalDividends: 0, totalCommissions: 0 })
        }));
    }, [
        selectedYear, 
        currentHoldingsValueData, 
        stockHoldingsByYearData, 
        aggregatedLifetimeMetricsByISIN,
        periodSpecificAggregatedMetricsByISIN
    ]);

    const unrealizedStockPL = useMemo(() => {
        if (!currentHoldingsValueData || selectedYear !== ALL_YEARS_OPTION) {
            return 0;
        }
        const totals = currentHoldingsValueData.reduce((acc, h) => {
            acc.marketValue += h.market_value_eur || 0;
            acc.costBasis += Math.abs(h.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        return totals.marketValue - totals.costBasis;
    }, [currentHoldingsValueData, selectedYear]);

    const summaryData = useMemo(() => {
        if (isLoading || !allTransactionsData) return {};

        const stockSales = periodSpecificData.stockSales || [];
        const optionSales = periodSpecificData.optionSales || [];
        const fees = periodSpecificData.fees || [];
        const dividends = periodSpecificData.dividendTransactions || [];

        // 1. Basic P/L sums
        const stockPL = stockSales.reduce((sum, s) => sum + (s.Delta || 0), 0);
        const optionPL = optionSales.reduce((sum, s) => sum + (s.delta || 0), 0);
        
        const { gross } = dividends.reduce((acc, tx) => {
            if (tx.transaction_subtype !== 'TAX') {
                acc.gross += tx.amount_eur || 0;
            }
            return acc;
        }, { gross: 0 });
        const dividendPL = gross;

        const totalTaxesAndCommissions = fees.reduce((sum, f) => sum + (f.amount_eur || 0), 0);

        // 2. Total P/L Calculation
        let totalPL = stockPL + optionPL + dividendPL + totalTaxesAndCommissions;
        
        if (selectedYear === ALL_YEARS_OPTION) {
            totalPL += unrealizedStockPL;
        }

        // 3. Calculation of Net Invested Capital (Deposits + Withdrawals)
        let netDeposits = 0;
        let txsForCapital = allTransactionsData;
        
        if (selectedYear !== ALL_YEARS_OPTION) {
            txsForCapital = allTransactionsData.filter(tx => getYearString(tx.date) === selectedYear);
        }

        // UPDATED LOGIC: Sum all CASH transactions to get Net (Deposits are +, Withdrawals are -)
        netDeposits = txsForCapital.reduce((sum, tx) => {
            if (tx.transaction_type === 'CASH') {
                return sum + (tx.amount_eur || 0);
            }
            return sum;
        }, 0);

        // 4. ROI Calculation
        let returnPercentage = 0;
        if (selectedYear === ALL_YEARS_OPTION) {
             // We use netDeposits as the denominator. 
             // If Net Deposits <= 0 (you withdrew more than you put in), simple ROI is undefined.
            if (netDeposits > 0) {
                returnPercentage = (totalPL / netDeposits) * 100;
            } else {
                returnPercentage = null; // Hide % if capital is 0 or negative (infinite/undefined return)
            }
        } else {
            returnPercentage = null; 
        }

        // 5. Best and Worst Trades
        let bestTrade = { name: 'N/A', value: -Infinity };
        let worstTrade = { name: 'N/A', value: Infinity };

        const updateBestWorst = (name, value) => {
            if (value > bestTrade.value) bestTrade = { name, value };
            if (value < worstTrade.value) worstTrade = { name, value };
        };

        stockSales.forEach(s => updateBestWorst(s.ProductName, s.Delta));
        optionSales.forEach(o => updateBestWorst(o.product_name, o.delta));

        if (bestTrade.value === -Infinity) bestTrade = null;
        if (worstTrade.value === Infinity) worstTrade = null;

        return { 
            stockPL, 
            optionPL, 
            dividendPL, 
            totalTaxesAndCommissions, 
            totalPL,
            totalDeposits: netDeposits, 
            returnPercentage,
            bestTrade,
            worstTrade
        };
    }, [periodSpecificData, selectedYear, unrealizedStockPL, allTransactionsData, isLoading]);

    const holdingsChartData = useMemo(() => {
        if (!holdingsForGroupedView || holdingsForGroupedView.length === 0) return { labels: [], datasets: [] };

        const isHistorical = holdingsForGroupedView[0]?.isHistorical;
        const chartItems = holdingsForGroupedView.map(h => ({
            name: h.product_name,
            value: isHistorical ? h.total_cost_basis_eur : h.marketValueEUR,
        })).sort((a, b) => b.value - a.value);

        const topN = 7;
        const top = chartItems.slice(0, topN);
        const other = chartItems.slice(topN);
        const labels = top.map(item => item.name);
        const data = top.map(item => item.value);

        if (other.length > 0) {
            labels.push('Outros');
            data.push(other.reduce((sum, item) => sum + item.value, 0));
        }

        return { labels, datasets: [{ data }] };
    }, [holdingsForGroupedView]);

    return {
        stockSalesData,
        optionSalesData,
        dividendSummaryData,
        dividendTransactionsData,
        stockHoldingsByYearData,
        optionHoldingsData,
        feesData,
        allTransactionsData,
        currentHoldingsValueData,
        
        periodSpecificData, 
        summaryData, 
        unrealizedStockPL,
        derivedDividendTaxSummary: dividendSummaryData,
        availableYears, 
        holdingsChartData, 
        holdingsForGroupedView,
        isHoldingsValueFetching: currentHoldingsValueQuery.isFetching,
        isLoading, 
        isError, 
        error
    };
};