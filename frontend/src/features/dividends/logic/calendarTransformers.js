import { parseDateRobust } from '../../../lib/utils/dateUtils';
import { MONTH_NAMES_CHART } from '../../../constants';

export const UPCOMING_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date a dividend is placed on: its payment date when known, otherwise its ex-date. */
export const keyDate = (event) => parseDateRobust(event.pay_date) || parseDateRobust(event.ex_date);

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Adds the parsed dates to each event and splits the calendar into the next UPCOMING_DAYS days, the last
 * months (already gone ex and paid, or not), and the next 12 months grouped by month.
 */
export const buildCalendarView = (calendar) => {
    const today = startOfDay(parseDateRobust(calendar?.today) || new Date());
    const upcomingLimit = new Date(today.getTime() + UPCOMING_DAYS * DAY_MS);

    const events = (calendar?.events || []).map((event, index) => {
        const exDate = parseDateRobust(event.ex_date);
        const date = keyDate(event);
        return { id: `${event.isin}-${event.ex_date}-${index}`, ...event, exDateObj: exDate, dateObj: date };
    });

    // Still to come: not paid yet (no received or missed status) and not before today.
    const isUpcoming = (e) => (e.status === 'announced' || e.status === 'estimated') && e.dateObj >= today;

    const upcoming = events
        .filter(e => isUpcoming(e) && e.dateObj <= upcomingLimit)
        .sort((a, b) => a.dateObj - b.dateObj);

    const past = events
        .filter(e => !isUpcoming(e))
        .sort((a, b) => b.dateObj - a.dateObj);

    // Twelve months from the current one; each dividend goes to the month of its key date.
    const months = [];
    for (let i = 0; i < 12; i++) {
        const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
        months.push({
            key: `${start.getFullYear()}-${start.getMonth()}`,
            label: `${MONTH_NAMES_CHART[start.getMonth()]} ${start.getFullYear()}`,
            year: start.getFullYear(),
            month: start.getMonth(),
            events: [],
            gross: 0,
            net: 0,
            netComplete: true,
        });
    }
    events.filter(isUpcoming).forEach(e => {
        const month = months.find(m => m.year === e.dateObj.getFullYear() && m.month === e.dateObj.getMonth());
        if (!month) return;
        month.events.push(e);
        month.gross += e.gross_eur;
        if (e.net_eur === null || e.net_eur === undefined) month.netComplete = false;
        else month.net += e.net_eur;
    });
    months.forEach(m => m.events.sort((a, b) => a.dateObj - b.dateObj));

    const sum = (list, field) => list.reduce((total, e) => total + (e[field] || 0), 0);
    return {
        today,
        upcoming,
        past,
        months,
        upcomingGross: sum(upcoming, 'gross_eur'),
        upcomingNet: sum(upcoming, 'net_eur'),
        upcomingNetComplete: upcoming.every(e => e.net_eur !== null && e.net_eur !== undefined),
        yearGross: sum(months.flatMap(m => m.events), 'gross_eur'),
    };
};

export const STATUS_LABELS = {
    announced: { label: 'Anunciado', color: 'primary', variant: 'filled' },
    estimated: { label: 'Estimado', color: 'default', variant: 'outlined' },
    received: { label: 'Recebido', color: 'success', variant: 'filled' },
    missed: { label: 'Não recebido', color: 'warning', variant: 'outlined' },
};

export const SKIP_REASONS = {
    no_ticker: 'sem ticker',
    market_data_error: 'erro ao obter os dados de mercado',
    no_exchange_rate: 'sem taxa de câmbio',
};
