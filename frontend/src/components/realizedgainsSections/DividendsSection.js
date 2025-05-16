// frontend/src/components/realizedgainsSections/DividendsSection.js
import React, { useMemo } from 'react';
import { Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Box, CircularProgress, Alert } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useQuery } from '@tanstack/react-query';
import { apiFetchDividendTransactions } from '../../api/apiService';
import { useAuth } from '../../context/AuthContext';

import { ALL_YEARS_OPTION, UI_TEXT } from '../../constants';
import { getYearString, parseDateRobust } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const GREEN_COLOR_BG = 'rgba(75, 192, 192, 0.6)';
const GREEN_COLOR_BORDER = 'rgba(75, 192, 192, 1)';

const fetchDividendTransactions = async () => {
  const response = await apiFetchDividendTransactions();
  return response.data || [];
};

export default function DividendsSection({ selectedYear, hideIndividualTotalPL = false }) {
  const { token } = useAuth();

  const {
    data: rawDividendTransactions = [],
    isLoading: dataLoading,
    error: dataErrorObj,
    isError: isDataError,
  } = useQuery({
    queryKey: ['allDividendTransactions', token],
    queryFn: fetchDividendTransactions,
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const dataError = isDataError ? (dataErrorObj?.message || UI_TEXT.errorLoadingData) : null;

  // This processes data for the summary text (Total Gross, Total Tax, Total Net)
  const processedSummaryData = useMemo(() => {
    if (!rawDividendTransactions || rawDividendTransactions.length === 0) {
      return { totalGross: 0, totalTax: 0, totalNet: 0 };
    }

    const transactionsForSelectedPeriod = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
      ? rawDividendTransactions
      : rawDividendTransactions.filter(tx => getYearString(tx.Date) === selectedYear);

    let totalGross = 0;
    let totalTax = 0;

    transactionsForSelectedPeriod.forEach(tx => {
      const amount = tx.AmountEUR || 0;
      if (tx.OrderType?.toLowerCase() === 'dividend') {
        totalGross += amount;
      } else if (tx.OrderType?.toLowerCase() === 'dividendtax') {
        totalTax += amount; // tax is usually negative
      }
    });
    
    return { totalGross, totalTax, totalNet: totalGross + totalTax };
  }, [rawDividendTransactions, selectedYear]);


  // Process rawDividendTransactions for the DETAILED TABLE
  const detailedDividendTransactions = useMemo(() => {
    if (!rawDividendTransactions || rawDividendTransactions.length === 0) {
      return [];
    }

    const transactionsForSelectedPeriod = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
      ? rawDividendTransactions
      : rawDividendTransactions.filter(tx => getYearString(tx.Date) === selectedYear);

    return transactionsForSelectedPeriod.sort((a, b) => {
        const dateA = parseDateRobust(a.Date);
        const dateB = parseDateRobust(b.Date);
        
        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return 1; 
        if (dateB === null) return -1;

        if (dateB.getTime() - dateA.getTime() !== 0) return dateB.getTime() - dateA.getTime(); // Descending by date
        return (a.OrderID || "").localeCompare(b.OrderID || ""); 
    });
  }, [rawDividendTransactions, selectedYear]);


  // productChartData for the Bar chart (uses rawDividendTransactions)
  const productChartData = useMemo(() => {
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

  if (rawDividendTransactions.length === 0) {
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
          <Typography variant="body2">Total Gross: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedSummaryData.totalGross.toFixed(2)} €</Typography></Typography>
          <Typography variant="body2">Total Tax: <Typography component="span" sx={{ fontWeight: 'bold', color: processedSummaryData.totalTax < 0 ? 'error.main' : 'inherit' }}>{processedSummaryData.totalTax.toFixed(2)} €</Typography></Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>Total Net: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedSummaryData.totalNet.toFixed(2)} €</Typography></Typography>
        </>
      )}

      {productChartData.datasets && productChartData.datasets.length > 0 && productChartData.datasets.some(ds => ds.data.some(d => d > 0)) && (
         <Box sx={{ height: 350, mb: 2 }}>
            <Bar options={productChartOptions} data={productChartData} />
         </Box>
      )}

      <TableContainer sx={{ maxHeight: 400, mt: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 100 }}>Date</TableCell>
              <TableCell sx={{ minWidth: 200, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Product Name</TableCell>
              {/* Removed Type column from header */}
              <TableCell align="right" sx={{ minWidth: 90 }}>Amount</TableCell>
              <TableCell sx={{ minWidth: 70 }}>Currency</TableCell>
              <TableCell align="right" sx={{ minWidth: 90 }}>Exch. Rate</TableCell>
              <TableCell align="right" sx={{ minWidth: 110 }}>Amount (EUR)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {detailedDividendTransactions.length > 0 ? (
              detailedDividendTransactions.map((tx, index) => (
                <TableRow hover key={tx.ID || `${tx.OrderID}-${index}`}>
                  <TableCell>{tx.Date}</TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.ProductName}>
                    {tx.ProductName}
                  </TableCell>
                  {/* Removed Type column from body */}
                  <TableCell align="right">{tx.Amount?.toFixed(2)}</TableCell>
                  <TableCell>{tx.Currency}</TableCell>
                  <TableCell align="right">{tx.ExchangeRate?.toFixed(4)}</TableCell>
                  <TableCell 
                    align="right" 
                    sx={{ 
                      // Color logic simplified as OrderType isn't directly used for display here
                      // We determine color based on whether AmountEUR is positive (typical for dividend) or negative (typical for tax)
                      color: tx.AmountEUR >= 0 ? 'success.main' : 'error.main'
                    }}
                  >
                    {tx.AmountEUR?.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                {/* Adjusted colSpan since one column was removed */}
                <TableCell colSpan={6} align="center">
                  No individual dividend transactions for {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'all periods' : `year ${selectedYear}`}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}