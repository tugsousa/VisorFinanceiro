// frontend/src/pages/RealizedGainsPage.js
import React, { useState, useMemo, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiFetchRealizedGainsData } from '../api/apiService';
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
  // The backend now ensures that all arrays/maps are initialized if empty
  return response.data;
};

export default function RealizedGainsPage() {
  const { token } = useAuth();

  const {
    data: allRealizedGainsData,
    isLoading: loading,
    error,
    isError,
  } = useQuery({
    queryKey: ['realizedGainsData', token], // This query fetches the consolidated data
    queryFn: fetchRealizedGainsData,
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [availableYears, setAvailableYears] = useState([ALL_YEARS_OPTION]);

  useEffect(() => {
    if (allRealizedGainsData) {
      const dateAccessors = {
        StockHoldings: 'buy_date',
        StockSaleDetails: 'SaleDate',
        OptionHoldings: 'open_date',
        OptionSaleDetails: 'close_date',
        DividendTaxResult: null, // Still used for OverallPLChart & summary
        DividendTransactionsList: 'Date', // Accessor for the raw dividend transactions
      };
      // Ensure allRealizedGainsData includes the new list for year extraction
      const dataForYearExtraction = {
        ...allRealizedGainsData,
        DividendTransactionsList: allRealizedGainsData.DividendTransactionsList || [],
        DividendTaxResult: allRealizedGainsData.DividendTaxResult || {},
        StockSaleDetails: allRealizedGainsData.StockSaleDetails || [],
        OptionSaleDetails: allRealizedGainsData.OptionSaleDetails || [],
      };

      const dataYears = extractYearsFromData(dataForYearExtraction, dateAccessors);
      setAvailableYears([ALL_YEARS_OPTION, ...dataYears]);

      if (
        (selectedYear !== ALL_YEARS_OPTION && !dataYears.includes(selectedYear)) ||
        (dataYears.length === 0 && selectedYear !== ALL_YEARS_OPTION)
      ) {
        setSelectedYear(ALL_YEARS_OPTION);
      }
    } else {
      setAvailableYears([ALL_YEARS_OPTION]);
      setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [allRealizedGainsData]); // Removed selectedYear from dependency array to avoid potential loop with setSelectedYear

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  const filteredData = useMemo(() => {
    const defaultStructure = {
      StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
      OptionSaleDetails: [], DividendTaxResult: {}, DividendTransactionsList: [],
    };

    if (!allRealizedGainsData) {
      return defaultStructure;
    }

    // Ensure all top-level properties are at least empty arrays/objects
    const data = {
      StockHoldings: allRealizedGainsData.StockHoldings || [],
      OptionHoldings: allRealizedGainsData.OptionHoldings || [],
      StockSaleDetails: allRealizedGainsData.StockSaleDetails || [],
      OptionSaleDetails: allRealizedGainsData.OptionSaleDetails || [],
      DividendTaxResult: allRealizedGainsData.DividendTaxResult || {},
      DividendTransactionsList: allRealizedGainsData.DividendTransactionsList || [],
      CashMovements: allRealizedGainsData.CashMovements || [],
    };


    if (selectedYear === ALL_YEARS_OPTION) {
      return data; // Return all data (already defaults to empty arrays if props are missing)
    }

    // Filter data for a specific year
    return {
      ...data, // Keep holdings and cash movements as they are (not year-specific views here)
      StockSaleDetails: data.StockSaleDetails.filter(s => getYearString(s.SaleDate) === selectedYear),
      OptionSaleDetails: data.OptionSaleDetails.filter(o => getYearString(o.close_date) === selectedYear),
      // DividendTaxResult for a specific year
      DividendTaxResult: data.DividendTaxResult?.[selectedYear]
        ? { [selectedYear]: data.DividendTaxResult[selectedYear] }
        : {},
      // DividendTransactionsList for a specific year
      DividendTransactionsList: data.DividendTransactionsList.filter(tx => getYearString(tx.Date) === selectedYear),
    };
  }, [allRealizedGainsData, selectedYear]);

  const summaryPLs = useMemo(() => {
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);

    let dividendPL = 0;
    // DividendTaxResult is { "year": { "country": { gross, tax } } } when ALL_YEARS_OPTION
    // or { "selectedYear": { "country": { gross, tax }} } when a specific year is selected
    const dividendSummaryToProcess = filteredData.DividendTaxResult || {};

    // If ALL_YEARS_OPTION, dividendSummaryToProcess will contain all years from backend
    // If specific year, it will contain { "year": { "country": {gross, tax } } }
    // The Object.values() correctly handles both cases for iteration.
    for (const yearData of Object.values(dividendSummaryToProcess)) {
      // yearData here is the map of countries for a given year
      for (const countryData of Object.values(yearData || {})) {
        dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
      }
    }
    const totalPL = stockPL + optionPL + dividendPL;
    return { stockPL, optionPL, dividendPL, totalPL };
  }, [filteredData]);

  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (isError) return <Alert severity="error" sx={{ m: 2 }}>{error?.message || UI_TEXT.errorLoadingData}</Alert>;
  
  // This check is important: if allRealizedGainsData is null/undefined (after loading and no error)
  // it means the API call might have succeeded but returned no data (e.g. user has no transactions yet)
  const noDataLoaded = !allRealizedGainsData || (
    (allRealizedGainsData.StockSaleDetails?.length === 0 || !allRealizedGainsData.StockSaleDetails) &&
    (allRealizedGainsData.OptionSaleDetails?.length === 0 || !allRealizedGainsData.OptionSaleDetails) &&
    (Object.keys(allRealizedGainsData.DividendTaxResult || {}).length === 0) &&
    (allRealizedGainsData.DividendTransactionsList?.length === 0 || !allRealizedGainsData.DividendTransactionsList)
  );

  if (noDataLoaded && !loading && !isError) {
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
          {/* OverallPLChart uses allRealizedGainsData to get DividendTaxResult */}
          {allRealizedGainsData && (
            <OverallPLChart
                allRealizedGainsData={allRealizedGainsData}
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
        // Pass the raw list of dividend transactions.
        // If selectedYear is 'all', filteredData.DividendTransactionsList will be the full list from backend.
        // If selectedYear is specific, filteredData.DividendTransactionsList will be pre-filtered by RealizedGainsPage.
        dividendTransactionsData={filteredData.DividendTransactionsList}
        selectedYear={selectedYear} // Still pass selectedYear for internal chart title and potentially other logic
        hideIndividualTotalPL={true}
      />
    </Box>
  );
}