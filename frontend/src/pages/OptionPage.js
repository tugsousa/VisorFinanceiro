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
import './OptionPage.css'; // Assuming you might want some basic styling

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Simplified Date Parsing and Year/Month Extraction (Focus on DD-MM-YYYY)
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

const getMonth = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  // Adding 1 because getUTCMonth() is 0-indexed (0 for January)
  return date ? date.getUTCMonth() + 1 : null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Helper function to extract company name from product name
const getCompanyName = (productName) => {
  if (!productName || typeof productName !== 'string') return 'Unknown';
  // Assume company name is the first part before a space
  const parts = productName.split(' ');
  return parts[0] || 'Unknown';
};

// --- Color Generation Functions (adapted from DividendsPage) ---
const GOLDEN_ANGLE = 137.5; // Approximate golden angle in degrees

// Generate HSL color based on company index for better distribution
const getColorForCompany = (index, total) => {
  if (total <= 0) return 'rgba(200, 200, 200, 0.7)'; // Fallback
  const hue = (index * GOLDEN_ANGLE) % 360;
  const saturation = 60 + (index * 5) % 31; // 60-90%
  const lightness = 65 + (index * 3) % 16; // 65-80%
  return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
};

// Generate border color (slightly darker/more saturated)
const getBorderColorForCompany = (index, total) => {
   if (total <= 0) return 'rgba(150, 150, 150, 1)'; // Fallback
   const hue = (index * GOLDEN_ANGLE) % 360; // Keep hue consistent
   const saturation = 70 + (index * 5) % 26; // 70-95%
   const lightness = 50 + (index * 3) % 16; // 50-65%
   return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
}
// --- End Color Generation Functions ---


