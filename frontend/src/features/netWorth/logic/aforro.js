// Helpers of the estimate of a Certificado de Aforro (asset.aforro_estimate from the API). The net worth
// counts the value typed from AforroNet; the estimate is that value plus the interest of the quarters that
// ended since, and only counts if the user accepts it.

import { formatISODate } from './assetTypes';

const euros = (value) => `${Number(value).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** "11/2026" for "2026-11". */
export const formatRatesMonth = (month) => (month ? month.split('-').reverse().join('/') : '');

/** Whether the estimate has something the user could accept: at least one quarter added to the typed value. */
export const canAcceptEstimate = (estimate) =>
    Boolean(estimate) && estimate.value_eur > 0 && (estimate.capitalisations || []).length > 0 && estimate.difference_eur !== 0;

/**
 * The line under a certificate in the assets table, or '' when it has no estimate to show. It always says
 * that it's an estimate and up to which month the app has rates.
 */
export const aforroCaption = (estimate) => {
    if (!estimate) return '';
    if (estimate.status === 'unavailable') return 'Sem estimativa';
    const count = (estimate.capitalisations || []).length;
    if (count === 0) {
        return estimate.next_capitalisation
            ? `Próxima capitalização a ${formatISODate(estimate.next_capitalisation)}`
            : 'Sem capitalizações desde o último valor';
    }
    const gain = estimate.value_eur - estimate.from_value_eur;
    const quarters = count === 1 ? '1 capitalização' : `${count} capitalizações`;
    return `Estimativa: ${euros(estimate.value_eur)} (+${euros(gain)}, ${quarters} desde ${formatISODate(estimate.from_date)})`;
};

/** The sentences that explain an estimate in the "Atualizar valor" dialog, one per line. */
export const aforroExplanation = (estimate) => {
    if (!estimate) return [];
    if (estimate.status === 'unavailable') return [estimate.reason].filter(Boolean);
    const lines = [];
    const count = (estimate.capitalisations || []).length;
    if (count > 0) {
        const rates = estimate.capitalisations.map((c) => `${formatISODate(c.date)} a ${Number(c.rate_pct).toLocaleString('pt-PT', { maximumFractionDigits: 3 })}%`).join(', ');
        lines.push(`A partir de ${euros(estimate.from_value_eur)} (AforroNet, ${formatISODate(estimate.from_date)}), com os juros líquidos de ${count === 1 ? 'um trimestre' : `${count} trimestres`}: ${rates}.`);
    } else {
        lines.push(`Ainda não houve capitalização de juros desde ${formatISODate(estimate.from_date)}.`);
    }
    if (estimate.reason) lines.push(estimate.reason);
    else if (estimate.next_capitalisation) lines.push(`Próxima capitalização: ${formatISODate(estimate.next_capitalisation)}.`);
    lines.push(`É uma estimativa: taxas publicadas pelo IGCP até ${formatRatesMonth(estimate.rates_through)}, juro trimestral de um quarto da taxa anual e retenção de 28%. Pode diferir do AforroNet em cêntimos.`);
    if (estimate.uses_unofficial_rate) lines.push('Algumas taxas usadas não foram lidas numa página do IGCP: foram deduzidas das taxas publicadas para a série F.');
    return lines;
};
