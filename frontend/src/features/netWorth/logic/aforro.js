// Helpers of the value of a Certificado de Aforro with a series (asset.aforro_estimate from the API). The app
// works it out from IGCP's rates: the amount subscribed, or a later value read on AforroNet, plus the interest
// of each quarter capitalised since. When counted_in_total is true, that's the value the net worth counts.

import { formatISODate } from './assetTypes';

const euros = (value) => `${Number(value).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** "11/2026" for "2026-11". */
export const formatRatesMonth = (month) => (month ? month.split('-').reverse().join('/') : '');

/**
 * The line under a certificate in the assets table, or '' when it isn't valued by the rates. It says where the
 * value comes from and, when the rates stop, that a quarter has no rate.
 */
export const aforroCaption = (estimate) => {
    if (!estimate) return '';
    if (estimate.status === 'unavailable') return 'Valor indicado (sem cálculo automático)';
    const count = (estimate.capitalisations || []).length;
    const parts = [];
    if (count === 0) {
        parts.push(`Calculado desde ${formatISODate(estimate.from_date)}, sem juros capitalizados ainda`);
    } else {
        const gain = estimate.value_eur - estimate.from_value_eur;
        const quarters = count === 1 ? '1 capitalização' : `${count} capitalizações`;
        parts.push(`Calculado: +${euros(gain)} em ${quarters} desde ${formatISODate(estimate.from_date)}`);
    }
    if (estimate.status === 'rates_ended') parts.push('falta a taxa de um trimestre');
    else if (estimate.status === 'matured') parts.push('vencido');
    else if (estimate.next_capitalisation) parts.push(`próxima a ${formatISODate(estimate.next_capitalisation)}`);
    return parts.join(' · ');
};

/** The sentences that explain the value in the "Atualizar valor" dialog, one per line. */
export const aforroExplanation = (estimate) => {
    if (!estimate) return [];
    if (estimate.status === 'unavailable') return [estimate.reason].filter(Boolean);
    const lines = [];
    const count = (estimate.capitalisations || []).length;
    if (count > 0) {
        const rates = estimate.capitalisations.map((c) => `${formatISODate(c.date)} a ${Number(c.rate_pct).toLocaleString('pt-PT', { maximumFractionDigits: 3 })}%`).join(', ');
        lines.push(`A partir de ${euros(estimate.from_value_eur)} a ${formatISODate(estimate.from_date)}, com os juros líquidos de ${count === 1 ? 'um trimestre' : `${count} trimestres`}: ${rates}.`);
    } else {
        lines.push(`Ainda não houve capitalização de juros desde ${formatISODate(estimate.from_date)}.`);
    }
    if (estimate.reason) lines.push(estimate.reason);
    else if (estimate.next_capitalisation) lines.push(`Próxima capitalização: ${formatISODate(estimate.next_capitalisation)}.`);
    lines.push(`Calculado com as taxas publicadas pelo IGCP ${estimate.rates_from ? `de ${formatRatesMonth(estimate.rates_from)} ` : ''}até ${formatRatesMonth(estimate.rates_through)}, juro trimestral de um quarto da taxa anual e retenção de 28%, como o simulador do IGCP. A partir de um valor do AforroNet pode diferir em cêntimos.`);
    if (estimate.uses_unofficial_rate) lines.push('Algumas taxas usadas não foram lidas numa página do IGCP: foram deduzidas das taxas publicadas para a série F.');
    return lines;
};
