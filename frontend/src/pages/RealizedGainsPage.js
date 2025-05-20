// frontend/src/pages/RealizedGainsPage.js
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
// Import only apiFetchRealizedGainsData for main data
import { apiFetchRealizedGainsData } from '../api/apiService';
import { useAuth } from '../context/AuthContext';

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import { ALL_YEARS_OPTION, UI_TEXT, NO_YEAR_SELECTED } from '../constants'; // Added NO_YEAR_SELECTED
import { getYearString, extractYearsFromData } from '../utils/dateUtils';
import { formatCurrency } from '../utils/formatUtils';

const fetchRealizedGainsData = async () => {
  const response = await apiFetchRealizedGainsData();
  return response.data;
};

// Helper function to process transactions into dividend summary format
const roundToTwoDecimalPlaces = (value) => {
    if (typeof value !== 'number') return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
};

const processTransactionsToDividendSummary = (transactions) => {
  const result = {}; // DividendTaxResult: map[Year]map[Country]DividendCountrySummary
  if (!transactions || transactions.length === 0) return result;

  transactions.forEach(t => {
    const transactionType = t.OrderType?.toLowerCase();
    if (transactionType !== 'dividend' && transactionType !== 'dividendtax') {
      return; 
    }

    const year = getYearString(t.Date);
    if (!year) return; 

    // Assuming t.CountryCode is already the formatted string like "840 - United States of America (the)"
    // as prepared by the backend.
    const countryFormattedString = t.CountryCode || 'Unknown';

    const amount = roundToTwoDecimalPlaces(t.AmountEUR);

    if (!result[year]) {
      result[year] = {};
    }
    if (!result[year][countryFormattedString]) {
      result[year][countryFormattedString] = { gross_amt: 0, taxed_amt: 0 };
    }

    if (transactionType === 'dividend') {
      result[year][countryFormattedString].gross_amt += amount;
    } else if (transactionType === 'dividendtax') {
      result[year][countryFormattedString].taxed_amt += amount; 
    }
  });

  for (const yearKey in result) {
    for (const countryKey in result[yearKey]) {
      result[yearKey][countryKey].gross_amt = roundToTwoDecimalPlaces(result[yearKey][countryKey].gross_amt);
      result[yearKey][countryKey].taxed_amt = roundToTwoDecimalPlaces(result[yearKey][countryKey].taxed_amt);
    }
  }
  return result;
};


