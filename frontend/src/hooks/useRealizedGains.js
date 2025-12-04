// frontend/src/hooks/useRealizedGains.js
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
import { getYearString, extractYearsFromData, calculateDaysHeld } from '../utils/dateUtils';
import { calculateCombinedAggregatedMetricsByISIN } from '../utils/aggregationUtils';

export const useRealizedGains = (token, selectedYear) => {
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

    // Removido o useMemo allData

    const portfolioMetrics = useMemo(() => {
        if (isLoading || !currentHoldingsValueData || !allTransactionsData) {
            return { totalPortfolioValue: 0, totalDeposits: 0, totalWithdrawals: 0, portfolioReturn: 0 };
        }
        const totalPortfolioValue = currentHoldingsValueData.reduce(
            (sum, holding) => sum + (holding.market_value_eur || 0), 0
        );
        const cashFlows = allTransactionsData.reduce((acc, tx) => {
            if (tx.transaction_type === 'CASH') {
                if (tx.transaction_subtype === 'DEPOSIT') {
                    acc.deposits += tx.amount_eur || 0;
                } else if (tx.transaction_subtype === 'WITHDRAWAL') {
                    acc.withdrawals += tx.amount_eur || 0;
                }
            }
            return acc;
        }, { deposits: 0, withdrawals: 0 });
        const { deposits: totalDeposits, withdrawals: totalWithdrawals } = cashFlows;
        const totalGrowth = (totalPortfolioValue + Math.abs(totalWithdrawals)) - totalDeposits;
        let portfolioReturn = 0;
        if (totalDeposits > 0) {
            portfolioReturn = (totalGrowth / totalDeposits) * 100;
        }
        return {
            totalPortfolioValue,
            totalDeposits,
            totalWithdrawals,
            portfolioReturn,
        };
    }, [isLoading, currentHoldingsValueData, allTransactionsData]);

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
        return calculateCombinedAggregatedMetricsByISIN(
            allTransactionsData,
            stockSalesData,
            optionSalesData
        );
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
        const stockPL = (periodSpecificData.stockSales || []).reduce((sum, s) => sum + (s.Delta || 0), 0);
        const optionPL = (periodSpecificData.optionSales || []).reduce((sum, s) => sum + (s.delta || 0), 0);
        
        const { gross } = (periodSpecificData.dividendTransactions || []).reduce((acc, tx) => {
            if (tx.transaction_subtype !== 'TAX') {
                acc.gross += tx.amount_eur || 0;
            }
            return acc;
        }, { gross: 0 });

        const dividendPL = gross;
   

        const totalFeesAndCommissions = (periodSpecificData.fees || []).reduce((sum, f) => sum + (f.amount_eur || 0), 0);
        
        const totalTaxesAndCommissions = totalFeesAndCommissions; 

        let totalPL = stockPL + optionPL + dividendPL + totalFeesAndCommissions;
        if (selectedYear === ALL_YEARS_OPTION) {
            totalPL += unrealizedStockPL;
        }

        const stockSales = periodSpecificData.stockSales || [];
        const optionSales = periodSpecificData.optionSales || [];
        const winningTrades = stockSales.filter(s => s.Delta > 0).length + optionSales.filter(o => o.delta > 0).length;
        const totalTrades = stockSales.length + optionSales.length;
        const winLossRatio = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

        let totalDaysWinners = 0;
        let countWinners = 0;
        let totalDaysLosers = 0;
        let countLosers = 0;

        stockSales.forEach(sale => {
            const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
            if (typeof daysHeld === 'number') {
                if (sale.Delta > 0) {
                    totalDaysWinners += daysHeld;
                    countWinners++;
                } else if (sale.Delta < 0) {
                    totalDaysLosers += daysHeld;
                    countLosers++;
                }
            }
        });
        
        optionSales.forEach(sale => {
            const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
            if (typeof daysHeld === 'number') {
                if (sale.delta > 0) {
                    totalDaysWinners += daysHeld;
                    countWinners++;
                } else if (sale.delta < 0) {
                    totalDaysLosers += daysHeld;
                    countLosers++;
                }
            }
        });

        const avgHoldingPeriodWinners = countWinners > 0 ? totalDaysWinners / countWinners : 0;
        const avgHoldingPeriodLosers = countLosers > 0 ? totalDaysLosers / countLosers : 0;

        return { 
            stockPL, 
            optionPL, 
            dividendPL, 
            totalTaxesAndCommissions, 
            totalPL,
            winLossRatio,
            avgHoldingPeriodWinners,
            avgHoldingPeriodLosers,
        };
    }, [periodSpecificData, selectedYear, unrealizedStockPL]);

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
        // Expor resultados de query com um nome estável
        stockSalesData: stockSalesData,
        optionSalesData: optionSalesData,
        dividendSummaryData: dividendSummaryData,
        dividendTransactionsData: dividendTransactionsData,
        stockHoldingsByYearData: stockHoldingsByYearData,
        optionHoldingsData: optionHoldingsData,
        feesData: feesData,
        allTransactionsData: allTransactionsData,
        currentHoldingsValueData: currentHoldingsValueData,
        
        periodSpecificData, summaryData, unrealizedStockPL,
        derivedDividendTaxSummary: dividendSummaryData,
        availableYears, holdingsChartData, holdingsForGroupedView,
        isHoldingsValueFetching: currentHoldingsValueQuery.isFetching,
        isLoading, isError, error,
        portfolioMetrics,
    };
};