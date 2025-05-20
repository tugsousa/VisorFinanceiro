// frontend/src/pages/RealizedGainsPage.js
import React, { useState, useMemo, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
// Import both API functions
import { apiFetchRealizedGainsData, apiFetchDividendTaxSummary } from '../api/apiService';
import { useAuth } from '../context/AuthContext';

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import { ALL_YEARS_OPTION, UI_TEXT } from '../constants';
import { getYearString, extractYearsFromData } from '../utils/dateUtils';
import { formatCurrency } from '../utils/formatUtils';

const fetchRealizedGainsData = async () => {
  const response = await apiFetchRealizedGainsData();
  // DividendTaxResult is no longer expected here.
  return response.data;
};

// Function to fetch dividend tax summary
const fetchDividendTaxSummary = async () => {
    const response = await apiFetchDividendTaxSummary();
    return response.data || {}; // Ensure it's an object
};


export default function RealizedGainsPage() {
  const { token } = useAuth();

  // Query for main realized gains data (without dividend summary)
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

  // Query for dividend tax summary
  const {
    data: dividendTaxSummaryData,
    isLoading: dividendSummaryLoading,
    error: dividendSummaryErrorObj,
    isError: isDividendSummaryError,
  } = useQuery({
    queryKey: ['dividendTaxSummary', token], // Different query key
    queryFn: fetchDividendTaxSummary,
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });

  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [availableYears, setAvailableYears] = useState([ALL_YEARS_OPTION]);

  const loading = realizedGainsLoading || dividendSummaryLoading;
  const apiError = isRealizedGainsError
    ? (realizedGainsErrorObj?.message || UI_TEXT.errorLoadingData)
    : isDividendSummaryError
    ? (dividendSummaryErrorObj?.message || UI_TEXT.errorLoadingData)
    : null;

  // Define handleYearChange
  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  useEffect(() => {
    // Wait for both data sources to be available (or determined to be not loading and not errored)
    if (!loading && !apiError && (allRealizedGainsData || dividendTaxSummaryData)) {
      const dateAccessors = {
        StockHoldings: 'buy_date',
        StockSaleDetails: 'SaleDate',
        OptionHoldings: 'open_date',
        OptionSaleDetails: 'close_date',
        DividendTaxResult: null, // For year extraction from dividendTaxSummaryData keys
        DividendTransactionsList: 'Date',
      };

      const dataForYearExtraction = {
        StockHoldings: allRealizedGainsData?.StockHoldings || [],
        StockSaleDetails: allRealizedGainsData?.StockSaleDetails || [],
        OptionHoldings: allRealizedGainsData?.OptionHoldings || [],
        OptionSaleDetails: allRealizedGainsData?.OptionSaleDetails || [],
        DividendTaxResult: dividendTaxSummaryData || {}, // Use the separately fetched summary for year keys
        DividendTransactionsList: allRealizedGainsData?.DividendTransactionsList || [],
      };

      const dataYears = extractYearsFromData(dataForYearExtraction, dateAccessors);
      setAvailableYears([ALL_YEARS_OPTION, ...dataYears]);

      // Logic to reset selectedYear if it becomes invalid
      if (
        (selectedYear !== ALL_YEARS_OPTION && !dataYears.includes(selectedYear)) ||
        (dataYears.length === 0 && selectedYear !== ALL_YEARS_OPTION)
      ) {
        setSelectedYear(ALL_YEARS_OPTION);
      }
    } else if (!loading && !apiError) { // If no data and not loading/errored
        setAvailableYears([ALL_YEARS_OPTION]);
        setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [allRealizedGainsData, dividendTaxSummaryData, loading, apiError, selectedYear]);


  const filteredData = useMemo(() => {
    const defaultStructure = {
      StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
      OptionSaleDetails: [], DividendTransactionsList: [], CashMovements: []
      // DividendTaxResult is no longer part of this structure
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

    if (selectedYear === ALL_YEARS_OPTION) {
      return data;
    }

    return {
      ...data,
      StockSaleDetails: data.StockSaleDetails.filter(s => getYearString(s.SaleDate) === selectedYear),
      OptionSaleDetails: data.OptionSaleDetails.filter(o => getYearString(o.close_date) === selectedYear),
      DividendTransactionsList: data.DividendTransactionsList.filter(tx => getYearString(tx.Date) === selectedYear),
    };
  }, [allRealizedGainsData, selectedYear]);

  const summaryPLs = useMemo(() => {
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);

    let dividendPL = 0;
    const summaryToProcess = dividendTaxSummaryData || {}; // Use the fetched dividend summary

    if (selectedYear === ALL_YEARS_OPTION) {
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
  }, [filteredData.StockSaleDetails, filteredData.OptionSaleDetails, dividendTaxSummaryData, selectedYear]);


  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (apiError) return <Alert severity="error" sx={{ m: 2 }}>{apiError}</Alert>;

  const noDataAvailableForDisplay = !allRealizedGainsData && !dividendTaxSummaryData;

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
              onChange={handleYearChange} // This was missing
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
          {/* Pass individual data parts to OverallPLChart */}
          {allRealizedGainsData && dividendTaxSummaryData && (
            <OverallPLChart
                stockSaleDetails={allRealizedGainsData.StockSaleDetails || []}
                optionSaleDetails={allRealizedGainsData.OptionSaleDetails || []}
                dividendTaxResultForChart={dividendTaxSummaryData} // Pass the separately fetched dividend summary
                selectedYear={selectedYear}
            />
          )}
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Current Holdings</Typography>
      <StockHoldingsSection holdingsData={filteredData.StockHoldings} selectedYear={selectedYear} />
      <OptionHoldingsSection holdingsData={filteredData.OptionHoldings} selectedYear={selectedYear} />

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