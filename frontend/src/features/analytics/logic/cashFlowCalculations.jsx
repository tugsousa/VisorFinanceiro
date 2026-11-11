// frontend/src/features/analytics/logic/cashFlowCalculations.jsx
import { getYearString, parseDateRobust } from '../../../lib/utils/dateUtils';

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

const sumNet = (movements) => movements.reduce((sum, tx) => sum + (tx.amount_eur || 0), 0);

/**
 * Builds the series for the cash-flow chart: deposits and withdrawals per period, plus the
 * running net amount invested. The running total starts from everything deposited before
 * the period, so a single year still shows the real amount invested up to then.
 * @param {Array} allMovements - Every cash movement of the portfolio (not only the selected year).
 * @param {string} selectedYear - A year such as '2024', or ALL_YEARS_OPTION.
 * @param {string} allYearsOption - The value of ALL_YEARS_OPTION.
 * @param {Date} [today] - Used to stop the running total at the current month.
 * @returns {{labels: string[], deposited: number[], withdrawn: number[], cumulativeNet: Array<number|null>}}
 */
export const buildCashFlowTimeSeries = (allMovements, selectedYear, allYearsOption, today = new Date()) => {
    const dated = allMovements
        .map(tx => ({ tx, date: parseDateRobust(tx.date) }))
        .filter(({ date }) => date);

    if (dated.length === 0) return { labels: [], deposited: [], withdrawn: [], cumulativeNet: [] };

    let keys;
    let keyOf;
    let opening = 0;
    let lastKey;

    if (selectedYear === allYearsOption) {
        const years = dated.map(({ date }) => date.getFullYear());
        const first = Math.min(...years);
        const last = Math.max(...years);
        keys = Array.from({ length: last - first + 1 }, (_, i) => first + i);
        keyOf = (date) => date.getFullYear();
        lastKey = last;
    } else {
        const year = parseInt(selectedYear, 10);
        keys = Array.from({ length: 12 }, (_, i) => i);
        keyOf = (date) => (date.getFullYear() === year ? date.getMonth() : null);
        opening = sumNet(dated.filter(({ date }) => date.getFullYear() < year).map(({ tx }) => tx));
        // Months still to come in the current year have no running total yet.
        lastKey = year === today.getFullYear() ? today.getMonth() : 11;
    }

    const deposited = keys.map(() => 0);
    const withdrawn = keys.map(() => 0);
    const keyIndex = new Map(keys.map((key, i) => [key, i]));

    dated.forEach(({ tx, date }) => {
        const index = keyIndex.get(keyOf(date));
        if (index === undefined) return;
        const amount = tx.amount_eur || 0;
        if (tx.transaction_subtype === 'DEPOSIT') deposited[index] += amount;
        if (tx.transaction_subtype === 'WITHDRAWAL') withdrawn[index] += amount;
    });

    let running = opening;
    const cumulativeNet = keys.map((key, i) => {
        running += deposited[i] + withdrawn[i];
        return key > lastKey ? null : running;
    });

    return {
        labels: keys.map(String),
        deposited,
        withdrawn,
        cumulativeNet,
    };
};

/**
 * Adds up the deposits per broker, largest first.
 * @param {Array} movements - Cash movements.
 * @returns {Array<{broker: string, deposited: number}>}
 */
export const sumDepositsByBroker = (movements) => {
    const brokerMap = {};
    movements
        .filter(tx => tx.transaction_subtype === 'DEPOSIT')
        .forEach(tx => {
            const broker = formatBroker(tx.source);
            brokerMap[broker] = (brokerMap[broker] || 0) + (tx.amount_eur || 0);
        });
    return Object.entries(brokerMap)
        .map(([broker, deposited]) => ({ broker, deposited }))
        .sort((a, b) => b.deposited - a.deposited);
};

/**
 * Works out the average net amount invested per month in the selected period, and how the
 * selected year compares with the year before.
 * @param {Array} allMovements - Every cash movement of the portfolio.
 * @param {string} selectedYear - A year such as '2024', or ALL_YEARS_OPTION.
 * @param {string} allYearsOption - The value of ALL_YEARS_OPTION.
 * @param {Date} [today] - Used to count the months of the current year so far.
 * @returns {{monthlyAverage: number|null, firstDate: Date|null, growthPct: number|null}}
 */
export const getMonthlyNetStats = (allMovements, selectedYear, allYearsOption, today = new Date()) => {
    const dated = allMovements
        .map(tx => ({ tx, date: parseDateRobust(tx.date) }))
        .filter(({ date }) => date);

    if (dated.length === 0) return { monthlyAverage: null, firstDate: null, growthPct: null };

    if (selectedYear === allYearsOption) {
        const firstDate = new Date(Math.min(...dated.map(({ date }) => date.getTime())));
        const months = (today.getFullYear() - firstDate.getFullYear()) * 12
            + (today.getMonth() - firstDate.getMonth()) + 1;
        return {
            monthlyAverage: sumNet(dated.map(({ tx }) => tx)) / Math.max(months, 1),
            firstDate,
            growthPct: null,
        };
    }

    const year = parseInt(selectedYear, 10);
    const netOfYear = (y) => sumNet(dated.filter(({ date }) => date.getFullYear() === y).map(({ tx }) => tx));
    const months = year === today.getFullYear() ? today.getMonth() + 1 : 12;
    const net = netOfYear(year);
    const previousNet = netOfYear(year - 1);

    return {
        monthlyAverage: net / months,
        firstDate: null,
        growthPct: previousNet > 0 ? ((net - previousNet) / previousNet) * 100 : null,
    };
};