const OptionPage = () => {
    const [allOptionSales, setAllOptionSales] = useState([]); // Renamed from optionSales
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedYear, setSelectedYear] = useState('all');
    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        const fetchOptionSales = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/option-sales');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                const salesData = data.OptionSaleDetails || [];
                setAllOptionSales(salesData); // Store all fetched data

                // Extract available years from CLOSE date
                const years = new Set();
                salesData.forEach(sale => {
                    // Use close_date for year filtering/charting
                    const year = getYear(sale.close_date);
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
                console.error("Error fetching option sales:", e);
                // Attempt to log the raw response text for debugging
                if (e instanceof SyntaxError && e.message.includes('JSON.parse')) {
                    try {
                        // Re-fetch or access the response text if possible (depends on how response was handled)
                        // A simpler approach for now: log the error and indicate it's a parsing issue.
                        // For more robust logging, you might need to adjust the initial fetch logic
                        // to read the response as text first if the status indicates an error or if JSON parsing fails.
                        const response = await fetch('/api/option-sales'); // Re-fetch to get text - might not be ideal
                        const text = await response.text();
                        console.error("Raw response text:", text);
                        setError(`Failed to parse option sales data. Server responded with: ${text.substring(0, 100)}...`);
                    } catch (textError) {
                        console.error("Could not get raw response text:", textError);
                        setError("Failed to load option sales data (JSON parsing error).");
                    }
                } else {
                    setError("Failed to load option sales data.");
                }
                setAllOptionSales([]); // Clear data on error
                setAvailableYears(['all']);
            } finally {
                setLoading(false);
            }
        };

        fetchOptionSales();
    }, []); // Empty dependency array means this effect runs once on mount

    const handleYearChange = (event) => {
        setSelectedYear(event.target.value);
    };

    // Filter option sales based on selected year (using close_date)
    const filteredOptionSales = useMemo(() => {
        if (!allOptionSales) return [];
        return allOptionSales.filter(sale => {
            if (selectedYear === 'all') return true; // Include if 'all' years selected

            const transactionYear = getYear(sale.close_date); // Filter based on close date year
            return transactionYear === Number(selectedYear);
        });
    }, [allOptionSales, selectedYear]);

    // Calculate total delta for the filtered transactions
    const totalFilteredDelta = useMemo(() => {
        return filteredOptionSales.reduce((sum, sale) => sum + (sale.delta || 0), 0);
    }, [filteredOptionSales]);

    // Prepare data for the STACKED chart (monthly or yearly by Company)
    const chartData = useMemo(() => {
        const uniqueCompanies = [...new Set(filteredOptionSales.map(sale => getCompanyName(sale.product_name)))].sort();
        const datasets = [];
        let labels = [];

        if (selectedYear === 'all') {
            // Yearly view: Sum delta per year, stacked by company
            const yearlyTotalsByCompany = {}; // { year: { company: totalDelta } }
            const allYearsInData = new Set();

            filteredOptionSales.forEach(sale => {
                const year = getYear(sale.close_date);
                const company = getCompanyName(sale.product_name);
                if (year && sale.delta !== undefined && sale.delta !== null) {
                    allYearsInData.add(String(year)); // Collect all years with data
                    if (!yearlyTotalsByCompany[year]) {
                        yearlyTotalsByCompany[year] = {};
                    }
                    yearlyTotalsByCompany[year][company] = (yearlyTotalsByCompany[year][company] || 0) + sale.delta;
                }
            });

            labels = Array.from(allYearsInData).sort((a, b) => Number(a) - Number(b));
            const totalCompanies = uniqueCompanies.length;

            uniqueCompanies.forEach((company, index) => {
                const data = labels.map(year => yearlyTotalsByCompany[year]?.[company] || 0);
                datasets.push({
                    label: company, // Company name as label
                    data: data,
                    backgroundColor: getColorForCompany(index, totalCompanies),
                    borderColor: getBorderColorForCompany(index, totalCompanies),
                    borderWidth: 1,
                });
            });

        } else {
            // Monthly view for the selected year: Sum delta per month, stacked by company
            labels = MONTH_NAMES;
            const monthlyTotalsByCompany = {}; // { company: [month1_total, month2_total, ...] }

            uniqueCompanies.forEach(company => {
                monthlyTotalsByCompany[company] = Array(12).fill(0); // Initialize monthly totals for this company
            });

            filteredOptionSales.forEach(sale => {
                // Already filtered by year
                const month = getMonth(sale.close_date); // 1-12
                const company = getCompanyName(sale.product_name);
                if (month && sale.delta !== undefined && sale.delta !== null) {
                    monthlyTotalsByCompany[company][month - 1] += sale.delta;
                }
            });

            const totalCompanies = uniqueCompanies.length;
            uniqueCompanies.forEach((company, index) => {
                datasets.push({
                    label: company, // Company name as label
                    data: monthlyTotalsByCompany[company],
                    backgroundColor: getColorForCompany(index, totalCompanies),
                    borderColor: getBorderColorForCompany(index, totalCompanies),
                    borderWidth: 1,
                });
            });
        }

        return { labels, datasets };

    }, [filteredOptionSales, selectedYear]); // Ensure dependencies are correct

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false, // Allow chart to resize height
        plugins: {
            legend: {
                display: true, // Show legend for companies
                position: 'top',
            },
            title: {
                display: true,
                text: selectedYear === 'all' ? 'Total Option Delta per Year by Company' : `Monthly Option Delta by Company - ${selectedYear}`,
            },
            tooltip: {
                callbacks: {
                    // Hide the default label (e.g., "Company: €Value")
                    label: function(context) {
                        return null;
                    },
                    // Add individual option sale details for the specific company and period
                    afterBody: (tooltipItems) => {
                        const tooltipItem = tooltipItems.find(item => item.datasetIndex !== undefined && item.dataIndex !== undefined);
                        if (!tooltipItem) return [];

                        const dataIndex = tooltipItem.dataIndex; // Index for the label (year/month)
                        const datasetIndex = tooltipItem.datasetIndex; // Index for the dataset (company)
                        const companyLabel = chartData.datasets[datasetIndex]?.label; // Get the company for this dataset

                        let relevantSales = [];

                        if (selectedYear === 'all') {
                            // Yearly view: label is the year
                            const yearLabel = chartData.labels[dataIndex];
                            const year = parseInt(yearLabel, 10);
                            relevantSales = filteredOptionSales.filter(sale =>
                                getYear(sale.close_date) === year && getCompanyName(sale.product_name) === companyLabel
                            );
                        } else {
                            // Monthly view: dataIndex corresponds to month (0-11)
                            const monthIndex = dataIndex; // 0 = Jan, 1 = Feb, etc.
                            const year = parseInt(selectedYear, 10);
                            relevantSales = filteredOptionSales.filter(sale => {
                                // getMonth returns 1-12, so compare with monthIndex + 1
                                return getMonth(sale.close_date) === monthIndex + 1 &&
                                       getYear(sale.close_date) === year &&
                                       getCompanyName(sale.product_name) === companyLabel;
                            });
                        }

                        // Format details for the tooltip
                        const details = relevantSales.map(sale =>
                            `  • ${sale.product_name}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(sale.delta || 0)}`
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
                    text: 'Total Delta (€)'
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
    }), [selectedYear, filteredOptionSales, chartData.datasets, chartData.labels]); // Added chartData dependencies for tooltip

    // Original calculateDaysHeld function
    const calculateDaysHeld = (openDateStr, closeDateStr) => {
        if (!openDateStr || !closeDateStr) {
            return 'N/A'; // Return N/A if either date is missing
        }
        try {
            const openDate = parseDateDDMMYYYY(openDateStr); // Use consistent parsing
            const closeDate = parseDateDDMMYYYY(closeDateStr); // Use consistent parsing

            if (!openDate || !closeDate || isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) {
                console.warn("Could not parse dates for calculation:", openDateStr, closeDateStr);
                return 'Invalid Date';
             }

             if (closeDate < openDate) {
                 console.warn("Close date is before open date:", openDateStr, closeDateStr);
                 return 'Check Dates';
            }

            const differenceInTime = closeDate.getTime() - openDate.getTime();
            let differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24)); // Convert ms to days

            // Ensure DaysHeld is at least 1 if open and close are on the same day
            if (differenceInDays === 0) {
                differenceInDays = 1;
            }

            return differenceInDays;
        } catch (error) {
            console.error("Error calculating days held:", error);
            return 'Error';
        }
    };

    // Calculate Annualized Return
    const calculateAnnualizedReturn = (sale) => {
        const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
        const delta = sale.delta;
        const openAmount = Math.abs(sale.open_amount_eur); // Use absolute value for premium received

        // Validate inputs
        // Check if daysHeld is a valid positive number
        // Check if delta is a number
        // Check if openAmount is a positive number (premium received should be positive for calculation)
        if (typeof daysHeld !== 'number' || daysHeld <= 0 || typeof delta !== 'number' || typeof openAmount !== 'number' || openAmount <= 0) {
             // Log specific reasons for N/A if needed for debugging
             // console.log("Annualized Return N/A:", { daysHeld, delta, openAmount });
            return 'N/A';
        }

        try {
            // Calculate annualized percentage return: (Return / Investment) * (365 / Days)
            // Return = delta
            // Investment = open_amount_eur (premium received, should be positive)
            const returnRatio = delta / openAmount;
            const annualizedReturnRatio = returnRatio * (365 / daysHeld);
            // Return the ratio (e.g., 0.1 for 10%) - formatting happens in the table cell
            return annualizedReturnRatio;
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
        <Box sx={{ p: 3 }}> {/* Added Padding */}
            <Typography variant="h4" component="h1" gutterBottom>
                Option Sales Analysis
            </Typography>

            {/* Year Filter and Loading/Error Indicator */}
            <Grid container spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
                <Grid item>
                    <FormControl sx={{ minWidth: 150 }} size="small">
                        <InputLabel id="year-select-label">Year</InputLabel>
                        <Select
                            labelId="year-select-label"
                            value={selectedYear}
                            label="Year"
                            onChange={handleYearChange}
                            disabled={loading || error || availableYears.length <= 1} // Disable if only 'all'
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
                    {/* Loading/Error indicators were moved to the top level return */}
                </Grid>
                 {/* Display Total Delta */}
                 {!loading && !error && filteredOptionSales.length > 0 && (
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

            {/* Option Delta Chart */}
            {!loading && !error && (
                <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
                    <Box sx={{ height: 400 }}>
                        {chartData.datasets && chartData.datasets.length > 0 && chartData.datasets[0].data.some(d => d !== 0) ? ( // Check if there's non-zero data
                           <Bar options={chartOptions} data={chartData} />
                        ) : (
                           <Typography variant="body1" color="textSecondary" sx={{ textAlign: 'center', pt: '150px' }}>
                              No option delta data available for the selected period.
                           </Typography>
                        )}
                    </Box>
                </Paper>
            )}


            {/* Option Sales Table */}
            <Typography variant="h6" gutterBottom>
                Option Sales Details ({selectedYear === 'all' ? 'All Years' : selectedYear})
            </Typography>
            {filteredOptionSales.length === 0 && !loading && !error ? (
                <Typography sx={{ mt: 2, textAlign: 'center' }}>No option sales data available for the selected period.</Typography>
            ) : (
                <Paper elevation={3} sx={{ overflow: 'hidden' }}> {/* Added Paper and overflow hidden */}
                    <TableContainer sx={{ maxHeight: 600 }}> {/* Added max height for scroll */}
                        <Table stickyHeader size="small" className="option-sales-table"> {/* Added size small */}
                            <TableHead>
                                <TableRow>
                                    <TableCell>Open Date</TableCell>
                                    <TableCell>Close Date</TableCell>
                                    <TableCell>Days Held</TableCell>
                                    <TableCell>Product Name</TableCell>
                                    <TableCell align="right">Quantity</TableCell>
                                    <TableCell align="right">Open Price</TableCell>
                                    <TableCell align="right">Close Price</TableCell>
                                    {/* Simplified currency display */}
                                    <TableCell align="right">Open Amount (€)</TableCell>
                                    <TableCell align="right">Close Amount (€)</TableCell>
                                    <TableCell align="right">Commission (€)</TableCell>
                                    <TableCell align="right">Delta (€)</TableCell>
                                    <TableCell align="right">Annualized Return (%)</TableCell> {/* Changed Header Back */}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredOptionSales.map((sale, index) => {
                                    const annualizedReturnRatio = calculateAnnualizedReturn(sale); // Now calculates the ratio
                                    let returnDisplay = 'N/A';
                                    let returnColor = 'inherit'; // Default text color
                                    // Format the ratio as a percentage
                                    if (typeof annualizedReturnRatio === 'number') {
                                        returnDisplay = `${(annualizedReturnRatio * 100).toFixed(2)}%`;
                                        if (annualizedReturnRatio > 0) {
                                            returnColor = 'success.main'; // Green for positive return
                                        } else if (annualizedReturnRatio < 0) {
                                            returnColor = 'error.main'; // Red for negative return
                                        }
                                        // Keep default color for 0% return
                                    } else {
                                        returnDisplay = annualizedReturnRatio; // Display 'N/A' or 'Calc Error'
                                    }

                                    const daysHeldDisplay = calculateDaysHeld(sale.open_date, sale.close_date);

                                    return (
                                        // Use a combination of IDs, dates, and index for a more unique key
                                        // Use a combination of IDs, dates, and index for a more unique key
                                        <TableRow hover key={`${sale.open_order_id || 'no-open-id'}-${sale.close_date || 'no-close-date'}-${index}`}>
                                            <TableCell>{sale.open_date}</TableCell>
                                            <TableCell>{sale.close_date || 'N/A'}</TableCell>
                                            <TableCell>{daysHeldDisplay}</TableCell> {/* Use calculated display value */}
                                            <TableCell>{sale.product_name}</TableCell>
                                            <TableCell align="right">{sale.quantity}</TableCell>
                                            <TableCell align="right">{sale.open_price?.toFixed(2)}</TableCell>
                                        <TableCell align="right">{sale.close_price?.toFixed(2)}</TableCell>
                                        <TableCell align="right">{sale.open_amount_eur?.toFixed(2)}</TableCell>
                                        <TableCell align="right">{sale.close_amount_eur?.toFixed(2)}</TableCell>
                                        <TableCell align="right">{sale.commission?.toFixed(2)}</TableCell>
                                        <TableCell align="right">{sale.delta?.toFixed(2)}</TableCell>
                                        {/* New Cell with conditional styling */}
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
