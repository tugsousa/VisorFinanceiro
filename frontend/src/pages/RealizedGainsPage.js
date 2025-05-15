// frontend/src/pages/RealizedGainsPage.js
import React, { useState, useMemo, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert
} from '@mui/material';
import { useQuery } from '@tanstack/react-query'; // Import useQuery
import { apiFetchRealizedGainsData } from '../api/apiService'; // API function
import { useAuth } from '../context/AuthContext'; // To get token for query key

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED, UI_TEXT } from '../constants';
import { getYearString, extractYearsFromData } from '../utils/dateUtils';
import { formatCurrency } from '../utils/formatUtils';

const fetchRealizedGainsData = async () => {
  const response = await apiFetchRealizedGainsData();
  return response.data;
};

export default function RealizedGainsPage() {
  const { token } = useAuth(); // Get token, used as part of queryKey to auto-refetch on auth change
  
  const { 
    data: allRealizedGainsData, 
    isLoading: loading, // isLoading from useQuery
    error, // error from useQuery
    isError, // isError boolean from useQuery
  } = useQuery({
    queryKey: ['realizedGainsData', token], // Query key, token ensures refetch on login/logout
    queryFn: fetchRealizedGainsData,
    enabled: !!token, // Only run query if token exists
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
        DividendTaxResult: null,
      };
      const extractedYearsWithPossibleEmpty = extractYearsFromData(allRealizedGainsData, dateAccessors);
      const actualNumericYears = extractedYearsWithPossibleEmpty.filter(
        year => year !== NO_YEAR_SELECTED && year !== ALL_YEARS_OPTION
      );
      setAvailableYears([ALL_YEARS_OPTION, ...actualNumericYears]);
      // Reset to ALL_YEARS_OPTION when data reloads to ensure consistency
      // Or, try to preserve selectedYear if it's still valid within the new actualNumericYears
      if (!actualNumericYears.includes(selectedYear) && selectedYear !== ALL_YEARS_OPTION) {
          setSelectedYear(ALL_YEARS_OPTION);
      } else if (actualNumericYears.length > 0 && selectedYear === ALL_YEARS_OPTION && actualNumericYears.length === 1) {
          // If only one actual year is available, consider setting it as default,
          // but for now, stick to ALL_YEARS_OPTION if it was selected.
          // Or, if selectedYear wasn't ALL_YEARS and is now invalid, reset to ALL_YEARS.
      } else if (actualNumericYears.length === 0) {
          setSelectedYear(ALL_YEARS_OPTION);
      }


    } else {
      setAvailableYears([ALL_YEARS_OPTION]);
      setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [allRealizedGainsData, selectedYear]); // Added selectedYear to deps to re-evaluate if it's still valid

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  const filteredData = useMemo(() => {
    // ... (existing filtering logic based on allRealizedGainsData and selectedYear) ...
    // This logic remains the same.
    if (!allRealizedGainsData) {
      return {
        StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
        OptionSaleDetails: [], DividendTaxResult: {},
      };
    }
    if (selectedYear === ALL_YEARS_OPTION) {
      return {
        StockHoldings: allRealizedGainsData.StockHoldings || [],
        OptionHoldings: allRealizedGainsData.OptionHoldings || [],
        StockSaleDetails: allRealizedGainsData.StockSaleDetails || [],
        OptionSaleDetails: allRealizedGainsData.OptionSaleDetails || [],
        DividendTaxResult: allRealizedGainsData.DividendTaxResult || {},
      };
    }

    return {
      StockHoldings: allRealizedGainsData.StockHoldings || [], // Holdings are typically current, not year-filtered this way
      OptionHoldings: allRealizedGainsData.OptionHoldings || [], // Same for option holdings
      StockSaleDetails: (allRealizedGainsData.StockSaleDetails || []).filter(s => getYearString(s.SaleDate) === selectedYear),
      OptionSaleDetails: (allRealizedGainsData.OptionSaleDetails || []).filter(o => getYearString(o.close_date) === selectedYear),
      DividendTaxResult: allRealizedGainsData.DividendTaxResult?.[selectedYear]
        ? { [selectedYear]: allRealizedGainsData.DividendTaxResult[selectedYear] }
        : {},
    };
  }, [allRealizedGainsData, selectedYear]);

  const summaryPLs = useMemo(() => {
    // ... (existing summary P/L calculation logic) ...
    // This logic also remains the same.
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);

    let dividendPL = 0;
    const dividendDataToProcess = selectedYear === ALL_YEARS_OPTION
        ? filteredData.DividendTaxResult
        : (filteredData.DividendTaxResult && filteredData.DividendTaxResult[selectedYear] ? { [selectedYear]: filteredData.DividendTaxResult[selectedYear] } : {});


    for (const yearData of Object.values(dividendDataToProcess || {})) { // Add guard for dividendDataToProcess
        for (const countryData of Object.values(yearData || {})) { // Add guard for yearData
            dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
        }
    }
    const totalPL = stockPL + optionPL + dividendPL;
    return { stockPL, optionPL, dividendPL, totalPL };
  }, [filteredData, selectedYear]);

  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (isError) return <Alert severity="error" sx={{ m: 2 }}>{error?.message || UI_TEXT.errorLoadingData}</Alert>;
  if (!allRealizedGainsData && !loading && !isError) return <Typography sx={{ textAlign: 'center', mt: 4 }}>No data loaded. Please upload a file first.</Typography>;


  // ... (rest of the JSX rendering logic using filteredData, summaryPLs, loading, isError, etc.)
  // The structure of the page remains largely the same.
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
                <MenuItem key={year} value={String(year)}>
                  {year === ALL_YEARS_OPTION ? 'All Years' : year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4} lg={3}>
          <Paper elevation={0} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', border: 'none' }}>
            <Typography variant="h6" gutterBottom sx={{ textAlign: 'center', mb: 2 }}>
              P/L Summary ({selectedYear === ALL_YEARS_OPTION ? 'All Years' : selectedYear})
            </Typography>
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

      <Divider sx={{ my: 3 }} />
      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1}}>Activity Summary {selectedYear !== ALL_YEARS_OPTION ? `(${selectedYear})` : '(All Years)'}</Typography>
      <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />
      <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />
      <DividendsSection 
        dividendSummaryData={allRealizedGainsData?.DividendTaxResult || {}} // Pass the full dividend summary from top-level data
        selectedYear={selectedYear} 
        hideIndividualTotalPL={true} 
      />
    </Box>
  );
}