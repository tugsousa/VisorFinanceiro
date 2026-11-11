// Helpers of the crypto assets: an asset is one coin, valued as the quantity held × its price in EUR from
// Yahoo Finance. The ticker is the coin's symbol followed by "-EUR" (BTC-EUR), as the backend stores it.

import { formatISODate, parseAmount } from './assetTypes';

/** What the user typed ("btc", "BTC-EUR") as the ticker the backend expects ("BTC-EUR"); '' when empty. */
export const normalizeTicker = (text) => {
    const ticker = String(text ?? '').trim().toUpperCase();
    if (!ticker) return '';
    return ticker.includes('-') ? ticker : `${ticker}-EUR`;
};

/** Whether a normalised ticker is one the backend accepts: a symbol quoted in EUR. */
export const isValidTicker = (ticker) => /^[A-Z0-9]{1,10}-EUR$/.test(ticker);

/** "BTC-EUR" as "BTC". */
export const coinSymbol = (ticker) => String(ticker || '').replace(/-EUR$/, '');

/** A quantity of coins: up to 8 decimals, without trailing zeros, as in "0,5" or "1 234,00000001". */
export const formatQuantity = (quantity) => Number(quantity).toLocaleString('pt-PT', { maximumFractionDigits: 8 });

/** The price of one coin in euros. Coins worth less than one euro keep more decimals. */
export const formatCoinPrice = (price) => {
    const value = Number(price);
    const decimals = value >= 1 ? 2 : 6;
    return `${value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: decimals })} €`;
};

/** Parses a quantity typed by the user; NaN unless it's a number greater than zero. */
export const parseQuantity = (text) => {
    const quantity = parseAmount(text);
    return quantity > 0 && Number.isFinite(quantity) ? quantity : NaN;
};

/** The second line of a crypto asset in the table: quantity, price, and whether the price is missing or old. */
export const cryptoDetail = (asset) => {
    const symbol = coinSymbol(asset.details?.ticker);
    if (!(asset.quantity > 0)) return `${symbol} · sem saldo`;
    const held = `${formatQuantity(asset.quantity)} ${symbol}`;
    if (asset.price_status === 'UNAVAILABLE') return `${held} · sem preço, conta ao custo`;
    const priced = `${held} × ${formatCoinPrice(asset.price_eur)}`;
    if (asset.price_status === 'STALE') return `${priced} · preço de ${formatISODate(asset.price_date)}`;
    return priced;
};
