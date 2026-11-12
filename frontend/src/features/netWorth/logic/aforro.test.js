import { describe, expect, it } from 'vitest';
import { aforroCaption, aforroExplanation, formatRatesMonth } from './aforro';

const plain = (text) => text.replace(/\s/g, ' ');

const estimate = {
    status: 'ok', series: 'F', value_eur: 10090.2, from_value_eur: 10000, from_date: '2026-04-11', difference_eur: 0,
    capitalisations: [
        { date: '2026-07-10', rate_pct: 2.5, rate_kind: 'official' },
        { date: '2026-10-10', rate_pct: 2.606, rate_kind: 'official' },
    ],
    next_capitalisation: '2027-01-10', rates_from: '2024-12', rates_through: '2026-11', counted_in_total: true,
};

describe('the value of a Certificado de Aforro worked out by the rates', () => {
    it('is summarised under the asset', () => {
        expect(plain(aforroCaption(estimate))).toBe('Calculado: +90,20 € em 2 capitalizações desde 11-04-2026 · próxima a 10-01-2027');
        expect(aforroCaption(undefined)).toBe('');
        expect(aforroCaption({ status: 'unavailable', reason: 'x' })).toBe('Valor indicado (sem cálculo automático)');
        expect(aforroCaption({ status: 'ok', capitalisations: [], from_date: '2026-11-01', next_capitalisation: '2027-02-01' }))
            .toBe('Calculado desde 01-11-2026, sem juros capitalizados ainda · próxima a 01-02-2027');
        expect(plain(aforroCaption({ ...estimate, status: 'rates_ended' }))).toContain('falta a taxa de um trimestre');
    });

    it('is explained with its rates and where the rates start and end', () => {
        const lines = aforroExplanation(estimate).map(plain);
        expect(lines[0]).toBe('A partir de 10 000,00 € a 11-04-2026, com os juros líquidos de 2 trimestres: 10-07-2026 a 2,5%, 10-10-2026 a 2,606%.');
        expect(lines[1]).toBe('Próxima capitalização: 10-01-2027.');
        expect(lines[2]).toContain('taxas publicadas pelo IGCP de 12/2024 até 11/2026');
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
