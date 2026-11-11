import { describe, expect, it } from 'vitest';
import {
    groupContentsLabel, initialOtherChoices, otherAssetsPayload, otherChoicesChanged, rebalanceOutcome, taxDiffersFromSum, unsoldLines,
} from './allocationLogic';

describe('the rebalancing plan', () => {
    it('says when there is nothing to sell and when nothing can be sold', () => {
        expect(rebalanceOutcome({ lines: [{ excess_eur: 0 }, { excess_eur: 0 }], sales: [] })).toBe('on_target');
        expect(rebalanceOutcome({ lines: [{ excess_eur: 500, unsold_eur: 500 }], sales: [], cash_used_eur: 0 })).toBe('nothing_sellable');
        expect(rebalanceOutcome({ lines: [{ excess_eur: 500 }], sales: [{ isin: 'X' }] })).toBe('plan');
        // Taking the excess from the cash is a plan too, with no sale.
        expect(rebalanceOutcome({ lines: [{ excess_eur: 500 }], sales: [], cash_used_eur: 500 })).toBe('plan');
    });

    it('lists the groups left over their target, with the reason', () => {
        const plan = { lines: [
            { group_id: 1, name: 'Seguro', unsold_eur: 4000, unsold_reason: 'outside_broker' },
            { group_id: 2, name: 'Ações', unsold_eur: 0 },
        ] };
        expect(unsoldLines(plan)).toEqual([
            { groupId: 1, name: 'Seguro', amount: 4000, reason: 'está em ativos fora da corretora, que não se vendem aqui' },
        ]);
        expect(unsoldLines(undefined)).toEqual([]);
    });

    it('knows when the total tax is not the sum of the sales', () => {
        // A gain taxed 140 alone and a loss taxed 0 alone, 56 together.
        expect(taxDiffersFromSum({ sales: [{ marginal_tax: 140 }, { marginal_tax: 0 }], total_tax_eur: 56 })).toBe(true);
        expect(taxDiffersFromSum({ sales: [{ marginal_tax: 16.8 }], total_tax_eur: 16.8 })).toBe(false);
    });
});

describe('assets outside the brokers in the assignments editor', () => {
    const otherAssets = [
        { id: 1, name: 'Certificados de Aforro', group_id: 7 },
        { id: 2, name: 'Casa', group_id: null },
    ];

    it('starts from the saved group, and from no group otherwise', () => {
        expect(initialOtherChoices(otherAssets)).toEqual({ 1: 7, 2: '' });
        expect(initialOtherChoices(undefined)).toEqual({});
    });

    it('knows when a choice differs from what is saved', () => {
        expect(otherChoicesChanged(otherAssets, { 1: 7, 2: '' })).toBe(false);
        expect(otherChoicesChanged(otherAssets, { 1: 7, 2: 7 })).toBe(true);
        expect(otherChoicesChanged(otherAssets, { 1: '', 2: '' })).toBe(true);
        expect(otherChoicesChanged(otherAssets, { 1: 8, 2: '' })).toBe(true);
    });

    it('sends only the assets in a group', () => {
        expect(otherAssetsPayload(otherAssets, { 1: 7, 2: '' })).toEqual([{ other_asset_id: 1, group_id: 7 }]);
        expect(otherAssetsPayload(otherAssets, { 1: '', 2: '' })).toEqual([]);
    });
});

describe('groupContentsLabel', () => {
    it('says what a group holds', () => {
        expect(groupContentsLabel(1, 0)).toBe('1 ativo');
        expect(groupContentsLabel(2, undefined)).toBe('2 ativos');
        expect(groupContentsLabel(2, 1)).toBe('2 ativos + 1 fora da corretora');
        expect(groupContentsLabel(0, 2)).toBe('2 fora da corretora');
        expect(groupContentsLabel(0, 0)).toBe('0 ativos');
    });
});
