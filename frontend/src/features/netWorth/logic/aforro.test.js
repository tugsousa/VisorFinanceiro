import { describe, expect, it } from 'vitest';
import { aforroCaption, aforroExplanation, canAcceptEstimate, formatRatesMonth } from './aforro';

const plain = (text) => text.replace(/\s/g, ' ');

const estimate = {
    status: 'ok', series: 'F', value_eur: 10090.2, from_value_eur: 10000, from_date: '2026-04-11', difference_eur: 90.2,
    capitalisations: [
        { date: '2026-07-10', rate_pct: 2.5, rate_kind: 'official' },
        { date: '2026-10-10', rate_pct: 2.606, rate_kind: 'official' },
    ],
    next_capitalisation: '2027-01-10', rates_through: '2026-11', counted_in_total: false,
};

describe('the estimate of a Certificado de Aforro', () => {
    it('is summarised under the asset, always as an estimate', () => {
        expect(plain(aforroCaption(estimate))).toBe('Estimativa: 10 090,20 € (+90,20 €, 2 capitalizações desde 11-04-2026)');
        expect(aforroCaption(undefined)).toBe('');
        expect(aforroCaption({ status: 'unavailable', reason: 'x' })).toBe('Sem estimativa');
        expect(aforroCaption({ status: 'ok', capitalisations: [], next_capitalisation: '2027-01-10' })).toBe('Próxima capitalização a 10-01-2027');
    });

    it('can be accepted only when it adds something to the typed value', () => {
        expect(canAcceptEstimate(estimate)).toBe(true);
        expect(canAcceptEstimate({ ...estimate, capitalisations: [] })).toBe(false);
        expect(canAcceptEstimate({ ...estimate, difference_eur: 0 })).toBe(false); // already accepted
        expect(canAcceptEstimate({ status: 'unavailable', reason: 'x' })).toBe(false);
        expect(canAcceptEstimate(undefined)).toBe(false);
    });

    it('is explained with its rates and where the rates end', () => {
        const lines = aforroExplanation(estimate).map(plain);
        expect(lines[0]).toBe('A partir de 10 000,00 € (AforroNet, 11-04-2026), com os juros líquidos de 2 trimestres: 10-07-2026 a 2,5%, 10-10-2026 a 2,606%.');
        expect(lines[1]).toBe('Próxima capitalização: 10-01-2027.');
        expect(lines[2]).toContain('taxas publicadas pelo IGCP até 11/2026');
        expect(lines).toHaveLength(3);
    });

    it('gives the reason when it stops or does not exist', () => {
        const stopped = { ...estimate, status: 'rates_ended', reason: 'A aplicação não tem a taxa.' };
        expect(aforroExplanation(stopped)[1]).toBe('A aplicação não tem a taxa.');
        expect(aforroExplanation({ status: 'unavailable', reason: 'Há movimentos.' })).toEqual(['Há movimentos.']);
        expect(aforroExplanation({ ...estimate, uses_unofficial_rate: true })).toHaveLength(4);
        expect(formatRatesMonth('2026-11')).toBe('11/2026');
    });
});
