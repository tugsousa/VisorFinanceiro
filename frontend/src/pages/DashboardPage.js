import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert 
} from '@mui/material';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import StockHoldingsSection from '../components/dashboardSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/dashboardSections/OptionHoldingsSection';
import StockSalesSection from '../components/dashboardSections/StockSalesSection';
import OptionSalesSection from '../components/dashboardSections/OptionSalesSection';
import DividendsSection from '../components/dashboardSections/DividendsSection';
import { API_ENDPOINTS, ALL_YEARS_OPTION, UI_TEXT } from '../constants'; // Removed NO_YEAR_SELECTED

const getYearFromDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  // Try parsing DD-MM-YYYY first
  let parts = dateString.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (parts) return parseInt(parts[3], 10);
  // Try parsing YYYY-MM-DD (ISO-like, common from JS Date.toISOString().split('T')[0])
  parts = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) return parseInt(parts[1], 10);
  // Fallback for simple year string if it's just a number
  if (/^\d{4}$/.test(dateString)) return parseInt(dateString, 10);
  return null;
};

const formatCurrency = (value) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
};

export default function DashboardPage() {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext);
  const [allDashboardData, setAllDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [availableYears, setAvailableYears] = useState([ALL_YEARS_OPTION]);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoading(false);
        setError(UI_TEXT.userNotAuthenticated);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();
        if (!currentCsrfToken) throw new Error("CSRF token not available for dashboard data.");

        const response = await axios.get(API_ENDPOINTS.DASHBOARD_DATA, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-CSRF-Token': currentCsrfToken,
          },
          withCredentials: true,
        });

        const data = response.data;
        setAllDashboardData(data);

        const yearsSet = new Set();
        data?.StockHoldings?.forEach(h => { const y = getYearFromDate(h.buy_date); if (y) yearsSet.add(y); });
        data?.StockSaleDetails?.forEach(s => { const y = getYearFromDate(s.SaleDate); if (y) yearsSet.add(y); });
        data?.OptionHoldings?.forEach(o => { const y = getYearFromDate(o.open_date); if (y) yearsSet.add(y); });
        data?.OptionSaleDetails?.forEach(o => { const y = getYearFromDate(o.close_date); if (y) yearsSet.add(y); });
        if (data?.DividendTaxResult) {
          Object.keys(data.DividendTaxResult).forEach(yearStr => {
            const yearNum = parseInt(yearStr, 10);
            if(!isNaN(yearNum)) yearsSet.add(yearNum);
          });
        }
        
        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a); // Descending
        setAvailableYears([ALL_YEARS_OPTION, ...sortedYears]);
        
        // Set selectedYear to the latest available year, or 'all' if no specific years
        setSelectedYear(sortedYears.length > 0 ? String(sortedYears[0]) : ALL_YEARS_OPTION);

      } catch (e) {
        console.error("Failed to fetch dashboard data:", e);
        setError(`Failed to load dashboard data: ${e.response?.data?.error || e.message}`);
        setAllDashboardData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, csrfToken, fetchCsrfToken]);

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
      // Holdings are generally current, but if your backend filters them by year for this endpoint, adjust accordingly.
      // For this example, assuming holdings are always "current" irrespective of year filter.
      StockHoldings: allDashboardData.StockHoldings || [], 
      OptionHoldings: allDashboardData.OptionHoldings || [], 
      StockSaleDetails: (allDashboardData.StockSaleDetails || []).filter(s => getYearFromDate(s.SaleDate) === numSelectedYear),
      OptionSaleDetails: (allDashboardData.OptionSaleDetails || []).filter(o => getYearFromDate(o.close_date) === numSelectedYear),
      DividendTaxResult: allDashboardData.DividendTaxResult?.[selectedYear] 
        ? { [selectedYear]: allDashboardData.DividendTaxResult[selectedYear] } 
        : {},
    };
  }, [allDashboardData, selectedYear]);

  const summaryPLs = useMemo(() => {
    const stockPL = (filteredData.StockSaleDetails || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    const optionPL = (filteredData.OptionSaleDetails || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
    
    let dividendPL = 0;
    // DividendTaxResult is { "year": { "country": { gross_amt, taxed_amt } } }
    const dividendDataToProcess = selectedYear === ALL_YEARS_OPTION 
        ? filteredData.DividendTaxResult // Process all years
        : (filteredData.DividendTaxResult[selectedYear] ? { [selectedYear]: filteredData.DividendTaxResult[selectedYear] } : {}); // Process only selected year

    for (const yearData of Object.values(dividendDataToProcess)) { // Iterates over year objects
        for (const countryData of Object.values(yearData)) { // Iterates over country objects within a year
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
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}> {/* Responsive padding */}
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