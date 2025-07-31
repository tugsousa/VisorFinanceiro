// frontend/src/hooks/useRealizedGains.js
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
// MODIFICAÇÃO: Importar a função da API para obter os valores de mercado
import { apiFetchRealizedGainsData, apiFetchCurrentHoldingsValue } from '../api/apiService';
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
    if (t.transaction_type !== 'DIVIDEND') return;

    const year = getYearString(t.date);
    if (!year) return;

    const countryFormattedString = t.country_code || 'Unknown';
    const amount = roundToTwoDecimalPlaces(t.amount_eur);

    if (!result[year]) result[year] = {};
    if (!result[year][countryFormattedString]) {
      result[year][countryFormattedString] = { gross_amt: 0, taxed_amt: 0 };
    }

    if (t.transaction_subtype === 'TAX') {
      result[year][countryFormattedString].taxed_amt += amount;
    } else {
      result[year][countryFormattedString].gross_amt += amount;
    }
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

  // --- NOVA ADIÇÃO ---
  // Obter os dados de mercado atuais para os ativos em carteira
  const { data: liveHoldingsData } = useQuery({
    queryKey: ['currentHoldingsValue', token],
    queryFn: () => apiFetchCurrentHoldingsValue(),
    enabled: !!token && !!allData && allData.StockHoldings && Object.keys(allData.StockHoldings).length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (response) => {
      // Transformar o array da API num Map para pesquisas rápidas (O(1))
      const liveDataMap = new Map();
      if (response.data) {
        response.data.forEach(item => {
          liveDataMap.set(item.ISIN, {
            marketValue: item.market_value_eur,
            status: item.Status,
          });
        });
      }
      return liveDataMap;
    },
  });
  // --- FIM DA NOVA ADIÇÃO ---

  const derivedDividendTaxSummary = useMemo(() => {
    if (allData && allData.DividendTransactionsList) {
      return processTransactionsToDividendSummary(allData.DividendTransactionsList);
    }
    return {};
  }, [allData]);

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
      DividendTransactionsList: dataSet.DividendTransactionsList.filter(tx => getYearString(tx.date) === selectedYear),
    };
  }, [allData, selectedYear]);

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
  
  // --- LÓGICA DO GRÁFICO MODIFICADA ---
  const holdingsChartData = useMemo(() => {
    const stockHoldingsForChart = filteredData.StockHoldings;
    
    if (!stockHoldingsForChart || stockHoldingsForChart.length === 0) {
      return null;
    }

    const holdingsByIsin = stockHoldingsForChart.reduce((acc, holding) => {
      const { isin, product_name, buy_amount_eur, buy_date } = holding;
      if (!isin) return acc;

      if (!acc[isin]) {
        acc[isin] = {
          totalCost: 0, // Agora vamos guardar o custo
          latestName: product_name,
          latestDate: parseDateRobust(buy_date) || new Date(0),
        };
      }
      
      acc[isin].totalCost += Math.abs(buy_amount_eur || 0);

      const currentDate = parseDateRobust(buy_date);
      if (currentDate && currentDate > acc[isin].latestDate) {
        acc[isin].latestDate = currentDate;
        acc[isin].latestName = product_name;
      }

      return acc;
    }, {});

    // Agora, enriquecemos com o valor de mercado
    const aggregatedHoldings = Object.entries(holdingsByIsin).map(([isin, group]) => {
      const liveInfo = liveHoldingsData?.get(isin);
      // Usar o valor de mercado se existir; caso contrário, usar o custo como fallback
      const currentValue = liveInfo?.marketValue ?? group.totalCost;
      return {
        name: group.latestName,
        value: currentValue,
      };
    });
    
    aggregatedHoldings.sort((a, b) => b.value - a.value);

    const topN = 7;
    const topHoldings = aggregatedHoldings.slice(0, topN);
    const otherHoldings = aggregatedHoldings.slice(topN);

    const labels = topHoldings.map(item => item.name);
    const data = topHoldings.map(item => item.value);

    if (otherHoldings.length > 0) {
      const othersValue = otherHoldings.reduce((sum, item) => sum + item.value, 0);
      labels.push('Outros');
      data.push(othersValue);
    }

    return { labels, datasets: [{ data }] };
  // A dependência agora inclui os dados de mercado
  }, [filteredData.StockHoldings, liveHoldingsData]);
  // --- FIM DA MODIFICAÇÃO ---

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