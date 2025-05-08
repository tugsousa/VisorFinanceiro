// frontend/src/pages/OptionPage.js
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
import './OptionPage.css';

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

const getCompanyName = (productName) => {
  if (!productName || typeof productName !== 'string') return 'Unknown';
  const parts = productName.split(' ');
  return parts[0] || 'Unknown';
};

const GOLDEN_ANGLE = 137.5;
const getColorForCompany = (index, total) => {
  if (total <= 0) return 'rgba(200, 200, 200, 0.7)';
  const hue = (index * GOLDEN_ANGLE) % 360;
  const saturation = 60 + (index * 5) % 31;
  const lightness = 65 + (index * 3) % 16;
  return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
};
const getBorderColorForCompany = (index, total) => {
   if (total <= 0) return 'rgba(150, 150, 150, 1)';
   const hue = (index * GOLDEN_ANGLE) % 360;
   const saturation = 70 + (index * 5) % 26;
   const lightness = 50 + (index * 3) % 16;
   return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
};

const OptionPage = () => {
    const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext); // Get auth context
    const [allOptionSales, setAllOptionSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedYear, setSelectedYear] = useState('all');
    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        const fetchOptionSales = async () => {
            if (!token) {
                setLoading(false);
                setError("User not authenticated. Please sign in.");
                setAllOptionSales([]);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const currentCsrfToken = csrfToken || await fetchCsrfToken();
                const response = await axios.get('http://localhost:8080/api/option-sales', { // Ensure correct endpoint
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-CSRF-Token': currentCsrfToken,
                    },
                    withCredentials: true,
                });
                
                // Backend for option-sales returns { OptionSaleDetails: [] }
                const salesData = response.data.OptionSaleDetails || [];
                setAllOptionSales(salesData);

                const years = new Set();
                salesData.forEach(sale => {
                    const year = getYear(sale.close_date);
                    if (year) {
                        years.add(year);
                    }
                });
                const sortedYears = Array.from(years).sort((a, b) => b - a);
                setAvailableYears(['all', ...sortedYears]);
                setSelectedYear(sortedYears[0] ? String(sortedYears[0]) : 'all');

            } catch (e) {
                console.error("Error fetching option sales:", e);
                setError(`Failed to load option sales data: ${e.response?.data?.error || e.message}`);
                setAllOptionSales([]);
                setAvailableYears(['all']);
            } finally {
                setLoading(false);
            }
        };

        fetchOptionSales();
    }, [token, csrfToken, fetchCsrfToken]);

    const handleYearChange = (event) => {
        setSelectedYear(event.target.value);
    };

    const filteredOptionSales = useMemo(() => {
        if (!allOptionSales) return [];
        if (selectedYear === 'all') return allOptionSales;
        return allOptionSales.filter(sale => {
            const transactionYear = getYear(sale.close_date);
            return transactionYear === Number(selectedYear);
        });
    }, [allOptionSales, selectedYear]);

    const totalFilteredDelta = useMemo(() => {
        return filteredOptionSales.reduce((sum, sale) => sum + (sale.delta || 0), 0);
    }, [filteredOptionSales]);

    const chartData = useMemo(() => {
        const uniqueCompanies = [...new Set(filteredOptionSales.map(sale => getCompanyName(sale.product_name)))].sort();
        const datasets = [];
        let labels = [];

        if (selectedYear === 'all') {
            const yearlyTotalsByCompany = {}; 
            const allYearsInData = new Set();
            filteredOptionSales.forEach(sale => {
                const year = getYear(sale.close_date);
                const company = getCompanyName(sale.product_name);
                if (year && sale.delta !== undefined && sale.delta !== null) {
                    allYearsInData.add(String(year));
                    if (!yearlyTotalsByCompany[year]) yearlyTotalsByCompany[year] = {};
                    yearlyTotalsByCompany[year][company] = (yearlyTotalsByCompany[year][company] || 0) + sale.delta;
                }
            });
            labels = Array.from(allYearsInData).sort((a, b) => Number(a) - Number(b));
            const totalCompanies = uniqueCompanies.length;
            uniqueCompanies.forEach((company, index) => {
                const data = labels.map(year => yearlyTotalsByCompany[year]?.[company] || 0);
                datasets.push({
                    label: company, data,
                    backgroundColor: getColorForCompany(index, totalCompanies),
                    borderColor: getBorderColorForCompany(index, totalCompanies),
                    borderWidth: 1,
                });
            });
        } else {
            labels = MONTH_NAMES;
            const monthlyTotalsByCompany = {};
            uniqueCompanies.forEach(company => { monthlyTotalsByCompany[company] = Array(12).fill(0); });
            filteredOptionSales.forEach(sale => {
                const month = getMonth(sale.close_date);
                const company = getCompanyName(sale.product_name);
                if (month && sale.delta !== undefined && sale.delta !== null) {
                    monthlyTotalsByCompany[company][month - 1] += sale.delta;
                }
            });
            const totalCompanies = uniqueCompanies.length;
            uniqueCompanies.forEach((company, index) => {
                datasets.push({
                    label: company, data: monthlyTotalsByCompany[company],
                    backgroundColor: getColorForCompany(index, totalCompanies),
                    borderColor: getBorderColorForCompany(index, totalCompanies),
                    borderWidth: 1,
                });
            });
        }
        return { labels, datasets };
    }, [filteredOptionSales, selectedYear]);

    const chartOptions = useMemo(() => ({ /* ... Your existing chartOptions, ensure dependencies include chartData.labels and chartData.datasets if tooltip uses them ... */
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: selectedYear === 'all' ? 'Total Option Delta per Year by Company' : `Monthly Option Delta by Company - ${selectedYear}`},
            tooltip: {
                callbacks: {
                    label: (context) => null,
                    afterBody: (tooltipItems) => {
                        const tooltipItem = tooltipItems.find(item => item.datasetIndex !== undefined && item.dataIndex !== undefined);
                        if (!tooltipItem) return [];
                        const dataIndex = tooltipItem.dataIndex;
                        const datasetIndex = tooltipItem.datasetIndex;
                        const companyLabel = chartData.datasets[datasetIndex]?.label;
                        let relevantSales = [];
                        if (selectedYear === 'all') {
                            const yearLabel = chartData.labels[dataIndex];
                            const year = parseInt(yearLabel, 10);
                            relevantSales = filteredOptionSales.filter(sale => getYear(sale.close_date) === year && getCompanyName(sale.product_name) === companyLabel);
                        } else {
                            const monthIndex = dataIndex;
                            const year = parseInt(selectedYear, 10);
                            relevantSales = filteredOptionSales.filter(sale => getMonth(sale.close_date) === monthIndex + 1 && getYear(sale.close_date) === year && getCompanyName(sale.product_name) === companyLabel);
                        }
                        const details = relevantSales.map(sale => `  • ${sale.product_name}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(sale.delta || 0)}`);
                        const maxDetails = 5;
                        if (details.length > maxDetails) return [...details.slice(0, maxDetails), `  ...and ${details.length - maxDetails} more`];
                        return details.length > 0 ? ['', ...details] : [];
                    }
                }
            }
        },
        scales: {
            y: { beginAtZero: true, stacked: true, title: { display: true, text: 'Total Delta (€)'}},
            x: { stacked: true, title: { display: true, text: selectedYear === 'all' ? 'Year' : 'Month'}}
        }
    }), [selectedYear, filteredOptionSales, chartData.labels, chartData.datasets]);

    const calculateDaysHeld = (openDateStr, closeDateStr) => {
        if (!openDateStr || !closeDateStr) return 'N/A';
        try {
            const openDate = parseDateDDMMYYYY(openDateStr);
            const closeDate = parseDateDDMMYYYY(closeDateStr);
            if (!openDate || !closeDate || isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) return 'Invalid Date';
            if (closeDate < openDate) return 'Check Dates';
            const differenceInTime = closeDate.getTime() - openDate.getTime();
            let differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24));
            return differenceInDays === 0 ? 1 : differenceInDays;
        } catch (error) { return 'Error'; }
    };

    const calculateAnnualizedReturn = (sale) => {
        const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
        const delta = sale.delta;
        const openAmount = Math.abs(sale.open_amount_eur);
        if (typeof daysHeld !== 'number' || daysHeld <= 0 || typeof delta !== 'number' || typeof openAmount !== 'number' || openAmount <= 0) {
            return 'N/A';
        }
        try {
            const returnRatio = delta / openAmount;
            return returnRatio * (365 / daysHeld);
        } catch (error) { return 'Calc Error'; }
    };

    if (loading) return <CircularProgress />;
    if (error) return <Typography color="error" sx={{ textAlign: 'center', mt: 2 }}>Error: {error}</Typography>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Option Sales Analysis
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
                    {filteredOptionSales.length > 0 && (
                        <Typography variant="subtitle1" component="div">
                            Total Delta ({selectedYear === 'all' ? 'All Years' : selectedYear}):
                            <Typography component="span" sx={{ fontWeight: 'bold', ml: 1 }}>
                                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalFilteredDelta)}
                            </Typography>
                        </Typography>
                    )}
                </Grid>
            </Grid>

            {filteredOptionSales.length > 0 && chartData.datasets && chartData.datasets.length > 0 && chartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
                <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
                    <Box sx={{ height: 400 }}>
                       <Bar options={chartOptions} data={chartData} />
                    </Box>
                </Paper>
            )}

            <Typography variant="h6" gutterBottom>
                Option Sales Details ({selectedYear === 'all' ? 'All Years' : selectedYear})
            </Typography>
            {filteredOptionSales.length === 0 ? (
                <Typography sx={{ mt: 2, textAlign: 'center' }}>No option sales data available for the selected period.</Typography>
            ) : (
                <Paper elevation={3} sx={{ overflow: 'hidden' }}>
                    <TableContainer sx={{ maxHeight: 600 }}>
                        <Table stickyHeader size="small" className="option-sales-table">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Open Date</TableCell>
                                    <TableCell>Close Date</TableCell>
                                    <TableCell>Days Held</TableCell>
                                    <TableCell>Product Name</TableCell>
                                    <TableCell align="right">Qty</TableCell>
                                    <TableCell align="right">Open Price</TableCell>
                                    <TableCell align="right">Close Price</TableCell>
                                    <TableCell align="right">Open Amt (€)</TableCell>
                                    <TableCell align="right">Close Amt (€)</TableCell>
                                    <TableCell align="right">Comm (€)</TableCell>
                                    <TableCell align="right">Delta (€)</TableCell>
                                    <TableCell align="right">Annualized (%)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredOptionSales.map((sale, index) => {
                                    const annualizedReturnRatio = calculateAnnualizedReturn(sale);
                                    let returnDisplay = 'N/A';
                                    let returnColor = 'inherit';
                                    if (typeof annualizedReturnRatio === 'number') {
                                        returnDisplay = `${(annualizedReturnRatio * 100).toFixed(2)}%`;
                                        if (annualizedReturnRatio > 0) returnColor = 'success.main';
                                        else if (annualizedReturnRatio < 0) returnColor = 'error.main';
                                    } else { returnDisplay = annualizedReturnRatio; }
                                    const daysHeldDisplay = calculateDaysHeld(sale.open_date, sale.close_date);
                                    const key = `${sale.open_order_id || 'no-id'}-${sale.close_date}-${index}`;

                                    return (
                                        <TableRow hover key={key}>
                                            <TableCell>{sale.open_date}</TableCell>
                                            <TableCell>{sale.close_date || 'N/A'}</TableCell>
                                            <TableCell>{daysHeldDisplay}</TableCell>
                                            <TableCell>{sale.product_name}</TableCell>
                                            <TableCell align="right">{sale.quantity}</TableCell>
                                            <TableCell align="right">{sale.open_price?.toFixed(4)}</TableCell>
                                            <TableCell align="right">{sale.close_price?.toFixed(4)}</TableCell>
                                            <TableCell align="right">{sale.open_amount_eur?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.close_amount_eur?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.commission?.toFixed(2)}</TableCell>
                                            <TableCell align="right">{sale.delta?.toFixed(2)}</TableCell>
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

export default OptionPage;