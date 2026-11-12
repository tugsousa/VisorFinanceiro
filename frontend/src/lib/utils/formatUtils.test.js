import { describe, expect, it } from 'vitest';
import { formatQuantity } from './formatUtils';

// The thousands separator Intl uses for pt-PT (a non-breaking space), so the tests don't depend on typing it.
const GROUP = new Intl.NumberFormat('pt-PT').formatToParts(12345).find(part => part.type === 'group').value;

describe('formatQuantity', () => {
    it('writes quantities the Portuguese way', () => {
        expect(formatQuantity(0.9856)).toBe('0,9856');
        expect(formatQuantity(0.0004)).toBe('0,0004');
        expect(formatQuantity(0.000009)).toBe('0,000009');
        expect(formatQuantity(218)).toBe('218');
        expect(formatQuantity(-3.5)).toBe('-3,5');
    });

    it('keeps up to six decimals and drops float noise', () => {
        expect(formatQuantity(0.9856 + 218 + 0.0004 + 14 + 0.014)).toBe('233');
        expect(formatQuantity(1.23456789)).toBe('1,234568');
        expect(formatQuantity(-0.0000001)).toBe('0');
    });

    it('groups thousands like the amounts do', () => {
        expect(formatQuantity(1234.5)).toBe('1234,5');
        expect(formatQuantity(12345.678901)).toBe(`12${GROUP}345,678901`);
    });

    it('returns nothing for what is not a number', () => {
        expect(formatQuantity(undefined)).toBe('');
        expect(formatQuantity(null)).toBe('');
        expect(formatQuantity('5')).toBe('');
        expect(formatQuantity(NaN)).toBe('');
    });
});
