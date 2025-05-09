// frontend/src/components/dashboardSections/DividendsSection.js
import React, { useMemo, useState, useEffect, useContext } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box, CircularProgress
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';

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
    return null;
};

const getChartYear = (dateString) => { // Renamed to avoid conflict
    const date = parseDateDDMMYYYY(dateString);
    return date ? date.getUTCFullYear() : null;
};

const getChartMonth = (dateString) => { // Renamed to avoid conflict
    const date = parseDateDDMMYYYY(dateString);
    return date ? date.getUTCMonth() + 1 : null;
};
const MONTH_NAMES_CHART = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GOLDEN_ANGLE_PROD_COLOR = 137.5;
const getColorForProduct = (index, total) => {
  if (total <= 0) return 'rgba(200, 200, 200, 0.7)';
  const hue = (index * GOLDEN_ANGLE_PROD_COLOR + 120) % 360; // Offset hue for product
  const saturation = 65 + (index * 6) % 26;
  const lightness = 60 + (index * 5) % 21;
  return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
};
const getBorderColorForProduct = (index, total) => {
   if (total <= 0) return 'rgba(150, 150, 150, 1)';
   const hue = (index * GOLDEN_ANGLE_PROD_COLOR + 120) % 360;
   const saturation = 75 + (index * 6) % 21;
   const lightness = 45 + (index * 5) % 16;
   return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
};


