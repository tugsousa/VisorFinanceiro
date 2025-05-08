// frontend/src/pages/DividendsPage.js
import React, { useState, useEffect, useMemo, useContext } from 'react'; // Added useContext
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Grid
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import axios from 'axios'; // Import axios
import { AuthContext } from '../context/AuthContext'; // Import AuthContext

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const year = parseInt(parts[3], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date;
      }
    }
  }
  try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) return date;
  } catch (e) {}
  console.warn(`Failed to parse date string: ${dateString}`);
  return null;
};

const getYear = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCFullYear() : null;
};

const getMonth = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCMonth() + 1 : null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GOLDEN_ANGLE = 137.5;
const getColorForIsin = (index, total) => { // Renamed for clarity, though ProductName is used
  if (total <= 0) return 'rgba(200, 200, 200, 0.7)';
  const hue = (index * GOLDEN_ANGLE) % 360;
  const saturation = 60 + (index * 5) % 31;
  const lightness = 65 + (index * 3) % 16;
  return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
};
const getBorderColorForIsin = (index, total) => {
   if (total <= 0) return 'rgba(150, 150, 150, 1)';
   const hue = (index * GOLDEN_ANGLE) % 360;
   const saturation = 70 + (index * 5) % 26;
   const lightness = 50 + (index * 3) % 16;
   return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
};

