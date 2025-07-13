// frontend/src/hooks/useRealizedGains.js

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetchRealizedGainsData } from '../api/apiService';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED } from '../constants';
import { getYearString, extractYearsFromData, parseDateRobust } from '../utils/dateUtils';

// Helper to process dividend transactions into a summary map
const processTransactionsToDividendSummary = (transactions) => {
  const result = {};
  if (!transactions || transactions.length === 0) return result;

  const roundToTwoDecimalPlaces = (value) => {
    if (typeof value !== 'number') return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  };

  transactions.forEach(t => {
    const transactionType = t.OrderType?.toLowerCase();
    if (transactionType !== 'dividend' && transactionType !== 'dividendtax') return;
    const year = getYearString(t.Date);
    if (!year) return;
    const countryFormattedString = t.CountryCode || 'Unknown';
    const amount = roundToTwoDecimalPlaces(t.AmountEUR);
    if (!result[year]) result[year] = {};
    if (!result[year][countryFormattedString]) result[year][countryFormattedString] = { gross_amt: 0, taxed_amt: 0 };
    if (transactionType === 'dividend') result[year][countryFormattedString].gross_amt += amount;
    else if (transactionType === 'dividendtax') result[year][countryFormattedString].taxed_amt += amount;
  });

  return result;
};

export const useRealizedGains = (token, selectedYear) => {
  const { data: allData, isLoading, isError, error } = useQuery({
    queryKey: ['realizedGainsData', token],
    queryFn: apiFetchRealizedGainsData,
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (response) => response.data,
  });

  // Memoize the derived dividend tax summary
  const derivedDividendTaxSummary = useMemo(() => {
    if (allData && allData.DividendTransactionsList) {
      return processTransactionsToDividendSummary(allData.DividendTransactionsList);
    }
    return {};
  }, [allData]);

  // Memoize the available years from all data sources
  const availableYears = useMemo(() => {
    if (!allData) return [ALL_YEARS_OPTION];
    
    const stockHoldingYears = allData.StockHoldings ? Object.keys(allData.StockHoldings) : [];

    const dateAccessors = {
      StockSaleDetails: 'SaleDate',
      OptionSaleDetails: 'close_date',
      DividendTaxResult: null,
    };
    const dataForYearExtraction = {
      StockSaleDetails: allData.StockSaleDetails || [],
      OptionSaleDetails: allData.OptionSaleDetails || [],
      DividendTaxResult: derivedDividendTaxSummary || {},
    };
    const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);

    const allYearsSet = new Set([...yearsFromUtil, ...stockHoldingYears]);
    const sortedYears = Array.from(allYearsSet)
      .filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED)
      .sort((a, b) => b.localeCompare(a));

    return [ALL_YEARS_OPTION, ...sortedYears];
  }, [allData, derivedDividendTaxSummary]);


  // Memoize the data filtered by the selected year
  const filteredData = useMemo(() => {
    const defaultStructure = {
      StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
      OptionSaleDetails: [], DividendTransactionsList: [], CashMovements: []
    };
    if (!allData) return defaultStructure;

    let holdingsForSelectedPeriod = [];
    if (allData.StockHoldings) {
      if (selectedYear === ALL_YEARS_OPTION) {
        const latestYear = Object.keys(allData.StockHoldings).sort().pop();
        holdingsForSelectedPeriod = allData.StockHoldings[latestYear] || [];
      } else {
        holdingsForSelectedPeriod = allData.StockHoldings[selectedYear] || [];
      }
    }

    const dataSet = {
      StockHoldings: holdingsForSelectedPeriod,
      OptionHoldings: allData.OptionHoldings || [],
      StockSaleDetails: allData.StockSaleDetails || [],
      OptionSaleDetails: allData.OptionSaleDetails || [],
      DividendTransactionsList: allData.DividendTransactionsList || [],
      CashMovements: allData.CashMovements || [],
    };
    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) return dataSet;
    return {
      ...dataSet,
      StockSaleDetails: dataSet.StockSaleDetails.filter(s => getYearString(s.SaleDate) === selectedYear),
      OptionSaleDetails: dataSet.OptionSaleDetails.filter(o => getYearString(o.close_date) === selectedYear),
      DividendTransactionsList: dataSet.DividendTransactionsList.filter(tx => getYearString(tx.Date) === selectedYear),
    };
  }, [allData, selectedYear]);

  // Memoize the summary Profit/Loss calculations
  const summaryPLs = useMemo(() => {
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
    let dividendPL = 0;

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
      Object.values(derivedDividendTaxSummary).forEach(yearData => {
        Object.values(yearData).forEach(countryData => {
          dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
        });
      });
    } else if (derivedDividendTaxSummary[selectedYear]) {
      Object.values(derivedDividendTaxSummary[selectedYear]).forEach(countryData => {
        dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
      });
    }

    const totalPL = stockPL + optionPL + dividendPL;
    return { stockPL, optionPL, dividendPL, totalPL };
  }, [filteredData, derivedDividendTaxSummary, selectedYear]);
  
  // Memoize holdings allocation chart data
  const holdingsChartData = useMemo(() => {
    const stockHoldingsForChart = filteredData.StockHoldings;
    
    if (!stockHoldingsForChart || stockHoldingsForChart.length === 0) {
      return null;
    }

    const holdingsByIsin = stockHoldingsForChart.reduce((acc, holding) => {
      const { isin, product_name, quantity, buy_amount_eur, buy_date } = holding;
      if (!isin) return acc;

      if (!acc[isin]) {
        acc[isin] = {
          totalValue: 0,
          latestName: product_name,
          latestDate: parseDateRobust(buy_date) || new Date(0),
        };
      }
      
      acc[isin].totalValue += Math.abs(buy_amount_eur || 0);

      const currentDate = parseDateRobust(buy_date);
      if (currentDate && currentDate > acc[isin].latestDate) {
        acc[isin].latestDate = currentDate;
        acc[isin].latestName = product_name;
      }

      return acc;
    }, {});

    const aggregatedHoldings = Object.values(holdingsByIsin);
    
    aggregatedHoldings.sort((a, b) => b.totalValue - a.totalValue);

    const topN = 7;
    const topHoldings = aggregatedHoldings.slice(0, topN);
    const otherHoldings = aggregatedHoldings.slice(topN);

    const labels = topHoldings.map(item => item.latestName);
    const data = topHoldings.map(item => item.totalValue);

    if (otherHoldings.length > 0) {
      const othersValue = otherHoldings.reduce((sum, item) => sum + item.totalValue, 0);
      labels.push('Others');
      data.push(othersValue);
    }

    return { labels, datasets: [{ data }] };

  }, [filteredData.StockHoldings]);

  return {
    allData,
    filteredData,
    summaryPLs,
    derivedDividendTaxSummary,
    availableYears,
    holdingsChartData,
    isLoading,
    isError,
    error,
  };
};