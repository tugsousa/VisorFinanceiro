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

// Simple hash function for string to number
const simpleHash = (str) => {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

const GOLDEN_ANGLE = 137.5; // Approximate golden angle in degrees

// Generate HSL color based on ISIN index for better distribution
const getColorForIsin = (index, total) => {
  if (total <= 0) return 'rgba(200, 200, 200, 0.7)'; // Fallback
  const hue = (index * GOLDEN_ANGLE) % 360;
  // Vary saturation and lightness slightly based on index but keep them reasonable
  const saturation = 60 + (index * 5) % 31; // 60-90%
  const lightness = 65 + (index * 3) % 16; // 65-80%
  return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
};

// Generate border color (slightly darker/more saturated)
const getBorderColorForIsin = (index, total) => {
   if (total <= 0) return 'rgba(150, 150, 150, 1)'; // Fallback
   const hue = (index * GOLDEN_ANGLE) % 360; // Keep hue consistent
   const saturation = 70 + (index * 5) % 26; // 70-95%
   const lightness = 50 + (index * 3) % 16; // 50-65%
   return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
}


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

  // Calculate total EUR amount for the filtered transactions
  const totalFilteredAmountEUR = useMemo(() => {
    return filteredDividendTransactions.reduce((sum, tx) => sum + (tx.AmountEUR || 0), 0);
  }, [filteredDividendTransactions]);

  // Prepare data for the STACKED chart (monthly or yearly by ProductName)
  const chartData = useMemo(() => {
    // Group by ProductName instead of ISIN
    const uniqueProductNames = [...new Set(filteredDividendTransactions.map(tx => tx.ProductName || 'Unknown Product'))].sort();
    const datasets = [];
    let labels = [];

    if (selectedYear === 'all') {
      // Yearly view
      const yearlyTotalsByProduct = {}; // { year: { productName: total } }
      const allYears = new Set();

      filteredDividendTransactions.forEach(tx => {
        const year = getYear(tx.Date);
        const productName = tx.ProductName || 'Unknown Product'; // Use ProductName
        if (year && tx.AmountEUR) {
          allYears.add(String(year)); // Collect all years with data
          if (!yearlyTotalsByProduct[year]) {
            yearlyTotalsByProduct[year] = {};
          }
          yearlyTotalsByProduct[year][productName] = (yearlyTotalsByProduct[year][productName] || 0) + tx.AmountEUR;
        }
      });

      labels = Array.from(allYears).sort((a, b) => Number(a) - Number(b));
      const totalProducts = uniqueProductNames.length; // Get total count

      uniqueProductNames.forEach((productName, index) => { // Iterate by productName
        const data = labels.map(year => yearlyTotalsByProduct[year]?.[productName] || 0);
        datasets.push({
          label: productName, // Use ProductName as label
          data: data,
          // Use index-based color functions (can keep using the same functions, just based on product index now)
          backgroundColor: getColorForIsin(index, totalProducts), // Renaming function might be good later
          borderColor: getBorderColorForIsin(index, totalProducts), // Renaming function might be good later
          borderWidth: 1,
        });
      });

    } else {
      // Monthly view for the selected year
      labels = MONTH_NAMES;
      const monthlyTotalsByProduct = {}; // { productName: [month1_total, month2_total, ...] }

      uniqueProductNames.forEach(productName => {
        monthlyTotalsByProduct[productName] = Array(12).fill(0); // Initialize monthly totals for this product
      });

      filteredDividendTransactions.forEach(tx => {
        // Already filtered by year
        const month = getMonth(tx.Date); // 1-12
        const productName = tx.ProductName || 'Unknown Product'; // Use ProductName
        if (month && tx.AmountEUR) {
          monthlyTotalsByProduct[productName][month - 1] += tx.AmountEUR;
        }
      });

      const totalProducts = uniqueProductNames.length; // Get total count
      uniqueProductNames.forEach((productName, index) => { // Iterate by productName
        datasets.push({
          label: productName, // Use ProductName as label
          data: monthlyTotalsByProduct[productName],
           // Use index-based color functions
          backgroundColor: getColorForIsin(index, totalProducts), // Renaming function might be good later
          borderColor: getBorderColorForIsin(index, totalProducts), // Renaming function might be good later
          borderWidth: 1,
        });
      });
    }

    return { labels, datasets };

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
          // Return null to hide the default label (e.g., "ISIN: €Value")
          label: function(context) {
            return null;
          },
          // Add individual dividend details for the specific ISIN and period
          afterBody: (tooltipItems) => {
            // Find all transactions contributing to the hovered bar/stack segment
            const tooltipItem = tooltipItems.find(item => item.datasetIndex !== undefined && item.dataIndex !== undefined);
            if (!tooltipItem) return [];

            const dataIndex = tooltipItem.dataIndex; // Index for the label (year/month)
            const datasetIndex = tooltipItem.datasetIndex; // Index for the dataset (ProductName)
            const productLabel = chartData.datasets[datasetIndex]?.label; // Get the ProductName for this dataset

            let relevantTransactions = [];

            if (selectedYear === 'all') {
              // Yearly view: label is the year
              const yearLabel = chartData.labels[dataIndex];
              const year = parseInt(yearLabel, 10);
              relevantTransactions = filteredDividendTransactions.filter(tx =>
                getYear(tx.Date) === year && (tx.ProductName || 'Unknown Product') === productLabel
              );
            } else {
              // Monthly view: dataIndex corresponds to month (0-11)
              const monthIndex = dataIndex; // 0 = Jan, 1 = Feb, etc.
              const year = parseInt(selectedYear, 10);
              relevantTransactions = filteredDividendTransactions.filter(tx => {
                // getMonth returns 1-12, so compare with monthIndex + 1
                return getMonth(tx.Date) === monthIndex + 1 &&
                       getYear(tx.Date) === year &&
                       (tx.ProductName || 'Unknown Product') === productLabel;
              });
            }

            // Only show details if they belong to the specific ProductName segment hovered
            // Tooltip detail format remains the same (shows ProductName and Amount)
            const details = relevantTransactions.map(tx =>
              `  • ${tx.ProductName || 'Unknown Product'}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(tx.AmountEUR || 0)}`
            );

            // Limit the number of details shown
            const maxDetails = 5;
            if (details.length > maxDetails) {
              const remainingCount = details.length - maxDetails;
              return [...details.slice(0, maxDetails), `  ...and ${remainingCount} more`];
            }

            return details.length > 0 ? ['', ...details] : []; // Add empty line for spacing if details exist
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        stacked: true, // Enable stacking on Y axis
        title: {
          display: true,
          text: 'Gross Amount (€)'
        }
      },
      x: {
        stacked: true, // Enable stacking on X axis
        title: {
          display: true,
          text: selectedYear === 'all' ? 'Year' : 'Month',
        }
      }
    }
    // Add dependencies
  }), [selectedYear, filteredDividendTransactions, chartData.datasets, chartData.labels]); // chartData needed for tooltip

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
        {/* Display Total Amount */}
        {!loading && !error && filteredDividendTransactions.length > 0 && (
          <Grid item xs={12} sm="auto" sx={{ textAlign: { xs: 'left', sm: 'right' }, mt: { xs: 1, sm: 0 } }}>
             <Typography variant="subtitle1" component="div">
               Total Dividends ({selectedYear === 'all' ? 'All Years' : selectedYear}):
               <Typography component="span" sx={{ fontWeight: 'bold', ml: 1 }}>
                 {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalFilteredAmountEUR)}
               </Typography>
             </Typography>
          </Grid>
        )}
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
                  <TableCell>Date</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>ISIN</TableCell>
                  <TableCell>Country Code</TableCell> {/* Added Country Code */}
                  <TableCell align="right">Amount</TableCell> {/* Original Amount */}
                  <TableCell align="right">Exchange Rate</TableCell> {/* Added Exchange Rate */}
                  <TableCell align="right">Amount EUR</TableCell> {/* Amount in EUR */}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDividendTransactions.length === 0 ? (
                  <TableRow>
                    {/* Adjusted colSpan to match new number of columns */}
                    <TableCell colSpan={7} align="center">
                      No dividend transactions found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDividendTransactions.map((tx, index) => (
                    // Use a unique ID if available, otherwise construct a key
                    <TableRow key={tx.OrderID || tx.ID || `${tx.Date}-${tx.ISIN}-${index}`} hover>
                      <TableCell>{tx.Date || 'N/A'}</TableCell>
                      <TableCell>{tx.ProductName || 'N/A'}</TableCell>
                      <TableCell>{tx.ISIN || 'N/A'}</TableCell>
                      <TableCell>{tx.country_code || 'N/A'}</TableCell> {/* Display Country Code */}
                      {/* Display original Amount and Currency */}
                      <TableCell align="right">{`${tx.Amount?.toFixed(2) ?? 'N/A'} ${tx.Currency || ''}`}</TableCell>
                      {/* Display Exchange Rate */}
                      <TableCell align="right">{tx.ExchangeRate?.toFixed(4) ?? 'N/A'}</TableCell>
                      {/* Display AmountEUR */}
                      <TableCell align="right">{tx.AmountEUR?.toFixed(2) ?? 'N/A'}</TableCell>
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
