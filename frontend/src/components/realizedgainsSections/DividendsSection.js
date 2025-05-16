// frontend/src/components/realizedgainsSections/DividendsSection.js
import React, { useMemo } from 'react';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Box, CircularProgress, Alert } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useQuery } from '@tanstack/react-query';
import { apiFetchDividendTransactions } from '../../api/apiService';
import { useAuth } from '../../context/AuthContext';

import { ALL_YEARS_OPTION, UI_TEXT } from '../../constants';
import { getYearString } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const GREEN_COLOR_BG = 'rgba(75, 192, 192, 0.6)';
const GREEN_COLOR_BORDER = 'rgba(75, 192, 192, 1)';

const fetchDividendTransactions = async () => { // Renamed for clarity
  const response = await apiFetchDividendTransactions();
  return response.data || []; // Ensure it returns an array
};

// Note: The 'dividendSummaryData' prop is REMOVED
export default function DividendsSection({ selectedYear, hideIndividualTotalPL = false }) {
  const { token } = useAuth();

  const {
    data: rawDividendTransactions = [],
    isLoading: dataLoading, // Renamed from chartLoading for broader use
    error: dataErrorObj,    // Renamed from chartErrorObj
    isError: isDataError,   // Renamed from isChartError
  } = useQuery({
    queryKey: ['allDividendTransactions', token], // More generic query key
    queryFn: fetchDividendTransactions,
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const dataError = isDataError ? (dataErrorObj?.message || UI_TEXT.errorLoadingData) : null;

  // Process rawDividendTransactions for the TABLE
  const processedTableData = useMemo(() => {
    if (!rawDividendTransactions || rawDividendTransactions.length === 0) {
      return { rows: [], totalGross: 0, totalTax: 0, totalNet: 0 };
    }

    // Filter transactions by selectedYear if not 'all'
    const transactionsForSelectedPeriod = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
      ? rawDividendTransactions
      : rawDividendTransactions.filter(tx => getYearString(tx.Date) === selectedYear);

    // Aggregate data: map[yearString]->map[countryString]->{gross, tax}
    const aggregated = {};

    transactionsForSelectedPeriod.forEach(tx => {
      const year = getYearString(tx.Date);
      const country = tx.CountryCode || 'Unknown'; // CountryCode is from ProcessedTransaction
      const amount = tx.AmountEUR || 0;

      if (!year) return; // Skip if year cannot be determined

      if (!aggregated[year]) {
        aggregated[year] = {};
      }
      if (!aggregated[year][country]) {
        aggregated[year][country] = { gross_amt: 0, taxed_amt: 0 };
      }

      if (tx.OrderType?.toLowerCase() === 'dividend') {
        aggregated[year][country].gross_amt += amount;
      } else if (tx.OrderType?.toLowerCase() === 'dividendtax') {
        aggregated[year][country].taxed_amt += amount; // tax is usually negative
      }
    });

    const rows = [];
    let totalGross = 0;
    let totalTax = 0;

    // Sort years if displaying all years, otherwise it's just one year
    const yearsToIterate = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
        ? Object.keys(aggregated).sort((a,b) => a.localeCompare(b))
        : (aggregated[selectedYear] ? [selectedYear] : []);


    yearsToIterate.forEach(year => {
      const countries = aggregated[year] || {};
      Object.keys(countries).sort().forEach(country => {
        const amounts = countries[country];
        const gross = amounts.gross_amt || 0;
        const tax = amounts.taxed_amt || 0;
        const net = gross + tax;
        rows.push({ year, country, grossAmount: gross, taxAmount: tax, netAmount: net });
        if (selectedYear === ALL_YEARS_OPTION || !selectedYear || year === selectedYear) {
          totalGross += gross;
          totalTax += tax;
        }
      });
    });
    
    return { rows, totalGross, totalTax, totalNet: totalGross + totalTax };
  }, [rawDividendTransactions, selectedYear]);


  // productChartData for the Bar chart (uses rawDividendTransactions - logic unchanged)
  const productChartData = useMemo(() => {
    const filteredForChart = rawDividendTransactions.filter(tx => {
        const orderTypeLower = tx.OrderType?.toLowerCase();
        const isDividendType = orderTypeLower === 'dividend'; // Chart only shows gross dividends
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


  if (dataLoading) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none', textAlign: 'center' }}>
        <CircularProgress />
        <Typography>Loading dividend data...</Typography>
      </Paper>
    );
  }

  if (dataError) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Alert severity="error">{dataError}</Alert>
      </Paper>
    );
  }

  if (processedTableData.rows.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography variant="subtitle1" gutterBottom>Dividends</Typography>
        <Typography>No dividend data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="subtitle1" gutterBottom>
        Dividend Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <>
          <Typography variant="body2">Total Gross: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedTableData.totalGross.toFixed(2)} €</Typography></Typography>
          <Typography variant="body2">Total Tax: <Typography component="span" sx={{ fontWeight: 'bold', color: processedTableData.totalTax < 0 ? 'error.main' : 'inherit' }}>{processedTableData.totalTax.toFixed(2)} €</Typography></Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>Total Net: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedTableData.totalNet.toFixed(2)} €</Typography></Typography>
        </>
      )}

      {/* Chart (already uses rawDividendTransactions) */}
      {productChartData.datasets && productChartData.datasets.length > 0 && productChartData.datasets.some(ds => ds.data.some(d => d > 0)) && (
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
            {processedTableData.rows.map((row, index) => (
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