// frontend/src/lib/utils/formatUtils.js

/**
 * Formats a number as a currency string (EUR) with customizable options.
 * @param {number|null|undefined} value - The number to format.
 * @param {object} options - Options for Intl.NumberFormat.
 * @returns {string} The formatted currency string.
 */
export const formatCurrency = (value, options = {}) => {
  const val = value || 0;
  
  // Logic: if value is tiny (non-zero and abs < 0.01), show 4 decimals.
  const isTiny = val !== 0 && Math.abs(val) < 0.01;
  const defaults = {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: isTiny ? 4 : 2,
    maximumFractionDigits: isTiny ? 4 : 2,
  };

  const finalOptions = { ...defaults, ...options };

  // Safety: Ensure min <= max
  if (finalOptions.maximumFractionDigits !== undefined) {
      if (finalOptions.minimumFractionDigits > finalOptions.maximumFractionDigits) {
          finalOptions.minimumFractionDigits = finalOptions.maximumFractionDigits;
      }
  }

  return new Intl.NumberFormat('pt-PT', finalOptions).format(val);
};

export const calculateAnnualizedReturn = (netReturn, costBasis, daysHeld) => {
    const numDaysHeld = Number(daysHeld);

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