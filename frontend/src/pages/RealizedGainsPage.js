import React, { useState, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Alert, Tabs, Tab
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useRealizedGains } from '../hooks/useRealizedGains';
import { UI_TEXT, ALL_YEARS_OPTION } from '../constants';
import { formatCurrency } from '../utils/formatUtils';

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import HoldingsAllocationChart from '../components/realizedgainsSections/HoldingsAllocationChart';

const isDataEmpty = (data) => {
  if (!data) return true;
  return (
    (data.StockSaleDetails?.length ?? 0) === 0 &&
    (data.OptionSaleDetails?.length ?? 0) === 0 &&
    (data.DividendTransactionsList?.length ?? 0) === 0 &&
    (data.StockHoldings?.length ?? 0) === 0 &&
    (data.OptionHoldings?.length ?? 0) === 0
  );
};

export default function RealizedGainsPage() {
  const { token } = useAuth();
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [currentTab, setCurrentTab] = useState('overview');

  const {
    allData,
    filteredData,
    summaryPLs,
    derivedDividendTaxSummary,
    availableYears,
    holdingsChartData,
    isLoading, // This is the key state from react-query
    isError,
    error,
  } = useRealizedGains(token, selectedYear);

  useEffect(() => {
    if (!isLoading && !isError) {
      if (selectedYear !== ALL_YEARS_OPTION && !availableYears.includes(selectedYear)) {
        setSelectedYear(ALL_YEARS_OPTION);
      }
    }
  }, [availableYears, selectedYear, isLoading, isError]);

  const handleYearChange = (event) => setSelectedYear(event.target.value);
  const handleTabChange = (event, newValue) => setCurrentTab(newValue);

  // *** THE CORE FIX IS HERE ***
  // We explicitly handle the loading state first.
  if (isLoading) {
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  }

  // Then handle the error state.
  if (isError) {
    return <Alert severity="error" sx={{ m: 2 }}>{error?.message || UI_TEXT.errorLoadingData}</Alert>;
  }
  
  // Only after confirming loading is done and there's no error,
  // we check if the final data is empty.
  if (isDataEmpty(allData)) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', mt: 4 }}>
        <Typography variant="h5" gutterBottom>Portfolio Analysis</Typography>
        <Typography>No data available. Please upload a transaction file first.</Typography>
      </Box>
    );
  }

  // If we reach here, it means isLoading is false, isError is false, and data is not empty.
  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Portfolio Analysis
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
        <Grid item>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <InputLabel id="year-select-label">Year</InputLabel>
            <Select
              labelId="year-select-label"
              value={selectedYear}
              label="Year"
              onChange={handleYearChange}
              disabled={availableYears.length <= 1}
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
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={currentTab} onChange={handleTabChange} aria-label="portfolio analysis sections" variant="scrollable" scrollButtons="auto">
          <Tab label="Overview" value="overview" />
          <Tab label="Holdings" value="holdings" />
          <Tab label="Stock Sales P/L" value="stock-sales" />
          <Tab label="Option Sales P/L" value="option-sales" />
          <Tab label="Dividends" value="dividends" />
        </Tabs>
      </Box>

      {/* OVERVIEW TAB */}
      {currentTab === 'overview' && (
        <Grid container spacing={3}>
          <Grid item xs={12} lg={4}>
            <Paper elevation={1} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Key Metrics ({selectedYear === ALL_YEARS_OPTION ? 'All Time' : selectedYear})</Typography>
              <Box flexGrow={1}>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography>Stocks P/L:</Typography><Typography sx={{ fontWeight: 'medium', color: summaryPLs.stockPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.stockPL)}</Typography></Box>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography>Options P/L:</Typography><Typography sx={{ fontWeight: 'medium', color: summaryPLs.optionPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.optionPL)}</Typography></Box>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography>Dividends Net:</Typography><Typography sx={{ fontWeight: 'medium', color: summaryPLs.dividendPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.dividendPL)}</Typography></Box>
              </Box>
              <Box borderTop={1} borderColor="divider" mt={2} pt={2} display="flex" justifyContent="space-between">
                <Typography variant="h6" sx={{fontWeight:'bold'}}>Total P/L:</Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: summaryPLs.totalPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.totalPL)}</Typography>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={8}>
            <Paper elevation={1} sx={{ p: 2, height: 400 }}>
              <OverallPLChart
                stockSaleDetails={allData.StockSaleDetails || []}
                optionSaleDetails={allData.OptionSaleDetails || []}
                dividendTaxResultForChart={derivedDividendTaxSummary}
                selectedYear={selectedYear}
              />
            </Paper>
          </Grid>
           <Grid item xs={12} lg={5}>
              <Paper elevation={1} sx={{ p: 2, height: 400 }}>
                  <HoldingsAllocationChart chartData={holdingsChartData} />
              </Paper>
          </Grid>
          <Grid item xs={12} lg={7}>
             {/* You can add another summary chart here, e.g., a Line chart of P/L over time */}
              <Paper elevation={1} sx={{ p: 2, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Typography color="text.secondary">Additional Chart Area</Typography>
              </Paper>
          </Grid>
        </Grid>
      )}

      {/* HOLDINGS TAB */}
      {currentTab === 'holdings' && (
        <>
          <StockHoldingsSection holdingsData={allData.StockHoldings || []} />
          <OptionHoldingsSection holdingsData={allData.OptionHoldings || []} />
        </>
      )}
      
      {/* SALES TABS */}
      {currentTab === 'stock-sales' && (
        <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} />
      )}
      {currentTab === 'option-sales' && (
        <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} />
      )}
      
      {/* DIVIDENDS TAB */}
      {currentTab === 'dividends' && (
        <DividendsSection dividendTransactionsData={filteredData.DividendTransactionsList} selectedYear={selectedYear} />
      )}
    </Box>
  );
}