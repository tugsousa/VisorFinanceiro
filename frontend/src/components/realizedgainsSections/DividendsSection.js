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

  // This serves as the common base for summary, table, and chart data.
  const relevantDividendTransactions = useMemo(() => {
    if (!rawDividendTransactions || rawDividendTransactions.length === 0) {
      return [];
    }
    // Filter for actual dividend transactions first
    const dividendTxs = rawDividendTransactions.filter(
      tx => tx.OrderType?.toLowerCase() === 'dividend'
    );

    // Then, filter by selectedYear if a specific year is chosen
    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
      return dividendTxs;
    }
    return dividendTxs.filter(tx => getYearString(tx.Date) === selectedYear);
  }, [rawDividendTransactions, selectedYear]);


  // Processes data for the summary text (Total Dividends Received)
  const summaryData = useMemo(() => {
    if (relevantDividendTransactions.length === 0) {
      return { totalDividends: 0 };
    }

    let accumulatedDividends = 0;
    relevantDividendTransactions.forEach(tx => {
      // AmountEUR is assumed to be the gross dividend amount for 'dividend' type transactions.
      accumulatedDividends += tx.AmountEUR || 0;
    });
    
    // The summary only shows total dividends received.
    return { totalDividends: accumulatedDividends };
  }, [relevantDividendTransactions]);


  // Process and sort transactions for the DETAILED TABLE
  const sortedDetailedTableTransactions = useMemo(() => {
    if (relevantDividendTransactions.length === 0) {
      return [];
    }
    // Sort a copy of the array
    return [...relevantDividendTransactions].sort((a, b) => {
        const dateA = parseDateRobust(a.Date);
        const dateB = parseDateRobust(b.Date);
        
        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return 1; 
        if (dateB === null) return -1;

        if (dateB.getTime() - dateA.getTime() !== 0) return dateB.getTime() - dateA.getTime(); // Descending by date
        return (a.OrderID || "").localeCompare(b.OrderID || ""); 
    });
  }, [relevantDividendTransactions]);


  // productChartData for the Bar chart (uses relevantDividendTransactions)
  const productChartData = useMemo(() => {
    if (relevantDividendTransactions.length === 0) return { labels: [], datasets: [] };

    const productDividendMap = {};
    relevantDividendTransactions.forEach(tx => {
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
    
    if (finalLabels.length === 0) return { labels: [], datasets: [] };

    return {
      labels: finalLabels,
      datasets: [{
        data: finalAmounts,
        backgroundColor: finalAmounts.map(() => GREEN_COLOR_BG),
        borderColor: finalAmounts.map(() => GREEN_COLOR_BORDER),
        borderWidth: 1,
      }]
    };
  }, [relevantDividendTransactions]);

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
              label: (context) => `${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.raw || 0)}`
            }
          }
      },
      scales: {
          y: { 
            beginAtZero: true, 
            title: { display: true, text: 'Amount (€)'}
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

  // This message is for when the API returns no data at all.
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
          {/* Simplified summary: only total dividends received */}
          <Typography variant="body2" sx={{ mb: 2 }}>
            Total Dividends Received: 
            <Typography component="span" sx={{ fontWeight: 'bold' }}>
              {summaryData.totalDividends.toFixed(2)} €
            </Typography>
          </Typography>
        </>
      )}

      {/* Chart rendering condition: ensure there are labels to display (i.e., chartable data exists) */}
      {productChartData.labels && productChartData.labels.length > 0 ? (
         <Box sx={{ height: 350, mb: 2 }}>
            <Bar options={productChartOptions} data={productChartData} />
         </Box>
      ) : (
        // Optional: Display a message if chart has no data but there were transactions.
        // This occurs if relevantDividendTransactions has items, but they don't result in chartable data (e.g., all amounts are zero).
        relevantDividendTransactions.length > 0 &&
        <Typography sx={{ textAlign: 'center', color: 'text.secondary', fontStyle: 'italic', mb: 2 }}>
            No chart data to display for dividends in the selected period.
        </Typography>
      )}

      <TableContainer sx={{ maxHeight: 400, mt: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 100 }}>Date</TableCell>
              <TableCell sx={{ minWidth: 200, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Product Name</TableCell>
              <TableCell align="right" sx={{ minWidth: 90 }}>Amount</TableCell>
              <TableCell sx={{ minWidth: 70 }}>Currency</TableCell>
              <TableCell align="right" sx={{ minWidth: 90 }}>Exch. Rate</TableCell>
              <TableCell align="right" sx={{ minWidth: 110 }}>Amount (EUR)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedDetailedTableTransactions.length > 0 ? (
              sortedDetailedTableTransactions.map((tx, index) => (
                <TableRow hover key={tx.ID || `${tx.OrderID}-${index}`}>
                  <TableCell>{tx.Date}</TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.ProductName}>
                    {tx.ProductName}
                  </TableCell>
                  <TableCell align="right">{tx.Amount?.toFixed(2)}</TableCell>
                  <TableCell>{tx.Currency}</TableCell>
                  <TableCell align="right">{tx.ExchangeRate?.toFixed(4)}</TableCell>
                  <TableCell 
                    align="right" 
                    sx={{ 
                      // Color based on AmountEUR's sign (positive for typical dividend, negative for reversal/correction)
                      color: tx.AmountEUR != null && tx.AmountEUR >= 0 ? 'success.main' : 'error.main'
                    }}
                  >
                    {tx.AmountEUR?.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No individual dividend transactions for {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'all periods' : `year ${selectedYear}`}.
                  {/* This message appears if relevantDividendTransactions is empty. */}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}