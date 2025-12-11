// src/features/analytics/logic/holdingsCalculations.js
import { calculateAnnualizedReturn } from 'lib/utils/formatUtils';
import { calculateDaysHeld } from 'lib/utils/dateUtils';

/**
 * Transforms grouped holding data into grid rows, including calculating totals.
 * @param {Array} groupedData - The array of grouped holding objects.
 * @param {boolean} isGroupedFetching - Loading state for the grouped data.
 * @param {boolean} isHistorical - Flag indicating if data is historical snapshots.
 * @returns {Array} Array of row objects including a total summary row.
 */
export const transformGroupedHoldings = (groupedData, isGroupedFetching, isHistorical) => {
    if (!groupedData || groupedData.length === 0) return [];

    const standardRows = groupedData.map(item => {
        // Safe division to calculate cost per share
        const costPerShare = item.quantity > 0 ? item.total_cost_basis_eur / item.quantity : 0;
        
        // Calculate realized gains: Dividends + Realized Sales P/L - Commissions
        const realizedGains = (item.totalDividends || 0) + (item.totalRealizedStockPL || 0) - Math.abs(item.totalCommissions || 0);
        
        // Calculate unrealized P/L: Market Value - Cost Basis
        // If viewing historical snapshots (isHistorical=true), market values are static/snapshot based, 
        // so we often treat unrealized as 0 for P/L calculation purposes in this specific view logic 
        // unless explicitly provided otherwise.
        const unrealizedPL = !isHistorical ? ((item.marketValueEUR || 0) - (item.total_cost_basis_eur || 0)) : 0;
        
        let unrealizedPLPercentage = 0;
        if (unrealizedPL !== 0 && item.total_cost_basis_eur > 0) {
            unrealizedPLPercentage = (unrealizedPL / item.total_cost_basis_eur) * 100;
        }

        const totalProfitAmount = unrealizedPL + realizedGains;
        // Total Profit % relative to cost basis
        const totalProfitPercentage = (item.total_cost_basis_eur > 0) ? (totalProfitAmount / item.total_cost_basis_eur) * 100 : 0;

        return {
            id: item.isin,
            ...item,
            costPerShare,
            realizedGains,
            totalProfitAmount,
            totalProfitPercentage,
            unrealizedPL,
            unrealizedPLPercentage,
            isFetching: isGroupedFetching,
            isTotalRow: false,
        };
    });

    // Calculate Totals for the summary row
    const totals = standardRows.reduce((acc, row) => ({
        total_cost_basis_eur: acc.total_cost_basis_eur + (row.total_cost_basis_eur || 0),
        marketValueEUR: acc.marketValueEUR + (row.marketValueEUR || 0),
        totalDividends: acc.totalDividends + (row.totalDividends || 0),
        totalCommissions: acc.totalCommissions + (row.totalCommissions || 0),
        totalRealizedStockPL: acc.totalRealizedStockPL + (row.totalRealizedStockPL || 0),
        realizedGains: acc.realizedGains + (row.realizedGains || 0),
        unrealizedPL: acc.unrealizedPL + (row.unrealizedPL || 0),
        totalProfitAmount: acc.totalProfitAmount + (row.totalProfitAmount || 0),
    }), {
        total_cost_basis_eur: 0, 
        marketValueEUR: 0, 
        totalDividends: 0, 
        totalCommissions: 0,
        totalRealizedStockPL: 0, 
        realizedGains: 0, 
        unrealizedPL: 0, 
        totalProfitAmount: 0
    });

    const totalProfitPercentage = totals.total_cost_basis_eur > 0 
        ? (totals.totalProfitAmount / totals.total_cost_basis_eur) * 100 
        : 0;

    const totalRow = {
        id: 'TOTAL_SUMMARY_ROW',
        product_name_ticker: 'TOTAL',
        isin: '',
        isTotalRow: true,
        quantity: null,
        ...totals,
        totalProfitPercentage,
        isFetching: isGroupedFetching
    };

    return [...standardRows, totalRow];
};

/**
 * Transforms detailed holding data (individual lots) into grid rows.
 * @param {Array} detailedData - The array of individual holding lots.
 * @returns {Array} Processed rows for the detailed view.
 */
export const transformDetailedHoldings = (detailedData) => {
    if (!detailedData) return [];
    return detailedData
        .filter(holding => holding)
        .map((holding, index) => {
            const id = `${holding.isin}-${holding.buy_date}-${index}`;
            const daysHeld = calculateDaysHeld(holding.buy_date);
            const quantity = holding.quantity || 0;
            const currentPriceEUR = holding.current_price_eur || 0;
            
            // Ensure cost is positive for base calculations
            const buyAmountEUR = Math.abs(holding.buy_amount_eur || 0);
            const buyPricePerShareEUR = quantity > 0 ? (buyAmountEUR / quantity) : 0;
            
            const marketValueEUR = quantity * currentPriceEUR;
            const unrealizedPLPerShare = currentPriceEUR - buyPricePerShareEUR;
            const unrealizedPLTotal = marketValueEUR - buyAmountEUR;

            const returnPercentage = buyAmountEUR > 0 ? (unrealizedPLTotal / buyAmountEUR) * 100 : 0;
            const annualizedReturnStr = calculateAnnualizedReturn(unrealizedPLTotal, buyAmountEUR, daysHeld);

            return {
                id,
                ...holding,
                daysHeld,
                buy_amount_eur: buyAmountEUR, // Ensure positive
                marketValueEUR,
                currentPriceEUR,
                unrealizedPLTotal,
                unrealizedPLPerShare,
                returnPercentage,
                annualizedReturnStr
            };
        });
};