// frontend/src/pages/DashboardPage.js
import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Divider, Alert
} from '@mui/material';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

// Helper to extract year from "DD-MM-YYYY"
const getYearFromDate = (dateString) => {
  if (!dateString) return null;
  const parts = dateString.split('-');
  return parts.length === 3 ? parseInt(parts[2], 10) : null;
};

// Reusable Table Component (Simplified for brevity, customize as needed)
const DataSection = ({ title, data, columns, noDataMessage = "No data available for this section." }) => {
  if (!data || data.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <Typography>{noDataMessage}</Typography>
      </Paper>
    );
  }
  return (
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr>
              {columns.map(col => <th key={col.field} style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>{col.headerName}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map(col => <td key={col.field} style={{ border: '1px solid #ddd', padding: '8px' }}>{row[col.field] !== undefined && row[col.field] !== null ? (typeof row[col.field] === 'number' ? row[col.field].toFixed(2) : row[col.field]) : 'N/A'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Paper>
  );
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

        // Populate available years from all relevant date fields
        const yearsSet = new Set();
        data.StockHoldings?.forEach(h => { const y = getYearFromDate(h.buy_date); if (y) yearsSet.add(y); });
        data.StockSaleDetails?.forEach(s => { const y = getYearFromDate(s.SaleDate); if (y) yearsSet.add(y); });
        data.OptionHoldings?.forEach(o => { const y = getYearFromDate(o.open_date); if (y) yearsSet.add(y); });
        data.OptionSaleDetails?.forEach(o => { const y = getYearFromDate(o.close_date); if (y) yearsSet.add(y); });
        if (data.DividendTaxResult) {
          Object.keys(data.DividendTaxResult).forEach(yearStr => yearsSet.add(parseInt(yearStr, 10)));
        }
        
        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        setAvailableYears(['all', ...sortedYears]);
        if (sortedYears.length > 0 && selectedYear === 'all') {
           // setSelectedYear(String(sortedYears[0])); // Optionally default to latest year
        }


      } catch (e) {
        console.error("Failed to fetch dashboard data:", e);
        setError(`Failed to load dashboard data: ${e.response?.data?.error || e.message}`);
        setAllDashboardData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, csrfToken, fetchCsrfToken]); // Removed selectedYear from deps

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  const filteredData = useMemo(() => {
    if (!allDashboardData) return {};
    if (selectedYear === 'all') return allDashboardData;

    const numSelectedYear = Number(selectedYear);
    return {
      StockHoldings: allDashboardData.StockHoldings?.filter(h => getYearFromDate(h.buy_date) === numSelectedYear || getYearFromDate(h.buy_date) < numSelectedYear), // Holdings are cumulative
      StockSaleDetails: allDashboardData.StockSaleDetails?.filter(s => getYearFromDate(s.SaleDate) === numSelectedYear),
      OptionHoldings: allDashboardData.OptionHoldings?.filter(o => getYearFromDate(o.open_date) === numSelectedYear || getYearFromDate(o.open_date) < numSelectedYear), // Holdings are cumulative
      OptionSaleDetails: allDashboardData.OptionSaleDetails?.filter(o => getYearFromDate(o.close_date) === numSelectedYear),
      DividendTaxResult: allDashboardData.DividendTaxResult?.[selectedYear] ? { [selectedYear]: allDashboardData.DividendTaxResult[selectedYear] } : {},
    };
  }, [allDashboardData, selectedYear]);

  // Column definitions
  const stockHoldingsColumns = [
    { field: 'product_name', headerName: 'Product' }, { field: 'isin', headerName: 'ISIN' },
    { field: 'buy_date', headerName: 'Buy Date' }, { field: 'quantity', headerName: 'Quantity' },
    { field: 'buy_amount_eur', headerName: 'Cost (EUR)' },
  ];
  const optionHoldingsColumns = [
    { field: 'product_name', headerName: 'Product' }, { field: 'open_date', headerName: 'Open Date' },
    { field: 'quantity', headerName: 'Quantity' }, { field: 'open_amount_eur', headerName: 'Open Value (EUR)' },
  ];
  const stockSalesColumns = [
    { field: 'SaleDate', headerName: 'Sale Date' }, { field: 'ProductName', headerName: 'Product' },
    { field: 'ISIN', headerName: 'ISIN' }, { field: 'Quantity', headerName: 'Qty' },
    { field: 'SaleAmountEUR', headerName: 'Sale (EUR)' }, { field: 'BuyAmountEUR', headerName: 'Cost (EUR)' },
    { field: 'Delta', headerName: 'P/L (EUR)' },
  ];
  const optionSalesColumns = [
    { field: 'close_date', headerName: 'Close Date' }, { field: 'product_name', headerName: 'Product' },
    { field: 'Quantity', headerName: 'Qty' },
    { field: 'open_amount_eur', headerName: 'Open (EUR)' }, { field: 'close_amount_eur', headerName: 'Close (EUR)' },
    { field: 'delta', headerName: 'P/L (EUR)' },
  ];
   const dividendColumns = [
    { field: 'country', headerName: 'Country' },
    { field: 'gross_amt', headerName: 'Gross (EUR)' },
    { field: 'taxed_amt', headerName: 'Tax (EUR)' },
    { field: 'net_amt', headerName: 'Net (EUR)' }
  ];

  // Transform dividend data for the table
  const dividendTableData = useMemo(() => {
    const result = [];
    const dividendDataToProcess = filteredData.DividendTaxResult || {};
    
    Object.entries(dividendDataToProcess).forEach(([year, countries]) => {
        Object.entries(countries).forEach(([country, amounts]) => {
            result.push({
                country: `${country} (${year})`, // Include year if 'all years' is selected
                gross_amt: amounts.gross_amt,
                taxed_amt: amounts.taxed_amt,
                net_amt: (amounts.gross_amt || 0) + (amounts.taxed_amt || 0)
            });
        });
    });
    return result;
  }, [filteredData.DividendTaxResult]);


  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!allDashboardData) return <Typography sx={{ textAlign: 'center', mt: 4 }}>No data loaded. Please upload a file first.</Typography>;

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
              disabled={availableYears.length === 0}
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

      <DataSection title="Current Stock Holdings" data={filteredData.StockHoldings} columns={stockHoldingsColumns} />
      <DataSection title="Current Option Holdings" data={filteredData.OptionHoldings} columns={optionHoldingsColumns} />
      <Divider sx={{ my: 3 }} />
      <DataSection title="Stock Sales" data={filteredData.StockSaleDetails} columns={stockSalesColumns} />
      <Divider sx={{ my: 3 }} />
      <DataSection title="Option Sales" data={filteredData.OptionSaleDetails} columns={optionSalesColumns} />
      <Divider sx={{ my: 3 }} />
      <DataSection title="Dividend Summary" data={dividendTableData} columns={dividendColumns} />

    </Box>
  );
}