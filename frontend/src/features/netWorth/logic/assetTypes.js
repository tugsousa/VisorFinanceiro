// Labels and helpers of the other assets. The values match the backend (src/networth).

/** The types that can be created now, with the label of one asset. */
export const ASSET_TYPES = [
    { value: 'cash_account', label: 'Conta à ordem / poupança' },
    { value: 'term_deposit', label: 'Depósito a prazo' },
    { value: 'savings_certificate', label: 'Certificados de Aforro' },
    { value: 'ppr', label: 'PPR' },
    { value: 'real_estate', label: 'Imobiliário' },
    { value: 'other', label: 'Outro' },
];

/** The label of a group of assets, in the totals per type. */
export const TYPE_GROUP_LABELS = {
    brokers: 'Investimentos (corretoras)',
    cash_account: 'Contas',
    term_deposit: 'Depósitos a prazo',
    savings_certificate: 'Certificados de Aforro',
    ppr: 'PPR',
    crypto: 'Criptomoedas',
    real_estate: 'Imobiliário',
    other: 'Outros',
};

export const TYPE_COLORS = {
    brokers: '#178bba',
    cash_account: '#4caf50',
    term_deposit: '#ff9800',
    savings_certificate: '#9c27b0',
    ppr: '#3f51b5',
    crypto: '#f44336',
    real_estate: '#795548',
    other: '#9e9e9e',
};

export const typeLabel = (type) => ASSET_TYPES.find((t) => t.value === type)?.label || type;

export const CAPITALISATIONS = [
    { value: 'maturity', label: 'No vencimento (juro simples)' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'annual', label: 'Anual' },
];

/** Uses of a property. */
export const PROPERTY_USAGES = [
    { value: 'own_home', label: 'Habitação própria' },
    { value: 'rented', label: 'Arrendado' },
    { value: 'holiday', label: 'Férias / secundária' },
    { value: 'land', label: 'Terreno' },
    { value: 'other', label: 'Outro' },
];

export const usageLabel = (value) => PROPERTY_USAGES.find((u) => u.value === value)?.label || '';

/** Formats a percentage with one decimal, as in "4,8%". */
export const formatPct = (value) => `${Number(value).toLocaleString('pt-PT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

export const capitalisationLabel =(value) => CAPITALISATIONS.find((c) => c.value === value)?.label || value;

/** Kinds of entry the user can add by hand ("valuation" is added with "Atualizar valor"). */
export const MOVEMENT_KINDS = [
    { value: 'contribution', label: 'Entrega / depósito' },
    { value: 'withdrawal', label: 'Levantamento' },
    { value: 'interest', label: 'Juros / rendimento' },
];

export const ENTRY_KIND_LABELS = {
    contribution: 'Entrega / depósito',
    withdrawal: 'Levantamento',
    valuation: 'Atualização de valor',
    interest: 'Juros / rendimento',
};

/** Today as YYYY-MM-DD, in local time. */
export const todayISO = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** YYYY-MM-DD to DD-MM-YYYY, the date format of the rest of the app. */
export const formatISODate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

/** Parses a number typed with a comma or a point as the decimal separator; NaN if it isn't one. */
export const parseAmount = (text) => {
    if (text === null || text === undefined) return NaN;
    const cleaned = String(text).trim().replace(/\s/g, '').replace(',', '.');
    return cleaned === '' ? NaN : Number(cleaned);
};
