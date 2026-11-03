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
 * Calculates the commissions paid in EUR for each ISIN, matching the backend's fee processor.
 * Every row of a DeGiro order stores the order's total commission (FX rows included), so a DeGiro
 * order counts once, from its commission rows. Orders without those rows use the stored commission.
 * Other sources store the commission of each execution on its own row, already in EUR.
 * @param {Array} transactions - Processed transactions, including the commission rows.
 * @returns {Object} An object where keys are ISINs and values are the commissions in EUR.
 */
const calculateCommissionsByISIN = (transactions) => {
    const commissions = {};
    const addCommission = (isin, amount) => {
        if (!isin) return;
        commissions[isin] = (commissions[isin] || 0) + amount;
    };

    const degiroOrders = new Map();
    transactions.forEach(tx => {
        if (tx.source !== 'degiro' || tx.transaction_type !== 'COMMISSION_DETAIL' || !tx.order_id) return;
        const order = degiroOrders.get(tx.order_id) || { isin: tx.isin, commission: 0 };
        order.commission -= tx.amount_eur || 0;
        degiroOrders.set(tx.order_id, order);
    });
    degiroOrders.forEach(({ isin, commission }) => addCommission(isin, Math.max(commission, 0)));

    const countedOrders = new Set(degiroOrders.keys());
    transactions.forEach(tx => {
        if (!(tx.commission > 0)) return;
        if (tx.source === 'degiro' && tx.order_id) {
            if (countedOrders.has(tx.order_id)) return;
            countedOrders.add(tx.order_id);
        }
        addCommission(tx.isin, tx.commission);
    });

    return commissions;
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

    // 2. Sum Dividends from the raw transaction list for completeness
    (allTransactions || []).forEach(tx => {
        const { isin, transaction_type, transaction_subtype, amount_eur } = tx;
        if (!isin) return;

        ensureMetric(isin);

        // Sum gross dividends
        if (transaction_type === 'DIVIDEND' && transaction_subtype !== 'TAX') {
            metrics[isin].totalDividends += amount_eur || 0;
        }
    });

    // 3. Sum Commissions from the raw transaction list
    Object.entries(calculateCommissionsByISIN(allTransactions || [])).forEach(([isin, commission]) => {
        ensureMetric(isin);
        metrics[isin].totalCommissions = commission;
    });

    return metrics;
}