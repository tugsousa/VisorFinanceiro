// frontend/src/utils/formatUtils.js

/**
 * Formats a number as a currency string (EUR) with customizable options.
 * @param {number|null|undefined} value - The number to format.
 * @param {object} options - Options for Intl.NumberFormat, e.g., { minimumFractionDigits: 4 }.
 * @returns {string} The formatted currency string.
 */
export const formatCurrency = (value, options = {}) => {
  const defaultOptions = {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  const finalOptions = { ...defaultOptions, ...options };

  // --- INÍCIO DA CORREÇÃO ---
  // Garante que o número máximo de casas decimais é sempre igual ou superior ao mínimo.
  // Se for fornecido um `minimumFractionDigits` nos `options` que seja maior que
  // o `maximumFractionDigits` atual, atualiza o `maximumFractionDigits`.
  if (options.minimumFractionDigits && options.minimumFractionDigits > finalOptions.maximumFractionDigits) {
    finalOptions.maximumFractionDigits = options.minimumFractionDigits;
  }
  // --- FIM DA CORREÇÃO ---

  // Alterado de 'de-DE' para 'pt-PT' para usar o formato de moeda português.
  return new Intl.NumberFormat('pt-PT', finalOptions).format(value || 0);
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