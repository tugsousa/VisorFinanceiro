// frontend/src/pages/DashboardPage.js
import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  /* Paper, */ CircularProgress, Grid, Divider, Alert // <--- REMOVE Paper or use it
} from '@mui/material';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

// Import your new section components
import StockHoldingsSection from '../components/dashboardSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/dashboardSections/OptionHoldingsSection';
import StockSalesSection from '../components/dashboardSections/StockSalesSection';
import OptionSalesSection from '../components/dashboardSections/OptionSalesSection';
import DividendsSection from '../components/dashboardSections/DividendsSection';

const getYearFromDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.split('-'); // Assumes "DD-MM-YYYY"
  return parts.length === 3 ? parseInt(parts[2], 10) : null;
};

export default function DashboardPage() {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext);
  const [allDashboardData, setAllDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState('all');
  const [availableYears, setAvailableYears] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoading(false);
        setError("User not authenticated. Please sign in.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();
        const response = await axios.get('http://localhost:8080/api/dashboard-data', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-CSRF-Token': currentCsrfToken,
          },
          withCredentials: true,
        });

        const data = response.data;
        setAllDashboardData(data);

        const yearsSet = new Set();
        data.StockHoldings?.forEach(h => { const y = getYearFromDate(h.buy_date); if (y) yearsSet.add(y); });
        data.StockSaleDetails?.forEach(s => { const y = getYearFromDate(s.SaleDate); if (y) yearsSet.add(y); });
        data.OptionHoldings?.forEach(o => { const y = getYearFromDate(o.open_date); if (y) yearsSet.add(y); });
        data.OptionSaleDetails?.forEach(o => { const y = getYearFromDate(o.close_date); if (y) yearsSet.add(y); });
        if (data.DividendTaxResult) {
          Object.keys(data.DividendTaxResult).forEach(yearStr => {
            if(yearStr && !isNaN(parseInt(yearStr, 10))) yearsSet.add(parseInt(yearStr, 10))
          });
        }
        
        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        setAvailableYears(['all', ...sortedYears]);

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
    if (selectedYear === 'all') {
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
      StockSaleDetails: (allDashboardData.StockSaleDetails || []).filter(s => getYearFromDate(s.SaleDate) === numSelectedYear),
      OptionSaleDetails: (allDashboardData.OptionSaleDetails || []).filter(o => getYearFromDate(o.close_date) === numSelectedYear),
      DividendTaxResult: allDashboardData.DividendTaxResult?.[selectedYear] ? { [selectedYear]: allDashboardData.DividendTaxResult[selectedYear] } : {},
    };
  }, [allDashboardData, selectedYear]);

  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!allDashboardData && !loading) return <Typography sx={{ textAlign: 'center', mt: 4 }}>No data loaded. Please upload a file first.</Typography>;

  return (
    <Box sx={{ p: 3 }}>
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
              disabled={availableYears.length === 0 || loading}
            >
              {availableYears.map(year => (
                <MenuItem key={year} value={String(year)}>
                  {year === 'all' ? 'All Years' : year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1 }}>Current Holdings</Typography>
      <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <StockHoldingsSection holdingsData={filteredData.StockHoldings} selectedYear={selectedYear} />
          </Grid>
          <Grid item xs={12} md={6}>
            <OptionHoldingsSection holdingsData={filteredData.OptionHoldings} selectedYear={selectedYear} />
          </Grid>
      </Grid>
      
      <Divider sx={{ my: 3 }} />
      <Typography variant="h5" sx={{mt: 2, mb: 1, borderBottom: 1, borderColor: 'divider', pb:1}}>Activity Summary {selectedYear !== 'all' ? `(${selectedYear})` : '(All Years)'}</Typography>
      <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} />
      <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} />
      <DividendsSection dividendSummaryData={filteredData.DividendTaxResult} selectedYear={selectedYear} />
    </Box>
  );
}