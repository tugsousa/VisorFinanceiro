// frontend/src/utils/dateUtils.js
import { NO_YEAR_SELECTED } from '../constants';

/**
 * Robustly parses a date string from common formats (DD-MM-YYYY, YYYY-MM-DD).
 * @param {string} dateString - The date string to parse.
 * @returns {Date|null} A Date object in UTC or null if parsing fails.
 */
export const parseDateRobust = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;

  let parts;

  // Try DD-MM-YYYY
  parts = dateString.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[3], 10);
    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      // Verify date components to avoid issues like "31-02-2023" being parsed to "03-03-2023"
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
        return d;
      }
    }
  }

  // Try YYYY-MM-DD
  parts = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (parts) {
    const year = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[3], 10);
    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
        return d;
      }
    }
  }
  // console.warn(`dateUtils: Failed to parse date string: ${dateString}`);
  return null;
};

/**
 * Gets the full year from a date string.
 * @param {string} dateString - The date string.
 * @returns {number|null} The year or null.
 */
export const getYear = (dateString) => {
  const d = parseDateRobust(dateString);
  return d ? d.getUTCFullYear() : null;
};
/**
 * Gets the full year as a string from a date string.
 * @param {string} dateString - The date string.
 * @returns {string|null} The year as a string or null.
 */
export const getYearString = (dateString) => {
  const year = getYear(dateString);
  return year ? String(year) : null;
};


/**
 * Gets the month (1-12) from a date string, padded with a leading zero if needed.
 * @param {string} dateString - The date string.
 * @returns {string} The month as a string (e.g., "01", "12") or an empty string.
 */
export const getMonth = (dateString) => {
  const d = parseDateRobust(dateString);
  return d ? String(d.getUTCMonth() + 1).padStart(2, '0') : '';
};
/**
 * Gets the month index (0-11) from a date string.
 * @param {string} dateString - The date string.
 * @returns {number|null} The month index or null.
 */
export const getMonthIndex = (dateString) => {
    const d = parseDateRobust(dateString);
    return d ? d.getUTCMonth() : null;
};


/**
 * Gets the day of the month from a date string, padded with a leading zero if needed.
 * @param {string} dateString - The date string.
 * @returns {string} The day as a string (e.g., "01", "31") or an empty string.
 */
export const getDay = (dateString) => {
  const d = parseDateRobust(dateString);
  return d ? String(d.getUTCDate()).padStart(2, '0') : '';
};

/**
 * Calculates the number of days between two dates.
 * @param {string} startDateStr - The start date string.
 * @param {string} endDateStr - The end date string.
 * @returns {number|string} Number of days or 'N/A'.
 */
export const calculateDaysHeld = (startDateStr, endDateStr) => {
    const startDate = parseDateRobust(startDateStr);
    const endDate = parseDateRobust(endDateStr);
    if (!startDate || !endDate || endDate < startDate) return 'N/A';
    const differenceInTime = endDate.getTime() - startDate.getTime();
    // Ensure at least 1 day if dates are the same, or for very short holds spanning midnight
    const differenceInDays = Math.max(1, Math.round(differenceInTime / (1000 * 3600 * 24)));
    return differenceInDays;
};


export const extractYearsFromData = (data, dateFieldAccessors) => {
  const yearsSet = new Set();
  if (data && dateFieldAccessors) {
    Object.keys(dateFieldAccessors).forEach(dataType => {
      // Corrected data keys to match the API response
      const items = data[dataType] || (dataType === 'stockSales' ? data.StockSaleDetails : (dataType === 'optionSales' ? data.OptionSaleDetails : null));
      const accessor = dateFieldAccessors[dataType];
      if (Array.isArray(items)) {
        items.forEach(item => {
          const dateStr = typeof accessor === 'function' ? accessor(item) : item[accessor];
          const year = getYear(dateStr); // getYear returns number or null
          if (year) yearsSet.add(year);
        });
      } else if (dataType === 'DividendTaxResult' && typeof items === 'object' && items !== null) {
        Object.keys(items).forEach(yearStr => {
          const yearNum = parseInt(yearStr, 10);
          if (!isNaN(yearNum)) yearsSet.add(yearNum);
        });
      }
    });
  }
  const sortedYearNumbers = Array.from(yearsSet).sort((a, b) => b - a); // Descending numbers
  const sortedYearStrings = sortedYearNumbers.map(y => String(y));
  return sortedYearStrings;
};