// Helpers of the target allocation tab that don't depend on React.

export const ALLOCATION_QUERY_KEY = 'allocation';

/** The tab of the Portfólio page that holds the target allocation, as in /portfolio?tab=alocacao. */
export const ALLOCATION_TAB = 'alocacao';

export const GROUP_COLORS = [
    '#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#0097a7',
    '#c2185b', '#795548', '#607d8b', '#fbc02d', '#5c6bc0',
];

/** A number typed by the user, accepting a comma as the decimal separator; NaN when it isn't one. */
export const parseUserNumber = (text) => {
    if (typeof text === 'number') return text;
    const cleaned = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (cleaned === '') return NaN;
    return Number(cleaned);
};

export const formatPct = (value, digits = 1) =>
    `${(value ?? 0).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

/** A difference in percentage points, with its sign. */
export const formatPP = (value, digits = 1) => {
    const v = value ?? 0;
    const sign = v > 0.0001 ? '+' : v < -0.0001 ? '−' : '';
    return `${sign}${Math.abs(v).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} p.p.`;
};

export const sumTargets = (rows) => rows.reduce((sum, r) => sum + (parseUserNumber(r.target_pct) || 0), 0);

export const targetsAddUp = (rows) => Math.abs(sumTargets(rows) - 100) <= 0.01;

let nextKey = 1;
export const newRowKey = () => `new-${nextKey++}`;

/**
 * The groups to start with the first time: one per group suggested for the holdings ("Ações",
 * "Obrigações"), with today's share as the target, rounded to whole numbers that add up to 100.
 */
export const suggestInitialGroups = (holdings) => {
    const values = {};
    (holdings || []).forEach(h => {
        const name = h.suggested_group || 'Ações';
        values[name] = (values[name] || 0) + Math.max(0, h.value_eur || 0);
    });
    const names = Object.keys(values);
    if (names.length === 0) {
        return [{ key: newRowKey(), name: 'Ações', target_pct: '100', color: GROUP_COLORS[0], includes_cash: false }];
    }
    names.sort((a, b) => values[b] - values[a]);
    const total = names.reduce((s, n) => s + values[n], 0);
    const targets = names.map(n => (total > 0 ? Math.round(values[n] / total * 100) : Math.round(100 / names.length)));
    targets[0] += 100 - targets.reduce((s, t) => s + t, 0);
    return names.map((name, i) => ({
        key: newRowKey(),
        name,
        target_pct: String(targets[i]),
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        includes_cash: false,
    }));
};

/** The rows of the groups editor for the saved groups. */
export const rowsFromGroups = (groups) => (groups || []).map((g, i) => ({
    key: `g-${g.id}`,
    id: g.id,
    name: g.name,
    target_pct: String(g.target_pct),
    color: g.color || GROUP_COLORS[i % GROUP_COLORS.length],
    includes_cash: g.includes_cash,
}));

/**
 * The choice of group of each holding in the assignments editor: the saved one, or else the
 * suggested one (marked as such).
 */
export const initialAssignments = (holdings) => {
    const result = {};
    (holdings || []).forEach(h => {
        if (h.group_id) {
            result[h.isin] = { groupId: h.group_id, preferred: h.preferred, suggested: false };
        } else {
            result[h.isin] = { groupId: h.suggested_group_id || '', preferred: false, suggested: Boolean(h.suggested_group_id) };
        }
    });
    return result;
};

/**
 * The choice of group of each asset kept outside the brokers, by asset id: the saved one, or none. Unlike
 * the holdings, these start in no group and get no suggestion: counting one in a portfolio is a choice.
 */
export const initialOtherChoices = (otherAssets) => {
    const result = {};
    (otherAssets || []).forEach(a => { result[a.id] = a.group_id || ''; });
    return result;
};

/** Whether the choices differ from what is saved. */
export const otherChoicesChanged = (otherAssets, choices) =>
    (otherAssets || []).some(a => (choices[a.id] || null) !== (a.group_id || null));

/** The assets outside the brokers that are in a group, as the API takes them. */
export const otherAssetsPayload = (otherAssets, choices) => (otherAssets || [])
    .filter(a => choices[a.id])
    .map(a => ({ other_asset_id: a.id, group_id: choices[a.id] }));

/** "2 ativos", "1 ativo + 1 fora da corretora", "2 fora da corretora": what a group holds, in words. */
export const groupContentsLabel = (holdingsCount, otherAssetsCount) => {
    const holdings = holdingsCount === 1 ? '1 ativo' : `${holdingsCount} ativos`;
    if (!otherAssetsCount) return holdings;
    const others = `${otherAssetsCount} fora da corretora`;
    return holdingsCount > 0 ? `${holdings} + ${others}` : others;
};

/** Why part of a group's excess can't be sold, in words. */
export const UNSOLD_REASON_LABELS = {
    outside_broker: 'está em ativos fora da corretora, que não se vendem aqui',
    no_price: 'está em ativos sem preço de mercado',
    under_one_share: 'é menos do que uma unidade',
};

/**
 * What the rebalancing plan has to say before its tables: 'on_target' when no group is over its target,
 * 'nothing_sellable' when there's an excess but nothing of it can be sold, 'plan' otherwise.
 */
export const rebalanceOutcome = (plan) => {
    const lines = plan?.lines || [];
    if (!lines.some(l => l.excess_eur > 0)) return 'on_target';
    if ((plan.sales || []).length === 0 && !(plan.cash_used_eur > 0)) return 'nothing_sellable';
    return 'plan';
};

/** The groups whose excess couldn't all be sold, with how much is left and why. */
export const unsoldLines = (plan) => (plan?.lines || [])
    .filter(l => l.unsold_eur > 0)
    .map(l => ({ groupId: l.group_id, name: l.name, amount: l.unsold_eur, reason: UNSOLD_REASON_LABELS[l.unsold_reason] || '' }));

/** Whether the tax of the sales together differs from the sum of each sale's own, which needs explaining. */
export const taxDiffersFromSum = (plan) => {
    const sum = (plan?.sales || []).reduce((total, s) => total + (s.marginal_tax || 0), 0);
    return Math.abs(sum - (plan?.total_tax_eur || 0)) > 0.005;
};

export const groupColor = (groups, groupId) => {
    const index = (groups || []).findIndex(g => g.id === groupId);
    if (index < 0) return '#9e9e9e';
    return groups[index].color || GROUP_COLORS[index % GROUP_COLORS.length];
};
