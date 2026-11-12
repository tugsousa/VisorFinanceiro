import { describe, expect, it } from 'vitest';
import { purchaseDates, soonLongTermPurchases } from './lotGrouping';

const TODAY = new Date(2026, 10, 12, 15, 30); // 12-11-2026, mid-afternoon

const lot = (buy_date, long_term_date, quantity, unrealized_gain, extra = {}) => ({
    buy_date, long_term_date, quantity, unrealized_gain, cost_eur: quantity * 45, value_eur: quantity * 45 + unrealized_gain,
    short_term: true, ...extra,
});

// The real case: one order on 17-11-2025, and on 18-11-2025 two orders filled as five executions.
const vaneck = {
    isin: 'NL0011683594',
    product_name: 'VANECK DEV MKT DVD LEADERS',
    current_price_eur: 57.22,
    lots: [
        lot('17-11-2025', '17-11-2026', 397, 4390.82),
        lot('18-11-2025', '18-11-2026', 0.9856, 11.39),
        lot('18-11-2025', '18-11-2026', 218, 2518.99),
        lot('18-11-2025', '18-11-2026', 0.0004, 0),
        lot('18-11-2025', '18-11-2026', 14, 161.56),
        lot('18-11-2025', '18-11-2026', 0.014, 0.16),
    ],
};

describe('purchases that reach 365 days soon', () => {
    it('adds up the executions of the same day into one purchase', () => {
        const rows = soonLongTermPurchases([vaneck], TODAY);
        expect(rows.map(r => [r.buy_date, r.quantity, r.executions, r.unrealized_gain])).toEqual([
            ['17-11-2025', 397, 1, 4390.82],
            ['18-11-2025', 233, 5, 2692.1],
        ]);
        expect(rows[1].long_term_date).toBe('18-11-2026');
        expect(rows[1].key).toBe('NL0011683594|18-11-2025');
    });

    it('keeps two assets bought on the same day apart, sorted by date and then ISIN', () => {
        const other = { isin: 'IE00A', product_name: 'A', current_price_eur: 10, lots: [lot('18-11-2025', '18-11-2026', 3, 1)] };
        const rows = soonLongTermPurchases([vaneck, other], TODAY);
        expect(rows.map(r => r.key)).toEqual(['NL0011683594|17-11-2025', 'IE00A|18-11-2025', 'NL0011683594|18-11-2025']);
    });

    it('sorts by the date, not by its text', () => {
        const p = { isin: 'X', product_name: 'X', current_price_eur: 1, lots: [
            lot('02-01-2026', '02-01-2027', 1, 0),
            lot('30-11-2025', '30-11-2026', 1, 0),
        ] };
        expect(soonLongTermPurchases([p], TODAY).map(r => r.buy_date)).toEqual(['30-11-2025', '02-01-2026']);
    });

    it('marks a position without a price instead of showing a result of zero', () => {
        const unpriced = { ...vaneck, current_price_eur: 0 };
        expect(soonLongTermPurchases([unpriced], TODAY).every(r => r.noPrice)).toBe(true);
        expect(soonLongTermPurchases([vaneck], TODAY).some(r => r.noPrice)).toBe(false);
    });

    it('leaves out lots already past 365 days', () => {
        const p = { isin: 'X', product_name: 'X', current_price_eur: 1, lots: [
            lot('18-11-2024', '18-11-2025', 5, 0, { short_term: false }),
            lot('18-11-2025', '18-11-2026', 2, 1),
        ] };
        const rows = soonLongTermPurchases([p], TODAY);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ quantity: 2, executions: 1 });
    });

    it('counts 90 days from today, whatever the time of day', () => {
        const p = { isin: 'X', product_name: 'X', current_price_eur: 1, lots: [
            lot('10-02-2026', '10-02-2027', 1, 0), // 90 days after 12-11-2026
            lot('11-02-2026', '11-02-2027', 1, 0), // 91 days
        ] };
        expect(soonLongTermPurchases([p], TODAY).map(r => r.long_term_date)).toEqual(['10-02-2027']);
    });

    it('has nothing without positions', () => {
        expect(soonLongTermPurchases(undefined, TODAY)).toEqual([]);
    });
});

describe('purchase dates of a position', () => {
    it('lists each day once, in FIFO order', () => {
        expect(purchaseDates(vaneck.lots)).toEqual(['17-11-2025', '18-11-2025']);
        expect(purchaseDates(undefined)).toEqual([]);
    });
});
