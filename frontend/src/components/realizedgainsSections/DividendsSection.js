// frontend/src/components/realizedgainsSections/DividendsSection.js
import React, { useMemo } from 'react';
import { /* ...MUI imports... */ Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Box, CircularProgress, Alert } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useQuery } from '@tanstack/react-query'; // Import useQuery
import { apiFetchDividendTransactions } from '../../api/apiService'; // API function
import { useAuth } from '../../context/AuthContext'; // To get token

import { ALL_YEARS_OPTION, UI_TEXT } from '../../constants';
import { getYearString } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const GREEN_COLOR_BG = 'rgba(75, 192, 192, 0.6)';
const GREEN_COLOR_BORDER = 'rgba(75, 192, 192, 1)';

const fetchDividendTransactionsForChart = async () => {
  const response = await apiFetchDividendTransactions();
  return response.data || []; // Ensure it returns an array
};

export default function DividendsSection({ dividendSummaryData, selectedYear, hideIndividualTotalPL = false }) {
  const { token } = useAuth();

  const { 
    data: rawDividendTransactions = [], // Default to empty array
    isLoading: chartLoading, 
    error: chartErrorObj,
    isError: isChartError,
  } = useQuery({
    queryKey: ['dividendTransactionsForChart', token], // Separate query key
    queryFn: fetchDividendTransactionsForChart,
    enabled: !!token && !hideIndividualTotalPL, // Fetch only if chart is to be shown and user is logged in
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  const chartError = isChartError ? (chartErrorObj?.message || UI_TEXT.errorLoadingData) : null;

  // processedDividendData for the table (uses prop dividendSummaryData)
  const processedDividendData = useMemo(() => {
    // ... (this logic remains the same as it uses props)
    const rows = [];
    let totalGross = 0;
    let totalTax = 0;
    
    // Ensure dividendSummaryData is an object before trying to Object.entries
    const dataToProcess = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
        ? (dividendSummaryData || {})
        : ((dividendSummaryData && dividendSummaryData[selectedYear]) ? { [selectedYear]: dividendSummaryData[selectedYear] } : {});


    for (const [year, countries] of Object.entries(dataToProcess)) {
      if (selectedYear !== ALL_YEARS_OPTION && year !== selectedYear && selectedYear !== '') continue; 
      // Ensure countries is an object
      for (const [country, amounts] of Object.entries(countries || {})) {
        const gross = amounts.gross_amt || 0;
        const tax = amounts.taxed_amt || 0; 
        const net = gross + tax;
        rows.push({ year, country, grossAmount: gross, taxAmount: tax, netAmount: net });
        totalGross += gross;
        totalTax += tax;
      }
    }
    rows.sort((a, b) => (String(a.year).localeCompare(String(b.year)) || a.country.localeCompare(b.country)));
    return { rows, totalGross, totalTax, totalNet: totalGross + totalTax };
  }, [dividendSummaryData, selectedYear]);


  // productChartData for the Bar chart (uses fetched rawDividendTransactions)
  const productChartData = useMemo(() => {
    // ... (this logic remains the same, but now uses rawDividendTransactions from useQuery)
    const filteredForChart = rawDividendTransactions.filter(tx => {
        const orderTypeLower = tx.OrderType?.toLowerCase();
        const isDividendType = orderTypeLower === 'dividend';
        if (!isDividendType) return false;
        if (selectedYear === ALL_YEARS_OPTION || !selectedYear) return true;
        const transactionYear = getYearString(tx.Date);
        return transactionYear === selectedYear;
    });

    if (filteredForChart.length === 0) return { labels: [], datasets: [] };

    const productDividendMap = {};
    filteredForChart.forEach(tx => {
        if (tx.AmountEUR != null) {
            const baseProduct = getBaseProductName(tx.ProductName);
            productDividendMap[baseProduct] = (productDividendMap[baseProduct] || 0) + tx.AmountEUR;
        }
    });

    const productsWithDividends = Object.entries(productDividendMap).map(([name, amount]) => ({ name, amount }));
    
    const sortedByAmountForOthers = [...productsWithDividends].sort((a, b) => b.amount - a.amount);
    const topN = 15; 
    let itemsForChart = [];
    let othersAmount = 0;
    let hasOthers = false;

    if (sortedByAmountForOthers.length > topN) {
        itemsForChart = sortedByAmountForOthers.slice(0, topN);
        const otherProducts = sortedByAmountForOthers.slice(topN);
        othersAmount = otherProducts.reduce((sum, p) => sum + p.amount, 0);
        hasOthers = true;
    } else { 
        itemsForChart = sortedByAmountForOthers;
    }

    if (hasOthers && othersAmount > 0) {
        itemsForChart.push({ name: 'Others', amount: othersAmount });
    }
    
    itemsForChart.sort((a, b) => {
      if (a.amount !== b.amount) return a.amount - b.amount; 
      if (a.name === 'Others') return 1; 
      if (b.name === 'Others') return -1;
      return a.name.localeCompare(b.name);
    });
    
    const finalLabels = itemsForChart.map(p => p.name);
    const finalAmounts = itemsForChart.map(p => p.amount);
    const finalBackgroundColors = finalAmounts.map(() => GREEN_COLOR_BG);
    const finalBorderColors = finalAmounts.map(() => GREEN_COLOR_BORDER);
    
    if (finalLabels.length === 0) return { labels: [], datasets: [] };

    return {
      labels: finalLabels,
      datasets: [{
        label: `Gross Dividends`,
        data: finalAmounts,
        backgroundColor: finalBackgroundColors,
        borderColor: finalBorderColors,
        borderWidth: 1,
      }]
    };
  }, [rawDividendTransactions, selectedYear]);

  const productChartOptions = useMemo(() => ({
    // ... (this logic remains the same)
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
          legend: { display: false }, 
          title: { 
            display: true, 
            text: `Gross Dividends by Product (${(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})`
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label || 'Gross Amount'}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.raw || 0)}`
            }
          }
      },
      scales: {
          y: { 
            beginAtZero: true, 
            title: { display: true, text: 'Gross Amount (€)'}
          },
          x: { 
            title: { display: true, text: 'Product'},
            ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 }
          }
      }
  }), [selectedYear]);


  if (!processedDividendData || processedDividendData.rows.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography variant="subtitle1" gutterBottom>Dividends</Typography>
        <Typography>No dividend data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      {/* ... (Rest of the JSX rendering logic for table and summary text) ... */}
      <Typography variant="subtitle1" gutterBottom>
        Dividend Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <>
          <Typography variant="body2">Total Gross: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedDividendData.totalGross.toFixed(2)} €</Typography></Typography>
          <Typography variant="body2">Total Tax: <Typography component="span" sx={{ fontWeight: 'bold', color: processedDividendData.totalTax < 0 ? 'error.main' : 'inherit' }}>{processedDividendData.totalTax.toFixed(2)} €</Typography></Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>Total Net: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedDividendData.totalNet.toFixed(2)} €</Typography></Typography>
        </>
      )}

      {chartLoading && <CircularProgress size={24} sx={{display: 'block', margin: '10px auto'}} />}
      {chartError && <Alert severity="error" sx={{fontSize: '0.8rem', textAlign: 'center', mb:1}}>{chartError}</Alert>}
      
      {!chartLoading && !chartError && productChartData.datasets && productChartData.datasets.length > 0 && productChartData.datasets.some(ds => ds.data.some(d => d > 0)) && (
         <Box sx={{ height: 350, mb: 2 }}>
            <Bar options={productChartOptions} data={productChartData} /> 
         </Box>
      )}

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {(selectedYear === ALL_YEARS_OPTION || !selectedYear) && <TableCell>Year</TableCell>}
              <TableCell>Country</TableCell>
              <TableCell align="right">Gross (€)</TableCell>
              <TableCell align="right">Tax (€)</TableCell>
              <TableCell align="right">Net (€)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processedDividendData.rows.map((row, index) => (
              <TableRow hover key={`${row.year}-${row.country}-${index}`}>
                {(selectedYear === ALL_YEARS_OPTION || !selectedYear) && <TableCell>{row.year}</TableCell>}
                <TableCell>{row.country}</TableCell>
                <TableCell align="right">{row.grossAmount.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: row.taxAmount < 0 ? 'error.main' : 'inherit' }}>{row.taxAmount.toFixed(2)}</TableCell>
                <TableCell align="right">{row.netAmount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}