// frontend/src/features/analytics/logic/cashFlowCalculations.jsx
import { getYearString } from '../../../lib/utils/dateUtils';

export const formatBroker = (source) => (source ? source.toUpperCase() : '—');

const emptyTotals = () => ({ deposited: 0, withdrawn: 0, net: 0 });

const addToTotals = (totals, tx) => {
    const amount = tx.amount_eur || 0;
    if (tx.transaction_subtype === 'DEPOSIT') totals.deposited += amount;
    if (tx.transaction_subtype === 'WITHDRAWAL') totals.withdrawn += amount;
    // Withdrawals are stored as negative amounts, the same way the Dashboard adds them up.
    totals.net += amount;
};

export const getCashMovements = (transactions) => (transactions || []).filter(tx =>
    tx.transaction_type === 'CASH' &&
    (tx.transaction_subtype === 'DEPOSIT' || tx.transaction_subtype === 'WITHDRAWAL')
);

/**
 * Adds up cash movements overall, per year (newest first) and per broker within each year.
 * @param {Array} movements - The result of getCashMovements.
 * @returns {{totals: object, years: Array<{year: string, totals: object, brokers: Array}>}}
 */
export const summarizeCashMovements = (movements) => {
    const totals = emptyTotals();
    const yearMap = {};

    movements.forEach(tx => {
        const year = getYearString(tx.date) || 'Sem data';
        const broker = formatBroker(tx.source);

        if (!yearMap[year]) yearMap[year] = { year, totals: emptyTotals(), brokerMap: {} };
        if (!yearMap[year].brokerMap[broker]) yearMap[year].brokerMap[broker] = emptyTotals();

        addToTotals(totals, tx);
        addToTotals(yearMap[year].totals, tx);
        addToTotals(yearMap[year].brokerMap[broker], tx);
    });

    const years = Object.values(yearMap)
        .sort((a, b) => b.year.localeCompare(a.year))
        .map(({ year, totals: yearTotals, brokerMap }) => ({
            year,
            totals: yearTotals,
            brokers: Object.keys(brokerMap)
                .sort((a, b) => a.localeCompare(b))
                .map(broker => ({ broker, totals: brokerMap[broker] })),
        }));

    return { totals, years };
};
