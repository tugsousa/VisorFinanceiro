import { describe, expect, it } from 'vitest';
import { daysUntil, lotDates, summarizeHarvest } from './lossHarvest';

const plan = {
    tax_rate: 0.28,
    year_before: { balance: 7737.53, estimated_tax: 2166.51 },
    sales: [
        { isin: 'BABA', gain: -1028.28, sale_amount_eur: 5302.88, lots: [{ buy_date: '01-12-2021' }, { buy_date: '03-02-2022' }] },
        { isin: 'EM', gain: -493.8, sale_amount_eur: 9448.91, lots: [{ buy_date: '01-09-2026' }, { buy_date: '01-09-2026' }] },
    ],
};

describe('the loss-harvest plan', () => {
    it('adds up every sale', () => {
        const summary = summarizeHarvest(plan);
        expect(summary.sales).toHaveLength(2);
        expect(summary.totalLoss).toBe(-1522.08);
        expect(summary.totalSale).toBe(14751.79);
        expect(summary.balanceAfter).toBe(6215.45);
        expect(summary.taxAfter).toBe(1740.33);
        expect(summary.taxSaved).toBe(426.18);
    });

    it("uses the backend's figures when every sale is in", () => {
        const fromBackend = { ...plan, year_after: { balance: 6215.45, estimated_tax: 1740.32 }, tax_saved: 426.19 };
        expect(summarizeHarvest(fromBackend)).toMatchObject({ taxAfter: 1740.32, taxSaved: 426.19, balanceAfter: 6215.45 });
        // Once a sale is left out, they're worked out here.
        expect(summarizeHarvest(fromBackend, ['BABA']).taxSaved).toBe(138.27);
    });

    it('leaves out the sales the user unticked', () => {
        const summary = summarizeHarvest(plan, ['BABA']);
        expect(summary.sales.map(s => s.isin)).toEqual(['EM']);
        expect(summary.balanceAfter).toBe(7243.73);
        expect(summary.taxSaved).toBe(138.27);
        expect(summarizeHarvest(plan, ['BABA', 'EM']).taxSaved).toBe(0);
    });

    it('never pays less than nothing', () => {
        const small = { ...plan, year_before: { balance: 100, estimated_tax: 28 } };
        expect(summarizeHarvest(small).taxAfter).toBe(0);
        expect(summarizeHarvest(small).taxSaved).toBe(28);
        expect(summarizeHarvest(null).sales).toEqual([]);
    });

    it('counts the days to the end of the year', () => {
        expect(daysUntil('31-12-2026', new Date(2026, 10, 12))).toBe(49);
        expect(daysUntil('31-12-2026', new Date(2026, 11, 31, 18))).toBe(0);
        expect(daysUntil('31-12-2026', new Date(2027, 0, 2))).toBe(0);
    });

    it('lists the purchase dates of the lots once', () => {
        expect(lotDates(plan.sales[0])).toBe('01-12-2021, 03-02-2022');
        expect(lotDates(plan.sales[1])).toBe('01-09-2026');
    });
});
