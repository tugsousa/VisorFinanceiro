import { ALL_YEARS_OPTION, NO_YEAR_SELECTED } from '../../../constants';
import { getYearString, extractYearsFromData } from '../../../lib/utils/dateUtils'; 
import { calculateCombinedAggregatedMetricsByISIN } from '../../../lib/utils/aggregationUtils';

export const filterPeriodSpecificData = (dataSet, selectedYear) => {
    if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) return dataSet;
    
    const currentYear = new Date().getFullYear().toString();
    
    return {
        stockSales: dataSet.stockSales.filter(s => getYearString(s.SaleDate) === selectedYear),
        optionSales: dataSet.optionSales.filter(o => getYearString(o.close_date) === selectedYear),
        dividendTransactions: dataSet.dividendTransactions.filter(tx => getYearString(tx.date) === selectedYear),
        fees: dataSet.fees.filter(fee => getYearString(fee.date) === selectedYear),
        // Option holdings are only "current", so we only show them if selected year matches current year
        optionHoldings: selectedYear === currentYear ? dataSet.optionHoldings : [],
    };
};

export const getAvailableYears = (data, stockHoldingsByYearData) => {
    const dateAccessors = { stockSales: 'SaleDate', optionSales: 'close_date', DividendTaxResult: null };
    const dataForYearExtraction = {
        stockSales: data.stockSalesData,
        optionSales: data.optionSalesData,
        DividendTaxResult: data.dividendSummaryData,
    };
    
    const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);
    const stockHoldingYears = stockHoldingsByYearData ? Object.keys(stockHoldingsByYearData) : [];
    
    const allYearsSet = new Set([...yearsFromUtil, ...stockHoldingYears]);
    const sortedYears = Array.from(allYearsSet)
        .filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED)
        .sort((a, b) => b.localeCompare(a));
        
    return [ALL_YEARS_OPTION, ...sortedYears];
};

export const calculateSummaryMetrics = (periodData, allTransactionsData, selectedYear, unrealizedStockPL) => {
    const stockSales = periodData.stockSales || [];
    const optionSales = periodData.optionSales || [];
    const fees = periodData.fees || [];
    const dividends = periodData.dividendTransactions || [];

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
    let txsForCapital = allTransactionsData || [];
    
    if (selectedYear !== ALL_YEARS_OPTION) {
        txsForCapital = txsForCapital.filter(tx => getYearString(tx.date) === selectedYear);
    }

    netDeposits = txsForCapital.reduce((sum, tx) => {
        if (tx.transaction_type === 'CASH') {
            return sum + (tx.amount_eur || 0);
        }
        return sum;
    }, 0);

    // 4. ROI Calculation
    let returnPercentage = null;
    if (selectedYear === ALL_YEARS_OPTION && netDeposits > 0) {
        returnPercentage = (totalPL / netDeposits) * 100;
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
};

export const prepareHoldingsForView = (selectedYear, currentHoldingsValueData, stockHoldingsByYearData, allTransactionsData, stockSalesData, optionSalesData) => {
    const currentSystemYear = new Date().getFullYear().toString();
    const isCurrentOrTotalView = selectedYear === ALL_YEARS_OPTION || selectedYear === currentSystemYear;

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

    // Calculate metrics to enrich holdings
    let metricsToUse = {};
    if (isCurrentOrTotalView) {
        // Lifetime metrics
        metricsToUse = calculateCombinedAggregatedMetricsByISIN(allTransactionsData || [], stockSalesData || [], optionSalesData || []);
    } else {
        // Period specific metrics
        const yearlyTransactions = (allTransactionsData || []).filter(tx => getYearString(tx.date) === selectedYear);
        const yearlyStockSales = (stockSalesData || []).filter(sale => getYearString(sale.SaleDate) === selectedYear);
        const yearlyOptionSales = (optionSalesData || []).filter(sale => getYearString(sale.close_date) === selectedYear);
        metricsToUse = calculateCombinedAggregatedMetricsByISIN(yearlyTransactions, yearlyStockSales, yearlyOptionSales);
    }

    return baseHoldings.map(holding => ({
        ...holding,
        ...(metricsToUse[holding.isin] || { totalRealizedStockPL: 0, totalDividends: 0, totalCommissions: 0 })
    }));
};