import { describe, expect, it } from 'vitest';
import { coinSymbol, cryptoDetail, formatCoinPrice, formatQuantity, isValidTicker, normalizeTicker, parseQuantity } from './crypto';

// toLocaleString separates with non-breaking spaces; compare with ordinary ones.
const plain = (text) => text.replace(/\s/g, ' ');

describe('normalizeTicker', () => {
    it('adds -EUR to a symbol and upper-cases it', () => {
        expect(normalizeTicker(' btc ')).toBe('BTC-EUR');
        expect(normalizeTicker('ETH-EUR')).toBe('ETH-EUR');
        expect(normalizeTicker('')).toBe('');
    });

    it('leaves another pair as typed, for the validation to refuse', () => {
        expect(normalizeTicker('btc-usd')).toBe('BTC-USD');
        expect(isValidTicker('BTC-USD')).toBe(false);
        expect(isValidTicker('BTC-EUR?x=1')).toBe(false);
        expect(isValidTicker('BTC-EUR')).toBe(true);
    });
});

describe('quantities and prices', () => {
    it('parses a quantity with a comma or a point', () => {
        expect(parseQuantity('0,5')).toBe(0.5);
        expect(parseQuantity('1.25')).toBe(1.25);
        expect(parseQuantity('0')).toBeNaN();
        expect(parseQuantity('-1')).toBeNaN();
        expect(parseQuantity('')).toBeNaN();
        expect(parseQuantity('abc')).toBeNaN();
    });

    it('formats up to 8 decimals without trailing zeros', () => {
        expect(formatQuantity(0.5)).toBe('0,5');
        expect(formatQuantity(0.00000001)).toBe('0,00000001');
        expect(formatQuantity(2)).toBe('2');
    });

    it('keeps more decimals for coins under one euro', () => {
        expect(plain(formatCoinPrice(61234))).toBe('61 234,00 €');
        expect(plain(formatCoinPrice(0.000123))).toBe('0,000123 €');
    });
});

describe('cryptoDetail', () => {
    const asset = { details: { ticker: 'BTC-EUR' }, quantity: 0.5, price_eur: 60000, price_status: 'OK' };

    it('shows the quantity and the price', () => {
        expect(coinSymbol('BTC-EUR')).toBe('BTC');
        expect(plain(cryptoDetail(asset))).toBe('0,5 BTC × 60 000,00 €');
    });

    it('says when the price is old or missing', () => {
        expect(plain(cryptoDetail({ ...asset, price_status: 'STALE', price_date: '2026-11-08' }))).toBe('0,5 BTC × 60 000,00 € · preço de 08-11-2026');
        expect(cryptoDetail({ ...asset, price_status: 'UNAVAILABLE', price_eur: undefined })).toBe('0,5 BTC · sem preço, conta ao custo');
    });

    it('says when nothing is held', () => {
        expect(cryptoDetail({ details: { ticker: 'BTC-EUR' } })).toBe('BTC · sem saldo');
    });
});