export default function DividendsPage() {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext); // Get auth context
  const [selectedYear, setSelectedYear] = useState('all');
  const [allTransactions, setAllTransactions] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!token) {
        setLoading(false);
        setError("User not authenticated. Please sign in.");
        setAllTransactions([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();
        const response = await axios.get('http://localhost:8080/api/dividend-transactions', { // Updated endpoint
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-CSRF-Token': currentCsrfToken,
            },
            withCredentials: true,
        });
        
        const data = response.data || []; // Expecting direct array
        setAllTransactions(data);

        const years = new Set();
        data.forEach(tx => {
          const year = getYear(tx.Date); // Ensure tx.Date exists
          if (year) years.add(year);
        });
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        setAvailableYears(['all', ...sortedYears]);
        setSelectedYear(sortedYears[0] ? String(sortedYears[0]) : 'all');

      } catch (e) {
        console.error("Failed to fetch dividend transactions:", e);
        setError(`Failed to load dividend transaction data: ${e.response?.data?.error || e.message}`);
        setAllTransactions([]);
        setAvailableYears(['all']);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [token, csrfToken, fetchCsrfToken]);

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  // Filtered for "dividend" and "dividendtax" types
  const filteredDividendTransactions = useMemo(() => {
    if (!allTransactions) return [];
    return allTransactions.filter(tx => {
      const orderTypeLower = tx.OrderType?.toLowerCase();
      const isDividendType = orderTypeLower === 'dividend' || orderTypeLower === 'dividendtax';
      if (!isDividendType) return false;
      if (selectedYear === 'all') return true;
      const transactionYear = getYear(tx.Date);
      return transactionYear === Number(selectedYear);
    });
  }, [allTransactions, selectedYear]);

  const totalFilteredAmountEUR = useMemo(() => {
    // Sum only "dividend" types for gross, "dividendtax" are negative and represent tax
    return filteredDividendTransactions
        .filter(tx => tx.OrderType?.toLowerCase() === 'dividend')
        .reduce((sum, tx) => sum + (tx.AmountEUR || 0), 0);
  }, [filteredDividendTransactions]);

  const totalFilteredTaxEUR = useMemo(() => {
    // Sum "dividendtax" (usually negative)
    return filteredDividendTransactions
        .filter(tx => tx.OrderType?.toLowerCase() === 'dividendtax')
        .reduce((sum, tx) => sum + (tx.AmountEUR || 0), 0);
  }, [filteredDividendTransactions]);

  const chartData = useMemo(() => {
    const uniqueProductNames = [...new Set(filteredDividendTransactions.map(tx => tx.ProductName || 'Unknown Product'))].sort();
    const datasets = [];
    let labels = [];

    if (selectedYear === 'all') {
      const yearlyTotalsByProduct = {};
      const allYearsInData = new Set();
      filteredDividendTransactions
        .filter(tx => tx.OrderType?.toLowerCase() === 'dividend') // Only gross for chart
        .forEach(tx => {
        const year = getYear(tx.Date);
        const productName = tx.ProductName || 'Unknown Product';
        if (year && tx.AmountEUR) {
          allYearsInData.add(String(year));
          if (!yearlyTotalsByProduct[year]) yearlyTotalsByProduct[year] = {};
          yearlyTotalsByProduct[year][productName] = (yearlyTotalsByProduct[year][productName] || 0) + tx.AmountEUR;
        }
      });
      labels = Array.from(allYearsInData).sort((a, b) => Number(a) - Number(b));
      const totalProducts = uniqueProductNames.length;
      uniqueProductNames.forEach((productName, index) => {
        const data = labels.map(year => yearlyTotalsByProduct[year]?.[productName] || 0);
        datasets.push({
          label: productName, data,
          backgroundColor: getColorForIsin(index, totalProducts), // Using existing color func
          borderColor: getBorderColorForIsin(index, totalProducts),
          borderWidth: 1,
        });
      });
    } else {
      labels = MONTH_NAMES;
      const monthlyTotalsByProduct = {};
      uniqueProductNames.forEach(productName => { monthlyTotalsByProduct[productName] = Array(12).fill(0); });
      filteredDividendTransactions
        .filter(tx => tx.OrderType?.toLowerCase() === 'dividend') // Only gross for chart
        .forEach(tx => {
        const month = getMonth(tx.Date);
        const productName = tx.ProductName || 'Unknown Product';
        if (month && tx.AmountEUR) {
          monthlyTotalsByProduct[productName][month - 1] += tx.AmountEUR;
        }
      });
      const totalProducts = uniqueProductNames.length;
      uniqueProductNames.forEach((productName, index) => {
        datasets.push({
          label: productName, data: monthlyTotalsByProduct[productName],
          backgroundColor: getColorForIsin(index, totalProducts),
          borderColor: getBorderColorForIsin(index, totalProducts),
          borderWidth: 1,
        });
      });
    }
    return { labels, datasets };
  }, [filteredDividendTransactions, selectedYear]);

  const chartOptions = useMemo(() => ({ /* ... Your existing chartOptions, ensure dependencies include chartData.labels and chartData.datasets if tooltip uses them ... */
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
          legend: { position: 'top' },
          title: { display: true, text: selectedYear === 'all' ? 'Total Gross Dividends Received per Year by Product' : `Monthly Gross Dividends Received by Product - ${selectedYear}`},
          tooltip: {
              callbacks: {
                  label: (context) => null,
                  afterBody: (tooltipItems) => {
                        const tooltipItem = tooltipItems.find(item => item.datasetIndex !== undefined && item.dataIndex !== undefined);
                        if (!tooltipItem) return [];
                        const dataIndex = tooltipItem.dataIndex;
                        const datasetIndex = tooltipItem.datasetIndex;
                        const productLabel = chartData.datasets[datasetIndex]?.label;
                        let relevantTransactions = [];
                        if (selectedYear === 'all') {
                            const yearLabel = chartData.labels[dataIndex];
                            const year = parseInt(yearLabel, 10);
                            relevantTransactions = filteredDividendTransactions.filter(tx => tx.OrderType?.toLowerCase() === 'dividend' && getYear(tx.Date) === year && (tx.ProductName || 'Unknown Product') === productLabel);
                        } else {
                            const monthIndex = dataIndex;
                            const year = parseInt(selectedYear, 10);
                            relevantTransactions = filteredDividendTransactions.filter(tx => tx.OrderType?.toLowerCase() === 'dividend' && getMonth(tx.Date) === monthIndex + 1 && getYear(tx.Date) === year && (tx.ProductName || 'Unknown Product') === productLabel);
                        }
                        const details = relevantTransactions.map(tx => `  • ${tx.ProductName || 'Unknown Product'}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(tx.AmountEUR || 0)}`);
                        const maxDetails = 5;
                        if (details.length > maxDetails) return [...details.slice(0, maxDetails), `  ...and ${details.length - maxDetails} more`];
                        return details.length > 0 ? ['', ...details] : [];
                  }
              }
          }
      },
      scales: {
          y: { beginAtZero: true, stacked: true, title: { display: true, text: 'Gross Amount (€)'}},
          x: { stacked: true, title: { display: true, text: selectedYear === 'all' ? 'Year' : 'Month'}}
      }
  }), [selectedYear, filteredDividendTransactions, chartData.labels, chartData.datasets]);


  if (loading) return <CircularProgress />;
  if (error) return <Typography color="error" sx={{ textAlign: 'center', mt: 2 }}>Error: {error}</Typography>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Dividend Analysis
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
              disabled={loading || error || availableYears.length <= 1}
            >
              {availableYears.map(year => (
                <MenuItem key={year} value={String(year)}>
                  {year === 'all' ? 'All Years' : year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm="auto" sx={{ textAlign: { xs: 'left', sm: 'right' }, mt: { xs: 1, sm: 0 }, flexGrow: 1 }}>
            {filteredDividendTransactions.length > 0 && (
            <>
                <Typography variant="subtitle1" component="div">
                    Total Gross ({selectedYear === 'all' ? 'All Years' : selectedYear}):
                    <Typography component="span" sx={{ fontWeight: 'bold', ml: 1 }}>
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalFilteredAmountEUR)}
                    </Typography>
                </Typography>
                <Typography variant="subtitle1" component="div">
                    Total Tax ({selectedYear === 'all' ? 'All Years' : selectedYear}):
                    <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalFilteredTaxEUR < 0 ? 'error.main' : 'inherit' }}>
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalFilteredTaxEUR)}
                    </Typography>
                </Typography>
            </>
            )}
        </Grid>
      </Grid>

      {filteredDividendTransactions.length > 0 && chartData.datasets && chartData.datasets.length > 0 && chartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
        <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
          <Box sx={{ height: 400 }}>
             <Bar options={chartOptions} data={chartData} />
          </Box>
        </Paper>
      )}

      <Typography variant="h6" gutterBottom sx={{mt: 2}}>
        Dividend & Tax Transactions ({selectedYear === 'all' ? 'All Years' : selectedYear})
      </Typography>
      {filteredDividendTransactions.length === 0 ? (
          <Typography sx={{ mt: 2, textAlign: 'center' }}>
              No dividend transactions found for the selected period.
          </Typography>
      ) : (
        <Paper elevation={3} sx={{ p: 2 }}>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>ISIN</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Exch. Rate</TableCell>
                  <TableCell align="right">Amount (EUR)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDividendTransactions.map((tx, index) => (
                  <TableRow hover key={tx.OrderID || `${tx.Date}-${tx.ISIN}-${index}`}>
                    <TableCell>{tx.Date || 'N/A'}</TableCell>
                    <TableCell>{tx.ProductName || 'N/A'}</TableCell>
                    <TableCell>{tx.ISIN || 'N/A'}</TableCell>
                    <TableCell>{tx.OrderType || 'N/A'}</TableCell>
                    <TableCell>{tx.CountryCode || tx.country_code || 'N/A'}</TableCell>
                    <TableCell align="right">{tx.Amount?.toFixed(2)}</TableCell>
                    <TableCell>{tx.Currency}</TableCell>
                    <TableCell align="right">{tx.ExchangeRate?.toFixed(4)}</TableCell>
                    <TableCell align="right">{tx.AmountEUR?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}