// frontend/src/utils/formatUtils.js

/**
 * Formats a number as a currency string (EUR).
 * @param {number|null|undefined} value - The number to format.
 * @returns {string} The formatted currency string.
 */
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
};

/**
 * Calculates an annualized return percentage.
 * @param {number|null|undefined} netReturn - The net profit or loss.
 * @param {number|null|undefined} costBasis - The initial investment amount.
 * @param {number|string} daysHeld - The number of days the investment was held.
 * @returns {string} Formatted annualized return string (e.g., "10.50%") or "N/A".
 */
export const calculateAnnualizedReturn = (netReturn, costBasis, daysHeld) => {
    const numDaysHeld = Number(daysHeld); // Works if daysHeld is number or numeric string

    if (
        typeof netReturn !== 'number' ||
        typeof costBasis !== 'number' ||
        costBasis === 0 ||
        isNaN(numDaysHeld) ||
        numDaysHeld <= 0
    ) {
        return 'N/A';
    }
    const annualized = (netReturn / Math.abs(costBasis)) * (365 / numDaysHeld) * 100;
    return `${annualized.toFixed(2)}%`;
};