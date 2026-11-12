import { parseDateRobust } from '../../../lib/utils/dateUtils';

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * The figures of a loss-harvest plan with some of its sales left out by the user.
 * The plan never takes more loss than the year's balance, so the sales left in keep the balance at zero or
 * above and the tax is simply the rate on what's left.
 * @param {object} plan - the answer of GET /api/tax/loss-harvest
 * @param {string[]} excluded - ISINs of the sales the user unticked
 */
export const summarizeHarvest = (plan, excluded = []) => {
    const left = new Set(excluded);
    const sales = (plan?.sales || []).filter(sale => !left.has(sale.isin));
    const before = plan?.year_before || { balance: 0, estimated_tax: 0 };
    const rate = plan?.tax_rate ?? 0.28;

    const totalLoss = round2(sales.reduce((sum, sale) => sum + sale.gain, 0));
    const totalSale = round2(sales.reduce((sum, sale) => sum + sale.sale_amount_eur, 0));
    // With every sale in, the backend's own figures (one FIFO run of all of them) are the ones to show.
    if (left.size === 0 && plan?.year_after && sales.length > 0) {
        return {
            sales, totalLoss, totalSale,
            balanceAfter: plan.year_after.balance,
            taxBefore: before.estimated_tax,
            taxAfter: plan.year_after.estimated_tax,
            taxSaved: plan.tax_saved,
        };
    }
    const balanceAfter = round2(before.balance + totalLoss);
    const taxAfter = round2(rate * Math.max(0, balanceAfter));
    return {
        sales,
        totalLoss,
        totalSale,
        balanceAfter,
        taxBefore: before.estimated_tax,
        taxAfter,
        taxSaved: round2(Math.max(0, before.estimated_tax - taxAfter)),
    };
};

/** Whole days from `today` to the deadline (DD-MM-YYYY), never below zero. */
export const daysUntil = (deadline, today = new Date()) => {
    const end = parseDateRobust(deadline);
    if (!end) return null;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.max(0, Math.round((last - start) / 86400000));
};

/** The purchase dates of the lots a sale uses, oldest first, without repeats ("01-12-2021, 03-02-2022"). */
export const lotDates = (sale) => [...new Set((sale?.lots || []).map(lot => lot.buy_date))].join(', ');
