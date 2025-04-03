import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Grid
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Helper functions for date extraction (assuming DD-MM-YYYY format like in TaxPage)
// It's better to centralize these in a utils file later
const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  console.error(`Failed to parse date string in DD-MM-YYYY format: ${dateString}`);
  return null;
};

const getYear = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCFullYear() : null;
};

const getMonth = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  // Adding 1 because getUTCMonth() is 0-indexed (0 for January)
  return date ? date.getUTCMonth() + 1 : null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DividendsPage() {
  const [selectedYear, setSelectedYear] = useState('all');
  const [allTransactions, setAllTransactions] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch dividend transactions from the new endpoint
        const response = await fetch('http://localhost:8080/api/dividend-transactions'); // Corrected endpoint
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status} - ${errorText || 'Failed to fetch dividend transactions'}`);
        }
        const data = await response.json();
        // *** Assumption: data is an array of transaction objects ***
        // *** Assumption: Each transaction has 'Date', 'OrderType', 'AmountEUR' fields ***
        setAllTransactions(data || []);

        // Extract available years from transactions
        const years = new Set();
        (data || []).forEach(tx => {
          const year = getYear(tx.Date);
          if (year) {
            years.add(year);
          }
        });
        const sortedYears = Array.from(years).sort((a, b) => b - a); // Descending
        setAvailableYears(['all', ...sortedYears]);

        // Set initial year selection (e.g., latest year or 'all')
        setSelectedYear(sortedYears[0] ? String(sortedYears[0]) : 'all');

      } catch (e) {
        console.error("Failed to fetch dividend transactions:", e); // Updated error context
        setError(`Failed to load dividend transaction data: ${e.message}`); // Updated error message
        setAllTransactions([]);
        setAvailableYears(['all']);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, []); // Run only once on mount

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  // Filter transactions for dividends and selected year
  const filteredDividendTransactions = useMemo(() => {
    if (!allTransactions) return [];
    return allTransactions.filter(tx => {
      const isDividend = tx.OrderType && tx.OrderType.toLowerCase() === 'dividend';
      if (!isDividend) return false;

      if (selectedYear === 'all') return true; // Include if 'all' years selected

      const transactionYear = getYear(tx.Date);
      return transactionYear === Number(selectedYear);
    });
  }, [allTransactions, selectedYear]);

  // Prepare data for the chart (monthly or yearly)
  const chartData = useMemo(() => {
    if (selectedYear === 'all') {
      // Calculate yearly totals
      const yearlyTotals = {};
      filteredDividendTransactions.forEach(tx => {
        const year = getYear(tx.Date);
        if (year && tx.AmountEUR) {
          yearlyTotals[year] = (yearlyTotals[year] || 0) + tx.AmountEUR;
        }
      });

      const sortedYears = Object.keys(yearlyTotals).sort((a, b) => Number(a) - Number(b));
      const data = sortedYears.map(year => yearlyTotals[year]);

      return {
        labels: sortedYears,
        datasets: [
          {
            label: 'Total Gross Dividends per Year',
            data: data,
            backgroundColor: 'rgba(153, 102, 255, 0.6)', // Purple for yearly
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1,
          },
        ],
      };

    } else {
      // Calculate monthly totals for the selected year
      const monthlyTotals = Array(12).fill(0); // Index 0 for Jan, 1 for Feb, etc.
      filteredDividendTransactions.forEach(tx => {
        // No need to check year again, filteredDividendTransactions already filtered
        const month = getMonth(tx.Date); // 1-12
        if (month && tx.AmountEUR) {
          monthlyTotals[month - 1] += tx.AmountEUR;
        }
      });

      return {
        labels: MONTH_NAMES,
        datasets: [
          {
            label: `Gross Dividends Received (${selectedYear})`,
            data: monthlyTotals,
            backgroundColor: 'rgba(75, 192, 192, 0.6)', // Teal for monthly
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
          },
        ],
      };
    }
  }, [filteredDividendTransactions, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: selectedYear === 'all' ? 'Total Gross Dividends per Year' : `Monthly Gross Dividends Received - ${selectedYear}`,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Gross Amount (€)'
        }
      },
      x: {
        title: {
          display: true,
          text: selectedYear === 'all' ? 'Year' : 'Month',
        }
      }
    }
  }), [selectedYear]); // Re-calculate options when selectedYear changes

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Dividend Analysis
      </Typography>

      {/* Year Filter */}
      <Grid container spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
        <Grid item>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <InputLabel id="year-select-label">Year</InputLabel>
            <Select
              labelId="year-select-label"
              value={selectedYear}
              label="Year"
              onChange={handleYearChange}
              disabled={loading || error}
            >
              {availableYears.map(year => (
                <MenuItem key={year} value={String(year)}>
                  {year === 'all' ? 'All Years' : year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item>
          {loading && <CircularProgress size={24} />}
          {error && <Typography color="error">Error: {error}</Typography>}
        </Grid>
      </Grid>


      {/* Dividend Chart */}
      {!loading && !error && (
        <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
          {/* Title is now part of chartOptions */}
          <Box sx={{ height: 400 }}>
            {/* Check if there's actually data to display */}
            {chartData.datasets && chartData.datasets.length > 0 && chartData.datasets[0].data.length > 0 ? (
               <Bar options={chartOptions} data={chartData} />
            ) : (
               <Typography variant="body1" color="textSecondary" sx={{ textAlign: 'center', pt: '150px' }}> {/* Center vertically roughly */}
                  No dividend data available for the selected period.
               </Typography>
            )}
          </Box>
        </Paper>
      )}


      {/* Dividend Details Table */}
      {!loading && !error && (
        <Paper elevation={3} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Dividend Transactions ({selectedYear === 'all' ? 'All Years' : selectedYear})
          </Typography>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {/* *** Assumption: Relevant columns from processedTransactions *** */}
                  <TableCell>Date</TableCell>
                  <TableCell>Product Name</TableCell> {/* Changed from Ticker */}
                  <TableCell>ISIN</TableCell> {/* Added ISIN */}
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount (€)</TableCell>
                  <TableCell>Currency</TableCell>
                  {/* Add more columns as needed */}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDividendTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No dividend transactions found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDividendTransactions.map((tx, index) => (
                    // *** Assumption: tx object has these fields. Use a unique ID if available ***
                    <TableRow key={tx.ID || `${tx.Date}-${tx.ISIN}-${index}`} hover> {/* Use ISIN in key */}
                      <TableCell>{tx.Date}</TableCell>
                      <TableCell>{tx.ProductName || 'N/A'}</TableCell> {/* Display ProductName */}
                      <TableCell>{tx.ISIN || 'N/A'}</TableCell> {/* Display ISIN */}
                      <TableCell>{tx.Description || 'N/A'}</TableCell>
                      <TableCell align="right">{tx.AmountEUR?.toFixed(2) ?? 'N/A'}</TableCell>
                      <TableCell>{tx.Currency || 'N/A'}</TableCell>
                      {/* Render more cells */}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}
