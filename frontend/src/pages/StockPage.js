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
// Removed ChartJS imports as chart is not needed

// Simplified Date Parsing and Year Extraction (Focus on DD-MM-YYYY)
// Keep date parsing logic as it's likely needed for filtering and calculations
const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  // Try DD-MM-YYYY first (common format)
  const parts = dateString.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[3], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month, day));
      // Final check if the constructed date is valid and matches the input year/month/day
      if (!isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date;
      }
    }
  }
  // Fallback: Try direct parsing (handles ISO etc.)
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

// Removed getMonth and MONTH_NAMES as chart is removed
// Removed getCompanyName and color functions as chart is removed

const StockPage = () => {
    const [allStockSales, setAllStockSales] = useState([]); // Renamed state
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedYear, setSelectedYear] = useState('all');
    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        const fetchStockSales = async () => { // Renamed function
            try {
                setLoading(true);
                const response = await fetch('/api/stock-sales'); // Updated API endpoint
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                // Use the provided structure (array of objects directly)
                const salesData = Array.isArray(data) ? data : [];
                setAllStockSales(salesData); // Store all fetched data

                // Extract available years from SaleDate
                const years = new Set();
                salesData.forEach(sale => {
                    // Use SaleDate for year filtering
                    const year = getYear(sale.SaleDate);
                    if (year) {
                        years.add(year);
                    }
                });
                const sortedYears = Array.from(years).sort((a, b) => b - a); // Descending
                setAvailableYears(['all', ...sortedYears]);

                // Set initial year selection (e.g., latest year or 'all')
                setSelectedYear(sortedYears[0] ? String(sortedYears[0]) : 'all');

                setError(null);
            } catch (e) {
                console.error("Error fetching stock sales:", e); // Updated log message
                // Attempt to log the raw response text for debugging
                if (e instanceof SyntaxError && e.message.includes('JSON.parse')) {
                    try {
                        const response = await fetch('/api/stock-sales'); // Re-fetch to get text
                        const text = await response.text();
                        console.error("Raw response text:", text);
                        setError(`Failed to parse stock sales data. Server responded with: ${text.substring(0, 100)}...`);
                    } catch (textError) {
                        console.error("Could not get raw response text:", textError);
                        setError("Failed to load stock sales data (JSON parsing error).");
                    }
                } else {
                    setError("Failed to load stock sales data.");
                }
                setAllStockSales([]); // Clear data on error
                setAvailableYears(['all']);
            } finally {
                setLoading(false);
            }
        };

        fetchStockSales();
    }, []); // Empty dependency array means this effect runs once on mount

    const handleYearChange = (event) => {
        setSelectedYear(event.target.value);
    };

    // Filter stock sales based on selected year (using SaleDate)
    const filteredStockSales = useMemo(() => {
        if (!allStockSales) return [];
        return allStockSales.filter(sale => {
            if (selectedYear === 'all') return true; // Include if 'all' years selected

            const transactionYear = getYear(sale.SaleDate); // Filter based on SaleDate year
            return transactionYear === Number(selectedYear);
        });
    }, [allStockSales, selectedYear]);

    // Calculate total Delta for the filtered transactions
    const totalFilteredDelta = useMemo(() => {
        return filteredStockSales.reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    }, [filteredStockSales]);

    // Removed chartData and chartOptions calculations

    // Update calculateDaysHeld to use BuyDate and SaleDate
    const calculateDaysHeld = (buyDateStr, saleDateStr) => {
        if (!buyDateStr || !saleDateStr) {
            return 'N/A';
        }
        try {
            const buyDate = parseDateDDMMYYYY(buyDateStr);
            const saleDate = parseDateDDMMYYYY(saleDateStr);

            if (!buyDate || !saleDate || isNaN(buyDate.getTime()) || isNaN(saleDate.getTime())) {
                console.warn("Could not parse dates for calculation:", buyDateStr, saleDateStr);
                return 'Invalid Date';
             }

             if (saleDate < buyDate) {
                 console.warn("Sale date is before buy date:", buyDateStr, saleDateStr);
                 return 'Check Dates';
            }

            const differenceInTime = saleDate.getTime() - buyDate.getTime();
            let differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24));

            if (differenceInDays === 0) {
                differenceInDays = 1;
            }

            return differenceInDays;
        } catch (error) {
            console.error("Error calculating days held:", error);
            return 'Error';
        }
    };

    // Update calculateAnnualizedReturn to use correct fields
    const calculateAnnualizedReturn = (sale) => {
        const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
        const delta = sale.Delta;
        // For stocks, the 'investment' is the initial purchase cost (BuyAmountEUR)
        // Ensure BuyAmountEUR is positive for calculation logic (it's negative in data, so use abs)
        const buyAmount = Math.abs(sale.BuyAmountEUR);

        if (typeof daysHeld !== 'number' || daysHeld <= 0 || typeof delta !== 'number' || typeof buyAmount !== 'number' || buyAmount <= 0) {
            return 'N/A';
        }

        try {
            // Annualized Return = (Total Gain / Initial Investment) * (365 / Days Held)
            const returnRatio = delta / buyAmount;
            const annualizedReturnRatio = returnRatio * (365 / daysHeld);
            return annualizedReturnRatio; // Return the ratio
        } catch (error) {
            console.error("Error calculating annualized return:", error, sale);
            return 'Calc Error';
        }
    };


    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}><CircularProgress /></Box>;
    }

    if (error) {
        return <Typography color="error" sx={{ textAlign: 'center', mt: 4 }}>Error: {error}</Typography>;
    }

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Stock Sales Analysis {/* Updated Title */}
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
                 {/* Display Total Delta */}
                 {!loading && !error && filteredStockSales.length > 0 && (
                    <Grid item xs={12} sm="auto" sx={{ textAlign: { xs: 'left', sm: 'right' }, mt: { xs: 1, sm: 0 }, flexGrow: 1 }}>
                        <Typography variant="subtitle1" component="div">
                            Total Delta ({selectedYear === 'all' ? 'All Years' : selectedYear}):
                            <Typography component="span" sx={{ fontWeight: 'bold', ml: 1 }}>
                                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalFilteredDelta)}
                            </Typography>
                        </Typography>
                    </Grid>
                 )}
            </Grid>

            {/* Removed Chart Section */}

            {/* Stock Sales Table */}
            <Typography variant="h6" gutterBottom>
                Stock Sales Details ({selectedYear === 'all' ? 'All Years' : selectedYear}) {/* Updated Title */}
            </Typography>
            {filteredStockSales.length === 0 && !loading && !error ? (
                <Typography sx={{ mt: 2, textAlign: 'center' }}>No stock sales data available for the selected period.</Typography>
            ) : (
                <Paper elevation={3} sx={{ overflow: 'hidden' }}>
                    <TableContainer sx={{ maxHeight: 600 }}>
                        {/* Using size="small" for denser table */}
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    {/* Update table headers to match data fields */}
                                    <TableCell>Buy Date</TableCell>
                                    <TableCell>Sale Date</TableCell>
                                    <TableCell>Days Held</TableCell>
                                    <TableCell>Product Name</TableCell>
                                    <TableCell align="right">Quantity</TableCell>
                                    <TableCell align="right">Buy Price</TableCell>
                                    <TableCell align="right">Sale Price</TableCell>
                                    <TableCell align="right">Buy Amount (€)</TableCell>
                                    <TableCell align="right">Sale Amount (€)</TableCell>
                                    <TableCell align="right">Commission (€)</TableCell>
                                    <TableCell align="right">Delta (€)</TableCell>
                                    <TableCell align="right">Annualized Return (%)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredStockSales.map((sale, index) => {
                                    const annualizedReturnRatio = calculateAnnualizedReturn(sale);
                                    let returnDisplay = 'N/A';
                                    let returnColor = 'inherit';
                                    if (typeof annualizedReturnRatio === 'number') {
                                        returnDisplay = `${(annualizedReturnRatio * 100).toFixed(2)}%`;
                                        if (annualizedReturnRatio > 0) returnColor = 'success.main';
                                        else if (annualizedReturnRatio < 0) returnColor = 'error.main';
                                    } else {
                                        returnDisplay = annualizedReturnRatio; // 'N/A' or 'Calc Error'
                                    }

                                    const daysHeldDisplay = calculateDaysHeld(sale.BuyDate, sale.SaleDate);

                                    // Use a unique key, combining relevant fields and index
                                    // Using ISIN and SaleDate might be more robust if available and unique per sale
                                    const key = `${sale.ISIN || sale.ProductName || 'no-id'}-${sale.SaleDate || 'no-sale-date'}-${index}`;

                                    return (
                                        <TableRow hover key={key}>
                                            <TableCell>{sale.BuyDate}</TableCell>
                                            <TableCell>{sale.SaleDate || 'N/A'}</TableCell>
                                            <TableCell>{daysHeldDisplay}</TableCell>
                                            <TableCell>{sale.ProductName}</TableCell>
                                            <TableCell align="right">{sale.Quantity}</TableCell>
                                            {/* Use optional chaining and toFixed for currency values */}
                                            <TableCell align="right">{sale.BuyPrice?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.SalePrice?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.BuyAmountEUR?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.SaleAmountEUR?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.Commission?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.Delta?.toFixed(2)}</TableCell>
                                            <TableCell align="right" sx={{ color: returnColor }}>
                                                {returnDisplay}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}
        </Box>
    );
};

export default StockPage;
