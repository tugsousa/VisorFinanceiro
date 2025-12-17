// frontend/src/utils/aggregationUtils.js

/**
 * Calculates lifetime aggregated metrics (realized P/L, dividends, commissions) for each ISIN.
 * This function now uses the complete list of all transactions for maximum accuracy.
 * @param {Array} allTransactions - The complete list of all processed transactions for the user.
 * @returns {Object} An object where keys are ISINs and values are the aggregated metrics.
 */
export const calculateAggregatedMetricsByISIN = (allTransactions) => {
  const metrics = {};

  // Helper to initialize a metric object for a given ISIN if it doesn't exist.
  const ensureMetric = (isin) => {
    if (!isin) return; // Guard against undefined or null ISINs
    if (!metrics[isin]) {
      metrics[isin] = {
        totalRealizedStockPL: 0,
        totalDividends: 0,
        totalCommissions: 0,
      };
    }
  };

  (allTransactions || []).forEach(tx => {
    const isin = tx.isin;
    if (!isin) return;

    ensureMetric(isin);

    // 1. Aggregate Realized P/L from Stock Sales
    // We identify a sale by its delta (profit/loss) being calculated on the backend.
    // The SaleDetail object has 'Delta', while a simple purchase does not.
    // A more robust way is to check the transaction type directly.
    if (tx.transaction_type === 'STOCK' && tx.buy_sell === 'SELL') {
        // NOTE: The detailed sale P/L is calculated by the stock processor. 
        // For lifetime P/L on the holdings page, we should sum from the sales data, not raw transactions.
        // This part will be handled by a different data source. The function signature should be updated.
    }
    
    // 2. Aggregate gross dividends received
    if (tx.transaction_type === 'DIVIDEND' && tx.transaction_subtype !== 'TAX') {
      metrics[isin].totalDividends += tx.amount_eur || 0;
    }

    // 3. Aggregate ALL commissions from any trade (buy or sell)
    if (tx.commission && tx.commission > 0) {
      metrics[isin].totalCommissions += tx.commission;
    }
  });

  // This utility is now primarily for commissions and dividends.
  // We will add the realized P/L from the dedicated sales data in the hook itself.
  return metrics;
};


/**
 * A new, more accurate function that combines data from multiple sources.
 * @param {Array} allTransactions - All processed transactions.
 * @param {Array} stockSales - All calculated stock sale details.
 * @param {Array} optionSales - All calculated option sale details.
 * @returns {Object} An object with aggregated metrics per ISIN.
 */
export const calculateCombinedAggregatedMetricsByISIN = (allTransactions, stockSales, optionSales) => {
    const metrics = {};

    const ensureMetric = (isin) => {
        if (!isin) return;
        if (!metrics[isin]) {
            metrics[isin] = {
                totalRealizedStockPL: 0,
                totalDividends: 0,
                totalCommissions: 0,
            };
        }
    };

    // 1. Sum Realized P/L from the definitive `stockSales` data
    (stockSales || []).forEach(sale => {
        if (sale.ISIN) {
            ensureMetric(sale.ISIN);
            metrics[sale.ISIN].totalRealizedStockPL += sale.Delta || 0;
        }
    });

    // 2. Sum Dividends and Commissions from the raw transaction list for completeness
    (allTransactions || []).forEach(tx => {
        const { isin, transaction_type, transaction_subtype, amount_eur, commission } = tx;
        if (!isin) return;
        
        ensureMetric(isin);

        // Sum gross dividends
        if (transaction_type === 'DIVIDEND' && transaction_subtype !== 'TAX') {
            metrics[isin].totalDividends += amount_eur || 0;
        }

        // Sum commissions from ALL transaction types (stock buys, sells, options, etc.)
        if (commission && commission > 0) {
            // Note: Degiro commissions are already in EUR. IBKR commissions are converted.
            // The `commission` field in ProcessedTransaction should represent the EUR value.
            let commissionEUR = commission;
            if (tx.source !== 'degiro' && tx.currency !== 'EUR' && tx.exchange_rate > 0) {
                 commissionEUR = commission / tx.exchange_rate;
            }
            metrics[isin].totalCommissions += commissionEUR;
        }
    });
    
    return metrics;
}