export default function DividendsSection({ dividendSummaryData, selectedYear, hideIndividualTotalPL = false }) {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext);
  const [rawDividendTransactions, setRawDividendTransactions] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(null);

  useEffect(() => {
    const fetchDividendTransactions = async () => {
      if (!token) {
        setChartLoading(false);
        setChartError("User not authenticated for chart data.");
        setRawDividendTransactions([]);
        return;
      }
      setChartLoading(true);
      setChartError(null);
      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();
        const response = await axios.get('http://localhost:8080/api/dividend-transactions', {
            headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken, },
            withCredentials: true,
        });
        setRawDividendTransactions(response.data || []);
      } catch (e) {
        console.error("Failed to fetch raw dividend transactions for chart:", e);
        setChartError(`Chart data error: ${e.response?.data?.error || e.message}`);
        setRawDividendTransactions([]);
      } finally {
        setChartLoading(false);
      }
    };
    fetchDividendTransactions();
  }, [token, csrfToken, fetchCsrfToken]);


  const processedDividendData = useMemo(() => { // For the table
    const rows = [];
    let totalGross = 0;
    let totalTax = 0;
    const dataToProcess = dividendSummaryData || {}; 

    for (const [year, countries] of Object.entries(dataToProcess)) {
      for (const [country, amounts] of Object.entries(countries)) {
        const gross = amounts.gross_amt || 0;
        const tax = amounts.taxed_amt || 0; 
        const net = gross + tax;
        rows.push({ year, country, grossAmount: gross, taxAmount: tax, netAmount: net });
        totalGross += gross;
        totalTax += tax;
      }
    }
    rows.sort((a, b) => (a.year.localeCompare(b.year) || a.country.localeCompare(b.country)));
    return { rows, totalGross, totalTax, totalNet: totalGross + totalTax };
  }, [dividendSummaryData]);

  // Chart data logic adapted from DividendsPage.js
  const productChartData = useMemo(() => {
    const filteredForChart = rawDividendTransactions.filter(tx => {
        const orderTypeLower = tx.OrderType?.toLowerCase();
        const isDividendType = orderTypeLower === 'dividend'; // Only gross for this chart
        if (!isDividendType) return false;
        if (selectedYear === 'all') return true;
        const transactionYear = getChartYear(tx.Date);
        return transactionYear === Number(selectedYear);
    });

    if (filteredForChart.length === 0) return { labels: [], datasets: [] };

    const uniqueProductNames = [...new Set(filteredForChart.map(tx => tx.ProductName || 'Unknown Product'))].sort();
    const datasets = [];
    let labels = [];

    if (selectedYear === 'all') {
      const yearlyTotalsByProduct = {};
      const allYearsInData = new Set();
      filteredForChart.forEach(tx => {
        const year = getChartYear(tx.Date);
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
          backgroundColor: getColorForProduct(index, totalProducts),
          borderColor: getBorderColorForProduct(index, totalProducts),
          borderWidth: 1,
        });
      });
    } else {
      labels = MONTH_NAMES_CHART;
      const monthlyTotalsByProduct = {};
      uniqueProductNames.forEach(productName => { monthlyTotalsByProduct[productName] = Array(12).fill(0); });
      filteredForChart.forEach(tx => {
        const month = getChartMonth(tx.Date);
        const productName = tx.ProductName || 'Unknown Product';
        if (month && tx.AmountEUR) {
          monthlyTotalsByProduct[productName][month - 1] += tx.AmountEUR;
        }
      });
      const totalProducts = uniqueProductNames.length;
      uniqueProductNames.forEach((productName, index) => {
        datasets.push({
          label: productName, data: monthlyTotalsByProduct[productName],
          backgroundColor: getColorForProduct(index, totalProducts),
          borderColor: getBorderColorForProduct(index, totalProducts),
          borderWidth: 1,
        });
      });
    }
    return { labels, datasets };
  }, [rawDividendTransactions, selectedYear]);

  const productChartOptions = useMemo(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
          legend: { position: 'top' },
          title: { display: true, text: selectedYear === 'all' ? 'Gross Dividends Received per Year by Product' : `Monthly Gross Dividends by Product - ${selectedYear}`},
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label || ''}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.raw || 0)}`
            }
          }
      },
      scales: {
          y: { beginAtZero: true, stacked: true, title: { display: true, text: 'Gross Amount (€)'}},
          x: { stacked: true, title: { display: true, text: selectedYear === 'all' ? 'Year' : 'Month'}}
      }
  }), [selectedYear]);


  if (!processedDividendData || processedDividendData.rows.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Dividends</Typography>
        <Typography>No dividend data {selectedYear === 'all' ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Dividend Summary ({selectedYear === 'all' ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <>
          <Typography variant="body2" component="div">
            Total Gross: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedDividendData.totalGross.toFixed(2)} €</Typography>
          </Typography>
          <Typography variant="body2" component="div">
            Total Tax: <Typography component="span" sx={{ fontWeight: 'bold', color: processedDividendData.totalTax < 0 ? 'error.main' : 'inherit' }}>{processedDividendData.totalTax.toFixed(2)} €</Typography>
          </Typography>
          <Typography variant="body2" component="div" sx={{ mb: 2 }}>
            Total Net: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedDividendData.totalNet.toFixed(2)} €</Typography>
          </Typography>
        </>
      )}

      {chartLoading && <CircularProgress size={24} sx={{display: 'block', margin: '10px auto'}} />}
      {chartError && <Typography color="error" sx={{fontSize: '0.8rem', textAlign: 'center', mb:1}}>{chartError}</Typography>}
      {!chartLoading && !chartError && productChartData.datasets && productChartData.datasets.length > 0 && productChartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
         <Box sx={{ height: 300, mb: 2 }}>
            <Bar options={productChartOptions} data={productChartData} />
         </Box>
      )}

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {selectedYear === 'all' && <TableCell>Year</TableCell>}
              <TableCell>Country</TableCell>
              <TableCell align="right">Gross (€)</TableCell>
              <TableCell align="right">Tax (€)</TableCell>
              <TableCell align="right">Net (€)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processedDividendData.rows.map((row, index) => (
              <TableRow hover key={`${row.year}-${row.country}-${index}`}>
                {selectedYear === 'all' && <TableCell>{row.year}</TableCell>}
                <TableCell>{row.country}</TableCell>
                <TableCell align="right">{row.grossAmount.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: row.taxAmount < 0 ? 'error.main' : 'inherit' }}>
                    {row.taxAmount.toFixed(2)}
                </TableCell>
                <TableCell align="right">{row.netAmount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}