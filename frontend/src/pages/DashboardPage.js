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
import OverallPLChart from '../components/dashboardSections/OverallPLChart';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED } from '../constants'; // Import NO_YEAR_SELECTED
import { getYearString, extractYearsFromData } from '../utils/dateUtils';
import { formatCurrency } from '../utils/formatUtils';

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
        DividendTaxResult: null,
      };
      const extractedYearsWithPossibleEmpty = extractYearsFromData(allDashboardData, dateAccessors);
      const actualNumericYears = extractedYearsWithPossibleEmpty.filter(
        year => year !== NO_YEAR_SELECTED && year !== ALL_YEARS_OPTION
      );
      setAvailableYears([ALL_YEARS_OPTION, ...actualNumericYears]);
      setSelectedYear(ALL_YEARS_OPTION);
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

      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* P/L Summary Panel (Sidebar-style) */}
        <Grid item xs={12} md={4} lg={3}>
          {/* Changed elevation to 0 */}
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

        {/* Overall P/L Chart */}
        <Grid item xs={12} md={8} lg={9}>
          {allDashboardData && (
            <OverallPLChart
                allDashboardData={allDashboardData}
                selectedYear={selectedYear}
            />
          )}
        </Grid>
      </Grid>

      {/* Holdings Section: Stocks on top, Options below */}
      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Current Holdings</Typography>
      {/* Removed wrapping Box elements */}
      <StockHoldingsSection holdingsData={filteredData.StockHoldings} selectedYear={selectedYear} />
      <OptionHoldingsSection holdingsData={filteredData.OptionHoldings} selectedYear={selectedYear} />


      <Divider sx={{ my: 3 }} />
      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1}}>Activity Summary {selectedYear !== ALL_YEARS_OPTION ? `(${selectedYear})` : '(All Years)'}</Typography>
      <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />
      <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} hideIndividualTotalPL={true} />
      <DividendsSection dividendSummaryData={filteredData.DividendTaxResult} selectedYear={selectedYear} hideIndividualTotalPL={true} />
    </Box>
  );
}