export default function RealizedGainsPage() {
  const { token } = useAuth();

  const {
    data: allRealizedGainsData,
    isLoading: realizedGainsLoading,
    error: realizedGainsErrorObj,
    isError: isRealizedGainsError,
  } = useQuery({
    queryKey: ['realizedGainsData', token],
    queryFn: fetchRealizedGainsData,
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // No separate query for dividendTaxSummary anymore

  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [availableYears, setAvailableYears] = useState([ALL_YEARS_OPTION]);

  const loading = realizedGainsLoading; // Only depends on the main query
  const apiError = isRealizedGainsError
    ? (realizedGainsErrorObj?.message || UI_TEXT.errorLoadingData)
    : null;

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  // Derive dividend tax summary from DividendTransactionsList
  const derivedDividendTaxSummary = useMemo(() => {
    if (allRealizedGainsData && allRealizedGainsData.DividendTransactionsList) {
      return processTransactionsToDividendSummary(allRealizedGainsData.DividendTransactionsList);
    }
    return {};
  }, [allRealizedGainsData]);

  useEffect(() => {
    if (!loading && !apiError && allRealizedGainsData) {
      const dateAccessors = {
        StockHoldings: 'buy_date',
        StockSaleDetails: 'SaleDate',
        OptionHoldings: 'open_date',
        OptionSaleDetails: 'close_date',
        DividendTaxResult: null, // Key for the derived summary to extract years
        DividendTransactionsList: 'Date', // For fallback if derivedDividendTaxSummary is empty
      };

      const dataForYearExtraction = {
        StockHoldings: allRealizedGainsData?.StockHoldings || [],
        StockSaleDetails: allRealizedGainsData?.StockSaleDetails || [],
        OptionHoldings: allRealizedGainsData?.OptionHoldings || [],
        OptionSaleDetails: allRealizedGainsData?.OptionSaleDetails || [],
        DividendTaxResult: derivedDividendTaxSummary || {}, // Use the derived summary for year keys
        DividendTransactionsList: allRealizedGainsData?.DividendTransactionsList || [],
      };

      const dataYears = extractYearsFromData(dataForYearExtraction, dateAccessors);
      const uniqueYears = [ALL_YEARS_OPTION, ...new Set(dataYears.filter(y => y && y !== ALL_YEARS_OPTION))];
      setAvailableYears(uniqueYears);
      
      if (
        (selectedYear !== ALL_YEARS_OPTION && !uniqueYears.includes(selectedYear)) ||
        (uniqueYears.length === 1 && selectedYear !== ALL_YEARS_OPTION) // Only 'all' is available
      ) {
        setSelectedYear(ALL_YEARS_OPTION);
      }

    } else if (!loading && !apiError) {
        setAvailableYears([ALL_YEARS_OPTION]);
        setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [allRealizedGainsData, derivedDividendTaxSummary, loading, apiError, selectedYear]);


  const filteredData = useMemo(() => {
    const defaultStructure = {
      StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
      OptionSaleDetails: [], DividendTransactionsList: [], CashMovements: []
    };

    if (!allRealizedGainsData) {
      return defaultStructure;
    }

    const data = {
      StockHoldings: allRealizedGainsData.StockHoldings || [],
      OptionHoldings: allRealizedGainsData.OptionHoldings || [],
      StockSaleDetails: allRealizedGainsData.StockSaleDetails || [],
      OptionSaleDetails: allRealizedGainsData.OptionSaleDetails || [],
      DividendTransactionsList: allRealizedGainsData.DividendTransactionsList || [],
      CashMovements: allRealizedGainsData.CashMovements || [],
    };

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) { // Added !selectedYear for robustness
      return data;
    }

    return {
      ...data,
      // Holdings are usually current, so not typically filtered by selectedYear for display
      // StockHoldings: data.StockHoldings.filter(h => getYearString(h.buy_date) === selectedYear), // Example if needed
      // OptionHoldings: data.OptionHoldings.filter(h => getYearString(h.open_date) === selectedYear), // Example if needed
      StockSaleDetails: data.StockSaleDetails.filter(s => getYearString(s.SaleDate) === selectedYear),
      OptionSaleDetails: data.OptionSaleDetails.filter(o => getYearString(o.close_date) === selectedYear),
      DividendTransactionsList: data.DividendTransactionsList.filter(tx => getYearString(tx.Date) === selectedYear),
    };
  }, [allRealizedGainsData, selectedYear]);

  const summaryPLs = useMemo(() => {
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);

    let dividendPL = 0;
    const summaryToProcess = derivedDividendTaxSummary || {}; // Use the derived summary

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
      for (const yearData of Object.values(summaryToProcess)) {
        for (const countryData of Object.values(yearData || {})) {
          dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
        }
      }
    } else if (summaryToProcess[selectedYear]) {
      for (const countryData of Object.values(summaryToProcess[selectedYear] || {})) {
        dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
      }
    }

    const totalPL = stockPL + optionPL + dividendPL;
    return { stockPL, optionPL, dividendPL, totalPL };
  }, [filteredData.StockSaleDetails, filteredData.OptionSaleDetails, derivedDividendTaxSummary, selectedYear]);


  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (apiError) return <Alert severity="error" sx={{ m: 2 }}>{apiError}</Alert>;

  const noDataAvailableForDisplay = !allRealizedGainsData;

  if (noDataAvailableForDisplay && !loading && !apiError) {
    return (
        <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, textAlign: 'center', mt: 4 }}>
            <Typography variant="h5" gutterBottom>Realized Gains</Typography>
            <Typography>No data available. Please upload a transaction file first.</Typography>
        </Box>
    );
  }
  
  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Realized Gains
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
        <Grid item>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <InputLabel id="year-select-realizedgains-label">Year</InputLabel>
            <Select
              labelId="year-select-realizedgains-label"
              value={selectedYear}
              label="Year"
              onChange={handleYearChange}
              disabled={(availableYears.length <= 1 && availableYears[0] === ALL_YEARS_OPTION) || loading}
            >
              {availableYears.map(year => (
                <MenuItem key={year} value={year}>
                  {year === ALL_YEARS_OPTION ? 'All Years' : year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Overview</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4} lg={3}>
          <Paper elevation={0} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', border: 'none' }}>
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="body1">Stocks P/L:</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: summaryPLs.stockPL >= 0 ? 'success.main' : 'error.main' }}>
                  {formatCurrency(summaryPLs.stockPL)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="body1">Options P/L:</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: summaryPLs.optionPL >= 0 ? 'success.main' : 'error.main' }}>
                  {formatCurrency(summaryPLs.optionPL)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="body1">Dividends Net:</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: summaryPLs.dividendPL >= 0 ? 'success.main' : 'error.main' }}>
                  {formatCurrency(summaryPLs.dividendPL)}
                </Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Total P/L:</Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: summaryPLs.totalPL >= 0 ? 'success.main' : 'error.main' }}>
                  {formatCurrency(summaryPLs.totalPL)}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8} lg={9}>
          {allRealizedGainsData && ( // Check if main data is available
            <OverallPLChart
                stockSaleDetails={allRealizedGainsData.StockSaleDetails || []}
                optionSaleDetails={allRealizedGainsData.OptionSaleDetails || []}
                dividendTaxResultForChart={derivedDividendTaxSummary} // Pass the derived summary
                selectedYear={selectedYear}
            />
          )}
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Current Holdings</Typography>
      {/* Pass allRealizedGainsData for holdings as they are usually not filtered by year */}
      <StockHoldingsSection holdingsData={allRealizedGainsData?.StockHoldings || []} selectedYear={selectedYear} />
      <OptionHoldingsSection holdingsData={allRealizedGainsData?.OptionHoldings || []} selectedYear={selectedYear} />

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Stock Sales</Typography>
      <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Option Sales</Typography>
      <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Dividends</Typography>
      <DividendsSection
        dividendTransactionsData={filteredData.DividendTransactionsList}
        selectedYear={selectedYear}
        hideIndividualTotalPL={true}
      />
    </Box>
  );
}