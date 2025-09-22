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
// --- INÍCIO DA ALTERAÇÃO ---
// Importar a função 'calculateDaysHeld'
import { getYearString, extractYearsFromData, calculateDaysHeld } from '../utils/dateUtils';
// --- FIM DA ALTERAÇÃO ---
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

    const isLoading = results.some(q => q.isLoading);
    const isError = results.some(q => q.isError);
    const error = results.find(q => q.error)?.error;

    const allData = useMemo(() => ({
        StockSaleDetails: stockSalesQuery.data,
        OptionSaleDetails: optionSalesQuery.data,
        dividendSummary: dividendSummaryQuery.data,
        DividendTransactionsList: dividendTransactionsQuery.data,
        StockHoldingsByYear: stockHoldingsByYearQuery.data,
        OptionHoldings: optionHoldingsQuery.data,
        FeeDetails: feesQuery.data,
        CurrentHoldingsValue: currentHoldingsValueQuery.data,
        AllTransactions: allTransactionsQuery.data,
    }), [
        stockSalesQuery.data, optionSalesQuery.data, dividendSummaryQuery.data,
        dividendTransactionsQuery.data, stockHoldingsByYearQuery.data, optionHoldingsQuery.data,
        currentHoldingsValueQuery.data, feesQuery.data, allTransactionsQuery.data
    ]);

    const portfolioMetrics = useMemo(() => {
        if (isLoading || !allData.CurrentHoldingsValue || !allData.AllTransactions) {
            return { totalPortfolioValue: 0, totalDeposits: 0, totalWithdrawals: 0, portfolioReturn: 0 };
        }
        const totalPortfolioValue = allData.CurrentHoldingsValue.reduce(
            (sum, holding) => sum + (holding.market_value_eur || 0), 0
        );
        const cashFlows = allData.AllTransactions.reduce((acc, tx) => {
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
    }, [isLoading, allData]);

    const availableYears = useMemo(() => {
        if (isLoading || !allData) return [ALL_YEARS_OPTION];
        const dateAccessors = { stockSales: 'SaleDate', optionSales: 'close_date', DividendTaxResult: null };
        const dataForYearExtraction = {
            stockSales: allData.StockSaleDetails,
            optionSales: allData.OptionSaleDetails,
            DividendTaxResult: allData.dividendSummary,
        };
        const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);
        const stockHoldingYears = allData.StockHoldingsByYear ? Object.keys(allData.StockHoldingsByYear) : [];
        const allYearsSet = new Set([...yearsFromUtil, ...stockHoldingYears]);
        const sortedYears = Array.from(allYearsSet)
            .filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED)
            .sort((a, b) => b.localeCompare(a));
        return [ALL_YEARS_OPTION, ...sortedYears];
    }, [allData, isLoading]);

    const aggregatedLifetimeMetricsByISIN = useMemo(() => {
        if (isLoading || !allData) return {};
        return calculateCombinedAggregatedMetricsByISIN(
            allData.AllTransactions,
            allData.StockSaleDetails,
            allData.OptionSaleDetails
        );
    }, [allData, isLoading]);

    const periodSpecificAggregatedMetricsByISIN = useMemo(() => {
        if (isLoading || !allData || selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
            return {};
        }
        const yearlyTransactions = (allData.AllTransactions || []).filter(tx => getYearString(tx.date) === selectedYear);
        const yearlyStockSales = (allData.StockSaleDetails || []).filter(sale => getYearString(sale.SaleDate) === selectedYear);
        
        return calculateCombinedAggregatedMetricsByISIN(yearlyTransactions, yearlyStockSales);
    }, [allData, selectedYear, isLoading]);

    const periodSpecificData = useMemo(() => {
        const defaultStructure = { stockSales: [], optionSales: [], dividendTransactions: [], fees: [], optionHoldings: [] };
        if (isLoading || !allData) return defaultStructure;
        const dataSet = {
            stockSales: allData.StockSaleDetails || [],
            optionSales: allData.OptionSaleDetails || [],
            dividendTransactions: allData.DividendTransactionsList || [],
            fees: allData.FeeDetails || [],
            optionHoldings: allData.OptionHoldings || [],
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
    }, [allData, selectedYear, isLoading]);

    const holdingsForGroupedView = useMemo(() => {
        const currentSystemYear = new Date().getFullYear().toString();
        const isCurrentOrTotalView = selectedYear === ALL_YEARS_OPTION || selectedYear === currentSystemYear;

        const metricsToUse = isCurrentOrTotalView
            ? aggregatedLifetimeMetricsByISIN
            : periodSpecificAggregatedMetricsByISIN;

        let baseHoldings = [];

        if (isCurrentOrTotalView) {
            baseHoldings = (allData.CurrentHoldingsValue || []).map(holding => ({
                ...holding,
                marketValueEUR: holding.market_value_eur,
                total_cost_basis_eur: Math.abs(holding.total_cost_basis_eur),
                isHistorical: false,
            }));
        } else if (allData.StockHoldingsByYear && allData.StockHoldingsByYear[selectedYear]) {
            const historicalLots = allData.StockHoldingsByYear[selectedYear];
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
        allData.CurrentHoldingsValue, 
        allData.StockHoldingsByYear, 
        aggregatedLifetimeMetricsByISIN,
        periodSpecificAggregatedMetricsByISIN
    ]);
    
    const unrealizedStockPL = useMemo(() => {
        if (!allData.CurrentHoldingsValue || selectedYear !== ALL_YEARS_OPTION) {
            return 0;
        }
        const totals = allData.CurrentHoldingsValue.reduce((acc, h) => {
            acc.marketValue += h.market_value_eur || 0;
            acc.costBasis += Math.abs(h.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        return totals.marketValue - totals.costBasis;
    }, [allData.CurrentHoldingsValue, selectedYear]);

    const summaryData = useMemo(() => {
        const stockPL = (periodSpecificData.stockSales || []).reduce((sum, s) => sum + (s.Delta || 0), 0);
        const optionPL = (periodSpecificData.optionSales || []).reduce((sum, s) => sum + (s.delta || 0), 0);
        
        const { gross, tax } = (periodSpecificData.dividendTransactions || []).reduce((acc, tx) => {
            if (tx.transaction_subtype === 'TAX') acc.tax += tx.amount_eur || 0;
            else acc.gross += tx.amount_eur || 0;
            return acc;
        }, { gross: 0, tax: 0 });

        const dividendPL = gross + tax;
        const totalFeesAndCommissions = (periodSpecificData.fees || []).reduce((sum, f) => sum + (f.amount_eur || 0), 0);
        
        const totalTaxesAndCommissions = totalFeesAndCommissions; 

        let totalPL = stockPL + optionPL + dividendPL + totalFeesAndCommissions;
        if (selectedYear === ALL_YEARS_OPTION) {
            totalPL += unrealizedStockPL;
        }

        // --- INÍCIO DA ALTERAÇÃO ---
        // 1. Cálculo do Win/Loss Ratio
        const stockSales = periodSpecificData.stockSales || [];
        const optionSales = periodSpecificData.optionSales || [];
        const winningTrades = stockSales.filter(s => s.Delta > 0).length + optionSales.filter(o => o.delta > 0).length;
        const totalTrades = stockSales.length + optionSales.length;
        const winLossRatio = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

        // 2. Cálculo do Período Médio de Detenção
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

        // (Opcional) Adicionar lógica para opções se a duração for relevante
        // optionSales.forEach(sale => { ... });
        
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
        // --- FIM DA ALTERAÇÃO ---
    }, [periodSpecificData, selectedYear, unrealizedStockPL]);

    const holdingsChartData = useMemo(() => {
        // CORREÇÃO: Retornar um objeto de gráfico vazio em vez de null
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
        allData, periodSpecificData, summaryData, unrealizedStockPL,
        derivedDividendTaxSummary: allData.dividendSummary,
        availableYears, holdingsChartData, holdingsForGroupedView,
        isHoldingsValueFetching: currentHoldingsValueQuery.isFetching,
        isLoading, isError, error,
        portfolioMetrics,
    };
};