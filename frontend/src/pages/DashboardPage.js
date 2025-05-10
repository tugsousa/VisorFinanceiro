// frontend/src/pages/DashboardPage.js
import React, { useState, useMemo, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert 
} from '@mui/material';
import { useDashboardData } from '../hooks/useDashboardData'; // Custom hook
import StockHoldingsSection from '../components/dashboardSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/dashboardSections/OptionHoldingsSection';
import StockSalesSection from '../components/dashboardSections/StockSalesSection';
import OptionSalesSection from '../components/dashboardSections/OptionSalesSection';
import DividendsSection from '../components/dashboardSections/DividendsSection';
import { ALL_YEARS_OPTION } from '../constants';
import { getYearString, extractYearsFromData } from '../utils/dateUtils'; // Use new date utils
import { formatCurrency } from '../utils/formatUtils'; // Use new format utils

export default function DashboardPage() {
  const { data: allDashboardData, loading, error } = useDashboardData();
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [availableYears, setAvailableYears] = useState([ALL_YEARS_OPTION]);

  useEffect(() => {
    if (allDashboardData) {
      const dateAccessors = {
        StockHoldings: 'buy_date',
        StockSaleDetails: 'SaleDate',
        OptionHoldings: 'open_date',
        OptionSaleDetails: 'close_date',
        DividendTaxResult: null, // Special handling in extractYearsFromData
      };
      const years = extractYearsFromData(allDashboardData, dateAccessors);
      const actualYears = years.filter(y => y !== ALL_YEARS_OPTION); // NO_YEAR_SELECTED changed to ALL_YEARS_OPTION
      
      setAvailableYears([ALL_YEARS_OPTION, ...actualYears]); // Ensure ALL_YEARS_OPTION is first
      setSelectedYear(actualYears.length > 0 ? String(actualYears[0]) : ALL_YEARS_OPTION);
    } else {
      setAvailableYears([ALL_YEARS_OPTION]);
      setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [allDashboardData]);


  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  const filteredData = useMemo(() => {
    if (!allDashboardData) {
      return {
        StockHoldings: [], OptionHoldings: [], StockSaleDetails: [],
        OptionSaleDetails: [], DividendTaxResult: {},
      };
    }
    if (selectedYear === ALL_YEARS_OPTION) {
      return {
        StockHoldings: allDashboardData.StockHoldings || [],
        OptionHoldings: allDashboardData.OptionHoldings || [],
        StockSaleDetails: allDashboardData.StockSaleDetails || [],
        OptionSaleDetails: allDashboardData.OptionSaleDetails || [],
        DividendTaxResult: allDashboardData.DividendTaxResult || {},
      };
    }

    const numSelectedYear = Number(selectedYear);
    return {
      StockHoldings: allDashboardData.StockHoldings || [], 
      OptionHoldings: allDashboardData.OptionHoldings || [], 
      StockSaleDetails: (allDashboardData.StockSaleDetails || []).filter(s => getYearString(s.SaleDate) === selectedYear),
      OptionSaleDetails: (allDashboardData.OptionSaleDetails || []).filter(o => getYearString(o.close_date) === selectedYear),
      DividendTaxResult: allDashboardData.DividendTaxResult?.[selectedYear] 
        ? { [selectedYear]: allDashboardData.DividendTaxResult[selectedYear] } 
        : {},
    };
  }, [allDashboardData, selectedYear]);

  const summaryPLs = useMemo(() => {
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
    
    let dividendPL = 0;
    const dividendDataToProcess = selectedYear === ALL_YEARS_OPTION 
        ? filteredData.DividendTaxResult
        : (filteredData.DividendTaxResult[selectedYear] ? { [selectedYear]: filteredData.DividendTaxResult[selectedYear] } : {});

    for (const yearData of Object.values(dividendDataToProcess)) {
        for (const countryData of Object.values(yearData)) {
            dividendPL += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
        }
    }
    const totalPL = stockPL + optionPL + dividendPL;
    return { stockPL, optionPL, dividendPL, totalPL };
  }, [filteredData, selectedYear]);


  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!allDashboardData && !loading) return <Typography sx={{ textAlign: 'center', mt: 4 }}>No data loaded. Please upload a file first.</Typography>;

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Financial Dashboard
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
        <Grid item>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <InputLabel id="year-select-dashboard-label">Year</InputLabel>
            <Select
              labelId="year-select-dashboard-label"
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

      <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Profit/Loss Summary ({selectedYear === ALL_YEARS_OPTION ? 'All Years' : selectedYear})
        </Typography>
        <Grid container spacing={1}>
            <Grid item xs={12} sm={6} md={3}><Typography>Stocks P/L: <Typography component="span" sx={{ fontWeight: 'bold', color: summaryPLs.stockPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.stockPL)}</Typography></Typography></Grid>
            <Grid item xs={12} sm={6} md={3}><Typography>Options P/L: <Typography component="span" sx={{ fontWeight: 'bold', color: summaryPLs.optionPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.optionPL)}</Typography></Typography></Grid>
            <Grid item xs={12} sm={6} md={3}><Typography>Dividends Net: <Typography component="span" sx={{ fontWeight: 'bold', color: summaryPLs.dividendPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.dividendPL)}</Typography></Typography></Grid>
            <Grid item xs={12} sm={6} md={3}><Typography sx={{ fontWeight: 'bold' }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', color: summaryPLs.totalPL >= 0 ? 'success.main' : 'error.main' }}>{formatCurrency(summaryPLs.totalPL)}</Typography></Typography></Grid>
        </Grid>
      </Paper>

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Current Holdings</Typography>
      <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            <StockHoldingsSection holdingsData={filteredData.StockHoldings} selectedYear={selectedYear} />
          </Grid>
          <Grid item xs={12} lg={6}>
            {/* Assuming OptionHoldingsSection exists and is similar to StockHoldingsSection */}
            <OptionHoldingsSection holdingsData={filteredData.OptionHoldings} selectedYear={selectedYear} />
          </Grid>
      </Grid>
      
      <Divider sx={{ my: 3 }} />
      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1}}>Activity Summary {selectedYear !== ALL_YEARS_OPTION ? `(${selectedYear})` : '(All Years)'}</Typography>
      <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />
      <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />
      <DividendsSection dividendSummaryData={filteredData.DividendTaxResult} selectedYear={selectedYear} hideIndividualTotalPL={true} />
    </Box>
  );
}