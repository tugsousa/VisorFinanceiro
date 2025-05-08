// frontend/src/pages/StockPage.js
import React, { useState, useEffect, useMemo, useContext } from 'react'; // Added useContext
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Grid
} from '@mui/material';
import axios from 'axios'; // Import axios
import { AuthContext } from '../context/AuthContext'; // Import AuthContext
import YearlySalesChart from '../components/YearlySalesChart';

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

const StockPage = () => {
    const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext); // Get auth context
    const [allStockSales, setAllStockSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedYear, setSelectedYear] = useState('all');
    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        const fetchStockSales = async () => {
            if (!token) {
                setLoading(false);
                setError("User not authenticated. Please sign in.");
                setAllStockSales([]);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const currentCsrfToken = csrfToken || await fetchCsrfToken();
                const response = await axios.get('http://localhost:8080/api/stock-sales', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-CSRF-Token': currentCsrfToken,
                    },
                    withCredentials: true,
                });
                
                const salesData = response.data || []; // Expecting direct array
                setAllStockSales(salesData);

                const years = new Set();
                salesData.forEach(sale => {
                    const year = getYear(sale.SaleDate);
                    if (year) {
                        years.add(year);
                    }
                });
                const sortedYears = Array.from(years).sort((a, b) => b - a);
                setAvailableYears(['all', ...sortedYears]);
                setSelectedYear(sortedYears[0] ? String(sortedYears[0]) : 'all');

            } catch (e) {
                console.error("Error fetching stock sales:", e);
                setError(`Failed to load stock sales data: ${e.response?.data?.error || e.message}`);
                setAllStockSales([]);
                setAvailableYears(['all']);
            } finally {
                setLoading(false);
            }
        };

        fetchStockSales();
    }, [token, csrfToken, fetchCsrfToken]);

    const handleYearChange = (event) => {
        setSelectedYear(event.target.value);
    };

    const filteredStockSales = useMemo(() => {
        if (!allStockSales) return [];
        if (selectedYear === 'all') return allStockSales;
        return allStockSales.filter(sale => {
            const transactionYear = getYear(sale.SaleDate);
            return transactionYear === Number(selectedYear);
        });
    }, [allStockSales, selectedYear]);

    const totalFilteredDelta = useMemo(() => {
        return filteredStockSales.reduce((sum, sale) => sum + (sale.Delta || 0), 0);
    }, [filteredStockSales]);

    const calculateDaysHeld = (buyDateStr, saleDateStr) => {
        if (!buyDateStr || !saleDateStr) return 'N/A';
        try {
            const buyDate = parseDateDDMMYYYY(buyDateStr);
            const saleDate = parseDateDDMMYYYY(saleDateStr);
            if (!buyDate || !saleDate || isNaN(buyDate.getTime()) || isNaN(saleDate.getTime())) return 'Invalid Date';
            if (saleDate < buyDate) return 'Check Dates';
            const differenceInTime = saleDate.getTime() - buyDate.getTime();
            let differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24));
            return differenceInDays === 0 ? 1 : differenceInDays;
        } catch (error) { return 'Error'; }
    };

    const calculateAnnualizedReturn = (sale) => {
        const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
        const delta = sale.Delta;
        const buyAmount = Math.abs(sale.BuyAmountEUR); // BuyAmountEUR is cost
        if (typeof daysHeld !== 'number' || daysHeld <= 0 || typeof delta !== 'number' || typeof buyAmount !== 'number' || buyAmount <= 0) {
            return 'N/A';
        }
        try {
            const returnRatio = delta / buyAmount;
            return returnRatio * (365 / daysHeld);
        } catch (error) { return 'Calc Error'; }
    };

    if (loading) return <CircularProgress />;
    if (error) return <Typography color="error" sx={{ textAlign: 'center', mt: 2 }}>Error: {error}</Typography>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Stock Sales Analysis
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
                     {filteredStockSales.length > 0 && (
                        <Typography variant="subtitle1" component="div">
                            Total Delta ({selectedYear === 'all' ? 'All Years' : selectedYear}):
                            <Typography component="span" sx={{ fontWeight: 'bold', ml: 1 }}>
                                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalFilteredDelta)}
                            </Typography>
                        </Typography>
                     )}
                 </Grid>
            </Grid>

            {filteredStockSales.length > 0 && (
              <Box sx={{ mb: 4, height: 400 }}> {/* Ensure chart has height */}
                <YearlySalesChart stockSales={filteredStockSales} />
              </Box>
            )}

            <Typography variant="h6" gutterBottom>
                Stock Sales Details ({selectedYear === 'all' ? 'All Years' : selectedYear})
            </Typography>
            {filteredStockSales.length === 0 ? (
                <Typography sx={{ mt: 2, textAlign: 'center' }}>No stock sales data available for the selected period.</Typography>
            ) : (
                <Paper elevation={3} sx={{ overflow: 'hidden' }}>
                    <TableContainer sx={{ maxHeight: 600 }}>
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Buy Date</TableCell>
                                    <TableCell>Sale Date</TableCell>
                                    <TableCell>Days Held</TableCell>
                                    <TableCell>Product Name</TableCell>
                                    <TableCell>ISIN</TableCell>
                                    <TableCell align="right">Quantity</TableCell>
                                    <TableCell align="right">Buy Price</TableCell>
                                    <TableCell align="right">Sale Price</TableCell>
                                    <TableCell align="right">Buy Amount (EUR)</TableCell>
                                    <TableCell align="right">Sale Amount (EUR)</TableCell>
                                    <TableCell align="right">Commission (EUR)</TableCell>
                                    <TableCell align="right">Delta (EUR)</TableCell>
                                    <TableCell align="right">Annualized (%)</TableCell>
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
                                        returnDisplay = annualizedReturnRatio;
                                    }
                                    const daysHeldDisplay = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
                                    const key = `${sale.ISIN || sale.ProductName}-${sale.SaleDate}-${index}`;

                                    return (
                                        <TableRow hover key={key}>
                                            <TableCell>{sale.BuyDate}</TableCell>
                                            <TableCell>{sale.SaleDate || 'N/A'}</TableCell>
                                            <TableCell>{daysHeldDisplay}</TableCell>
                                            <TableCell>{sale.ProductName}</TableCell>
                                            <TableCell>{sale.ISIN}</TableCell>
                                            <TableCell align="right">{sale.Quantity}</TableCell>
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