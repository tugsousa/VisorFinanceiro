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
    apiFetchCurrentHoldingsValue
} from '../api/apiService';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED } from '../constants';
import { getYearString, extractYearsFromData } from '../utils/dateUtils';

export const useRealizedGains = (token, selectedYear) => {
    const results = useQueries({
        queries: [
            { queryKey: ['stockSales', token], queryFn: apiFetchStockSales, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['optionSales', token], queryFn: apiFetchOptionSales, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data?.OptionSaleDetails || [] },
            { queryKey: ['dividendSummary', token], queryFn: apiFetchDividendTaxSummary, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || {} },
            { queryKey: ['dividendTransactions', token], queryFn: apiFetchDividendTransactions, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['stockHoldingsByYear', token], queryFn: apiFetchStockHoldings, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || {} },
            { queryKey: ['optionHoldings', token], queryFn: apiFetchOptionHoldings, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] },
            { queryKey: ['currentHoldingsValue', token], queryFn: apiFetchCurrentHoldingsValue, enabled: !!token, staleTime: 1000 * 60 * 5, select: (res) => res.data || [] }
        ]
    });

    const [
        stockSalesQuery,
        optionSalesQuery,
        dividendSummaryQuery,
        dividendTransactionsQuery,
        stockHoldingsByYearQuery,
        optionHoldingsQuery,
        currentHoldingsValueQuery
    ] = results;

    const isLoading = results.some(q => q.isLoading);
    const isError = results.some(q => q.isError);
    const error = results.find(q => q.error)?.error;

    const allData = useMemo(() => ({
        StockSaleDetails: stockSalesQuery.data,
        OptionSaleDetails: optionSalesQuery.data,
        dividendSummary: dividendSummaryQuery.data,
        DividendTransactionsList: dividendTransactionsQuery.data,
        StockHoldings: stockHoldingsByYearQuery.data,
        OptionHoldings: optionHoldingsQuery.data
    }), [
        stockSalesQuery.data,
        optionSalesQuery.data,
        dividendSummaryQuery.data,
        dividendTransactionsQuery.data,
        stockHoldingsByYearQuery.data,
        optionHoldingsQuery.data
    ]);

    const availableYears = useMemo(() => {
        if (isLoading || !allData) return [ALL_YEARS_OPTION];
        const dateAccessors = {
            stockSales: 'SaleDate',
            optionSales: 'close_date',
            DividendTaxResult: null,
        };
        const dataForYearExtraction = {
            stockSales: allData.StockSaleDetails,
            optionSales: allData.OptionSaleDetails,
            DividendTaxResult: allData.dividendSummary,
        };
        const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);
        const stockHoldingYears = allData.StockHoldings ? Object.keys(allData.StockHoldings) : [];
        const allYearsSet = new Set([...yearsFromUtil, ...stockHoldingYears]);
        const sortedYears = Array.from(allYearsSet)
            .filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED)
            .sort((a, b) => b.localeCompare(a));
        return [ALL_YEARS_OPTION, ...sortedYears];
    }, [allData, isLoading]);

    const filteredData = useMemo(() => {
        const defaultStructure = {
            StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
            OptionSaleDetails: [], DividendTransactionsList: [],
        };
        if (isLoading || !allData) return defaultStructure;

        let holdingsForSelectedPeriod = [];
        if (allData.StockHoldings) {
            if (selectedYear === ALL_YEARS_OPTION) {
                const latestYear = Object.keys(allData.StockHoldings).sort().pop();
                holdingsForSelectedPeriod = allData.StockHoldings[latestYear] || [];
            } else {
                holdingsForSelectedPeriod = allData.StockHoldings[selectedYear] || [];
            }
        }
        
        const dataSet = {
            StockHoldings: holdingsForSelectedPeriod,
            OptionHoldings: allData.OptionHoldings || [],
            StockSaleDetails: allData.StockSaleDetails || [],
            OptionSaleDetails: allData.OptionSaleDetails || [],
            DividendTransactionsList: allData.DividendTransactionsList || [],
        };

        if (selectedYear === ALL_YEARS_OPTION || !selectedYear) return dataSet;
        
        // CORREÇÃO: A lógica agora permite que as Posições em Opções apareçam para o ano atual.
        const currentYear = new Date().getFullYear().toString();
        const showOptionHoldings = selectedYear === currentYear;

        return {
            ...dataSet,
            OptionHoldings: showOptionHoldings ? dataSet.OptionHoldings : [],
            StockSaleDetails: dataSet.StockSaleDetails.filter(s => getYearString(s.SaleDate) === selectedYear),
            OptionSaleDetails: dataSet.OptionSaleDetails.filter(o => getYearString(o.close_date) === selectedYear),
            DividendTransactionsList: dataSet.DividendTransactionsList.filter(tx => getYearString(tx.date) === selectedYear),
        };
    }, [allData, selectedYear, isLoading]);

    const summaryPLs = useMemo(() => {
        const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
        const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
        let dividendPL = 0;
        const dividendSummary = allData.dividendSummary || {};

        if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
            Object.values(dividendSummary).forEach(yearData => {
                Object.values(yearData).forEach(countryData => {
                    dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
                });
            });
        } else if (dividendSummary[selectedYear]) {
            Object.values(dividendSummary[selectedYear]).forEach(countryData => {
                dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
            });
        }

        const totalPL = stockPL + optionPL + dividendPL;
        return { stockPL, optionPL, dividendPL, totalPL };
    }, [filteredData, allData.dividendSummary, selectedYear]);
    
    const unrealizedStockPL = useMemo(() => {
        if (!currentHoldingsValueQuery.data || currentHoldingsValueQuery.data.length === 0 || selectedYear !== ALL_YEARS_OPTION) {
            return 0;
        }
        const totals = currentHoldingsValueQuery.data.reduce((acc, holding) => {
            acc.marketValue += holding.market_value_eur || 0;
            acc.costBasis += Math.abs(holding.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        return totals.marketValue - totals.costBasis;
    }, [currentHoldingsValueQuery.data, selectedYear]);

    const holdingsForGroupedView = useMemo(() => {
        const currentYear = new Date().getFullYear().toString();
        const isCurrentView = selectedYear === ALL_YEARS_OPTION || selectedYear === currentYear;

        if (isCurrentView) {
            if (!currentHoldingsValueQuery.data) return [];
            return currentHoldingsValueQuery.data.map(holding => ({
                ...holding,
                total_cost_basis_eur: Math.abs(holding.total_cost_basis_eur),
                isHistorical: false,
            }));
        }

        if (allData.StockHoldings && allData.StockHoldings[selectedYear]) {
            const historicalLots = allData.StockHoldings[selectedYear];
            const groupedHoldingsMap = historicalLots.reduce((acc, lot) => {
                const isin = lot.isin || 'UNKNOWN';
                if (!acc[isin]) {
                    acc[isin] = { isin: isin, product_name: lot.product_name, quantity: 0, total_cost_basis_eur: 0, isHistorical: true };
                }
                acc[isin].quantity += lot.quantity;
                acc[isin].total_cost_basis_eur += Math.abs(lot.buy_amount_eur);
                return acc;
            }, {});
            return Object.values(groupedHoldingsMap);
        }
        return [];
    }, [selectedYear, currentHoldingsValueQuery.data, allData.StockHoldings]);

    const holdingsChartData = useMemo(() => {
        const dataForChart = holdingsForGroupedView;
        if (!dataForChart || dataForChart.length === 0) return null;

        const isHistorical = dataForChart[0]?.isHistorical === true;
        const holdingsForChart = dataForChart.map(holding => ({
            name: holding.product_name,
            value: isHistorical ? holding.total_cost_basis_eur : holding.market_value_eur,
        }));
        
        holdingsForChart.sort((a, b) => b.value - a.value);

        const topN = 7;
        const topHoldings = holdingsForChart.slice(0, topN);
        const otherHoldings = holdingsForChart.slice(topN);

        const labels = topHoldings.map(item => item.name);
        const data = topHoldings.map(item => item.value);

        if (otherHoldings.length > 0) {
            const othersValue = otherHoldings.reduce((sum, item) => sum + item.value, 0);
            labels.push('Outros');
            data.push(othersValue);
        }

        return { labels, datasets: [{ data }] };
    }, [holdingsForGroupedView]);
    
    const derivedDividendTaxSummary = dividendSummaryQuery.data;

    return {
        allData,
        filteredData,
        summaryPLs,
        unrealizedStockPL,
        derivedDividendTaxSummary,
        availableYears,
        holdingsChartData,
        holdingsForGroupedView,
        isHoldingsValueFetching: currentHoldingsValueQuery.isFetching,
        isLoading,
        isError,
        error,
    };
};