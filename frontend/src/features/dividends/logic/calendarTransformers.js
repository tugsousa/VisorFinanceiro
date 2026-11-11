import { parseDateRobust } from '../../../lib/utils/dateUtils';
import { MONTH_NAMES_CHART } from '../../../constants';

/** The short-term window of the first card, in calendar months from today. */
export const NEAR_MONTHS = 3;
/** The calendar ahead covers the current month and the next 11. */
export const YEAR_MONTHS = 12;

export const MONTH_NAMES_FULL = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** The date a dividend is placed on: its payment date when known, otherwise its ex-date. */
export const keyDate = (event) => parseDateRobust(event.pay_date) || parseDateRobust(event.ex_date);

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

/** Still to be paid: announced (including gone ex, payment to come) or estimated. */
export const isStillToCome = (event) => event.status === 'announced' || event.status === 'estimated';

const hasNet = (event) => event.net_eur !== null && event.net_eur !== undefined;

/**
 * The gross and net of a list of dividends, keeping apart the ones without a net estimate (no withholding
 * history), so a total never leaves them out silently.
 */
export const splitNet = (events) => {
    const split = { count: events.length, gross: 0, net: 0, netCount: 0, grossWithoutNet: 0, withoutNet: [] };
    events.forEach(e => {
        split.gross += e.gross_eur || 0;
        if (hasNet(e)) {
            split.net += e.net_eur;
            split.netCount += 1;
        } else {
            split.grossWithoutNet += e.gross_eur || 0;
            if (!split.withoutNet.includes(e.product_name)) split.withoutNet.push(e.product_name);
        }
    });
    return split;
};

/**
 * The net of a splitNet result as text, with format turning a number into money:
 * every net known → "líquido X"; some → "líquido X + Y bruto sem retenção conhecida";
 * none → "retenção desconhecida"; no dividends → null.
 */
export const describeNet = (split, format) => {
    if (!split || split.count === 0) return null;
    if (split.netCount === 0) return 'retenção desconhecida';
    if (split.grossWithoutNet === 0) return `líquido ${format(split.net)}`;
    return `líquido ${format(split.net)} + ${format(split.grossWithoutNet)} bruto sem retenção conhecida`;
};

/** Groups dividends by the month of their place date, in the order given; months without any are left out. */
export const groupByMonth = (events) => {
    const groups = [];
    events.forEach(e => {
        const date = e.placeDate;
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        let group = groups.find(g => g.key === key);
        if (!group) {
            group = { key, label: `${MONTH_NAMES_FULL[date.getMonth()]} ${date.getFullYear()}`, events: [] };
            groups.push(group);
        }
        group.events.push(e);
    });
    return groups.map(g => ({ ...g, split: splitNet(g.events) }));
};

/**
 * Adds the parsed dates to each event and splits the calendar into:
 * - upcoming: still to be paid, from the current month to YEAR_MONTHS months ahead, by date, and grouped by month;
 * - near: the upcoming ones up to NEAR_MONTHS months from today;
 * - past: the ones already gone (received or missed), newest first, and grouped by month;
 * - chartMonths: the YEAR_MONTHS months ahead, with the announced and the estimated gross of each.
 * A dividend gone ex whose payment date is unknown but still to come is placed on today.
 */
export const buildCalendarView = (calendar) => {
    const today = startOfDay(parseDateRobust(calendar?.today) || new Date());
    const nearLimit = addMonths(today, NEAR_MONTHS);
    const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearLimit = new Date(today.getFullYear(), today.getMonth() + YEAR_MONTHS, 1);

    const events = (calendar?.events || []).map((event, index) => {
        const date = keyDate(event);
        const placeDate = isStillToCome(event) && date < today ? today : date;
        return {
            id: `${event.isin}-${event.ex_date}-${index}`,
            ...event,
            exDateObj: parseDateRobust(event.ex_date),
            dateObj: date,
            placeDate,
        };
    });

    const upcoming = events
        .filter(e => isStillToCome(e) && e.placeDate >= firstMonth && e.placeDate < yearLimit)
        .sort((a, b) => a.placeDate - b.placeDate || a.product_name.localeCompare(b.product_name));
    const past = events
        .filter(e => !isStillToCome(e))
        .sort((a, b) => b.placeDate - a.placeDate || a.product_name.localeCompare(b.product_name));
    const near = upcoming.filter(e => e.placeDate <= nearLimit);

    const chartMonths = [];
    for (let i = 0; i < YEAR_MONTHS; i++) {
        const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const monthEvents = upcoming.filter(e =>
            e.placeDate.getFullYear() === start.getFullYear() && e.placeDate.getMonth() === start.getMonth());
        chartMonths.push({
            key: `${start.getFullYear()}-${start.getMonth()}`,
            label: `${MONTH_NAMES_CHART[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`,
            events: monthEvents,
            announced: monthEvents.filter(e => e.status === 'announced').reduce((s, e) => s + e.gross_eur, 0),
            estimated: monthEvents.filter(e => e.status === 'estimated').reduce((s, e) => s + e.gross_eur, 0),
        });
    }

    return {
        today,
        upcoming,
        past,
        upcomingMonths: groupByMonth(upcoming),
        pastMonths: groupByMonth(past),
        near: splitNet(near),
        nearLimit,
        nextPayment: upcoming[0] || null,
        year: splitNet(upcoming),
        chartMonths,
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
