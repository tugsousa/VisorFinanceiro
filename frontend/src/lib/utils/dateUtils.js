// frontend/src/lib/utils/dateUtils.js
import { parseISO, parse, getYear as getDateFnsYear, getMonth as getDateFnsMonth, getDate } from 'date-fns';

/**
 * Robustly parses a date string from common formats (DD-MM-YYYY, YYYY-MM-DD).
 * @param {string} dateString - The date string to parse.
 * @returns {Date|null} A Date object or null if parsing fails.
 */
export const parseDateRobust = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;

  try {
    // Try YYYY-MM-DD (ISO format)
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return parseISO(dateString);
    }
    
    // Try DD-MM-YYYY
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
        return parse(dateString, 'dd-MM-yyyy', new Date());
    }

    // Attempt generic parse for other variations if necessary
    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? null : parsed;

  } catch (error) {
    return null;
  }
};

/**
 * Gets the full year from a date string.
 * @param {string} dateString
 * @returns {number|null}
 */
export const getYear = (dateString) => {
  const d = parseDateRobust(dateString);
  return d ? getDateFnsYear(d) : null;
};

export const getYearString = (dateString) => {
  const year = getYear(dateString);
  return year ? String(year) : null;
};

export const getMonth = (dateString) => {
  const d = parseDateRobust(dateString);
  // date-fns getMonth returns 0-11
  return d ? String(getDateFnsMonth(d) + 1).padStart(2, '0') : '';
};

export const getMonthIndex = (dateString) => {
    const d = parseDateRobust(dateString);
    return d ? getDateFnsMonth(d) : null;
};

export const getDay = (dateString) => {
  const d = parseDateRobust(dateString);
  return d ? String(getDate(d)).padStart(2, '0') : '';
};

export const calculateDaysHeld = (startDateStr, endDateStr) => {
    const startDate = parseDateRobust(startDateStr);
    const endDate = parseDateRobust(endDateStr);
    
    if (!startDate || !endDate || endDate < startDate) return 'N/A';
    
    const differenceInTime = endDate.getTime() - startDate.getTime();
    const differenceInDays = Math.max(1, Math.round(differenceInTime / (1000 * 3600 * 24)));
    return differenceInDays;
};

export const extractYearsFromData = (data, dateFieldAccessors) => {
  const yearsSet = new Set();
  if (data && dateFieldAccessors) {
    Object.keys(dateFieldAccessors).forEach(dataType => {
      const items = data[dataType] || (dataType === 'stockSales' ? data.StockSaleDetails : (dataType === 'optionSales' ? data.OptionSaleDetails : null));
      const accessor = dateFieldAccessors[dataType];
      if (Array.isArray(items)) {
        items.forEach(item => {
          const dateStr = typeof accessor === 'function' ? accessor(item) : item[accessor];
          const year = getYear(dateStr); 
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
  const sortedYearNumbers = Array.from(yearsSet).sort((a, b) => b - a);
  return sortedYearNumbers.map(y => String(y));
};