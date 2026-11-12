import { parseDateRobust } from '../../../lib/utils/dateUtils';

const round2 = (value) => Math.round(value * 100) / 100;
const round6 = (value) => Number(value.toFixed(6));

/**
 * The purchase dates of a position's lots, without repeats, in the order of the lots (FIFO, oldest first).
 * A broker can fill one order in several executions, each its own lot; they all share the purchase date.
 */
export const purchaseDates = (lots) => [...new Set((lots || []).map(lot => lot.buy_date))];

/**
 * The purchases still under 365 days that reach them within `days` days of `today`, one per ISIN and
 * purchase date: the lots of the same day (every execution of the day's orders) add up into one, since they
 * all reach 365 days on the same date. Sorted by that date, then ISIN.
 * @param {object[]} positions - `positions` of GET /api/tax/year-status
 * @returns {{key: string, isin: string, product_name: string, buy_date: string, long_term_date: string,
 *   quantity: number, cost_eur: number, value_eur: number, unrealized_gain: number, executions: number,
 *   noPrice: boolean}[]}
 */
export const soonLongTermPurchases = (positions, today = new Date(), days = 90) => {
    const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    const groups = new Map();
    (positions || []).forEach(position => {
        const noPrice = !(position.current_price_eur > 0);
        (position.lots || []).forEach(lot => {
            if (!lot.short_term) return;
            const date = parseDateRobust(lot.long_term_date);
            if (!date || date > limit) return;
            const key = `${position.isin}|${lot.buy_date}`;
            let group = groups.get(key);
            if (!group) {
                group = {
                    key,
                    isin: position.isin,
                    product_name: position.product_name,
                    buy_date: lot.buy_date,
                    long_term_date: lot.long_term_date,
                    date,
                    quantity: 0,
                    cost_eur: 0,
                    value_eur: 0,
                    unrealized_gain: 0,
                    executions: 0,
                    noPrice,
                };
                groups.set(key, group);
            }
            group.quantity += lot.quantity;
            group.cost_eur += lot.cost_eur;
            group.value_eur += lot.value_eur;
            group.unrealized_gain += lot.unrealized_gain;
            group.executions += 1;
        });
    });

    return [...groups.values()]
        .sort((a, b) => (a.date - b.date) || a.isin.localeCompare(b.isin))
        .map(({ date, ...group }) => ({
            ...group,
            quantity: round6(group.quantity),
            cost_eur: round2(group.cost_eur),
            value_eur: round2(group.value_eur),
            unrealized_gain: round2(group.unrealized_gain),
        }));
};
