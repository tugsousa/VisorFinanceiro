import { describe, it, expect } from 'vitest';
import { buildCalendarView, splitNet, describeNet } from './calendarTransformers';

const event = (overrides) => ({
    isin: 'X', product_name: 'X', ex_date: '01-01-2027', pay_date: null, pay_date_estimated: false,
    per_share: 1, currency: 'EUR', quantity: 1, gross_eur: 10, net_eur: 8.5, status: 'estimated', ...overrides,
});

const money = (v) => v.toFixed(2);

describe('splitNet and describeNet', () => {
    it('keeps the dividends without a net estimate apart', () => {
        const split = splitNet([
            event({ product_name: 'Accenture', gross_eur: 121.59, net_eur: null }),
            event({ product_name: 'VanEck', gross_eur: 170.1, net_eur: 144.58 }),
        ]);
        expect(split.gross).toBeCloseTo(291.69);
        expect(split.net).toBeCloseTo(144.58);
        expect(split.grossWithoutNet).toBeCloseTo(121.59);
        expect(split.withoutNet).toEqual(['Accenture']);
        expect(describeNet(split, money)).toBe('líquido 144.58 + 121.59 bruto sem retenção conhecida');
    });

    it('describes a complete, an unknown and an empty net', () => {
        expect(describeNet(splitNet([event({ net_eur: 8.5 })]), money)).toBe('líquido 8.50');
        expect(describeNet(splitNet([event({ net_eur: null })]), money)).toBe('retenção desconhecida');
        expect(describeNet(splitNet([]), money)).toBeNull();
    });
});

describe('buildCalendarView', () => {
    const calendar = {
        today: '11-11-2026',
        events: [
            event({ product_name: 'Accenture', ex_date: '13-10-2026', pay_date: '13-11-2026', status: 'announced', gross_eur: 121.59, net_eur: null }),
            event({ product_name: 'VanEck', ex_date: '03-12-2026', pay_date: '10-12-2026', pay_date_estimated: true, gross_eur: 170.1, net_eur: 144.58 }),
            event({ product_name: 'VanEck', ex_date: '04-03-2027', pay_date: '11-03-2027', pay_date_estimated: true, gross_eur: 132.3, net_eur: 112.45 }),
            // No pay date: placed on its ex-date
            event({ product_name: 'Accenture', ex_date: '09-04-2027', gross_eur: 116, net_eur: null }),
            // Gone ex, payment date unknown, still to come: placed on today
            event({ product_name: 'Late', ex_date: '01-10-2026', status: 'announced', gross_eur: 5, net_eur: 4 }),
            // From the current month + 12 on: out of the 12 months
            event({ product_name: 'TooFar', ex_date: '05-11-2027', gross_eur: 50 }),
            event({ product_name: 'VanEck', ex_date: '02-09-2026', pay_date: '09-09-2026', status: 'received', gross_eur: 252, net_eur: 214.2 }),
        ],
    };
    const view = buildCalendarView(calendar);

    it('takes the next 3 months, with the dividends without a net kept apart', () => {
        // Up to 11-02-2027: Late, Accenture (13-11) and VanEck (10-12)
        expect(view.near.count).toBe(3);
        expect(view.near.gross).toBeCloseTo(296.69);
        expect(view.near.net).toBeCloseTo(148.58);
        expect(view.near.grossWithoutNet).toBeCloseTo(121.59);
    });

    it('groups the next 12 months by month, leaving out the empty ones', () => {
        expect(view.upcomingMonths.map(m => m.label)).toEqual(['Novembro 2026', 'Dezembro 2026', 'Março 2027', 'Abril 2027']);
        expect(view.upcomingMonths[0].events.map(e => e.product_name)).toEqual(['Late', 'Accenture']);
        expect(view.upcomingMonths[0].split.grossWithoutNet).toBeCloseTo(121.59);
        expect(view.upcomingMonths[3].events[0].product_name).toBe('Accenture');
        expect(view.upcoming.some(e => e.product_name === 'TooFar')).toBe(false);
        expect(view.nextPayment.product_name).toBe('Late');
    });

    it('fills 12 chart months with the announced and estimated gross', () => {
        expect(view.chartMonths).toHaveLength(12);
        expect(view.chartMonths[0].announced).toBeCloseTo(126.59);
        expect(view.chartMonths[0].estimated).toBe(0);
        expect(view.chartMonths[1].estimated).toBeCloseTo(170.1);
        expect(view.chartMonths[2].announced + view.chartMonths[2].estimated).toBe(0);
        const total = view.chartMonths.reduce((s, m) => s + m.announced + m.estimated, 0);
        expect(total).toBeCloseTo(view.year.gross);
    });

    it('puts the dividends already gone in the past, newest first', () => {
        expect(view.past.map(e => e.status)).toEqual(['received']);
        expect(view.pastMonths.map(m => m.label)).toEqual(['Setembro 2026']);
    });
});
