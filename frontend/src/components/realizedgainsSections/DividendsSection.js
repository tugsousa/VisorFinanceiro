import React, { useMemo } from 'react';
import { Typography, Paper, Box, Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Bar } from 'react-chartjs-2';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants';
import { getBaseProductName } from '../../utils/chartUtils';
import { getYearString, getMonthIndex } from '../../utils/dateUtils';

const columns = [
  { field: 'Date', headerName: 'Date', width: 110 },
  { field: 'ProductName', headerName: 'Product', flex: 1, minWidth: 200 },
  { field: 'Amount', headerName: 'Amount', type: 'number', width: 120, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'Currency', headerName: 'Currency', width: 90 },
  { field: 'ExchangeRate', headerName: 'Exch. Rate', type: 'number', width: 120, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(4) : '' },
  {
    field: 'AmountEUR',
    headerName: 'Amount (€)',
    type: 'number',
    width: 130,
    renderCell: (params) => (
      <Typography sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
        {params.value?.toFixed(2)}
      </Typography>
    ),
  },
];

export default function DividendsSection({ dividendTransactionsData, selectedYear }) {
  const { relevantDividendTransactions, productChartData, timeSeriesChartData } = useMemo(() => {
    const emptyResult = { 
        relevantDividendTransactions: [], 
        productChartData: { labels: [], datasets: [] }, 
        timeSeriesChartData: { labels: [], datasets: [] } 
    };

    if (!dividendTransactionsData || dividendTransactionsData.length === 0) {
      return emptyResult;
    }
    
    const relevantTxs = dividendTransactionsData.filter(tx => tx.OrderType?.toLowerCase() === 'dividend');
    if(relevantTxs.length === 0) return emptyResult;

    const productDividendMap = {};
    relevantTxs.forEach(tx => {
      if (tx.AmountEUR != null) {
        const baseProduct = getBaseProductName(tx.ProductName);
        productDividendMap[baseProduct] = (productDividendMap[baseProduct] || 0) + tx.AmountEUR;
      }
    });

    const sortedByAmount = Object.entries(productDividendMap).sort(([, a], [, b]) => b - a);
    const topN = 9;
    const topItems = sortedByAmount.slice(0, topN);
    const otherItems = sortedByAmount.slice(topN);

    const chartItems = topItems.map(([name, amount]) => ({ name, amount }));
    if (otherItems.length > 0) {
      const othersAmount = otherItems.reduce((sum, [, amount]) => sum + amount, 0);
      chartItems.push({ name: 'Others', amount: othersAmount });
    }
    chartItems.sort((a,b) => a.amount - b.amount);

    const productChart = {
      labels: chartItems.map(item => item.name),
      datasets: [{
        data: chartItems.map(item => item.amount),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      }]
    };

    // *** FIX: Apply maxBarThickness to the dataset ***
    const smallDataSetThreshold = 5;
    const maxThickness = 60;
    if (productChart.labels.length > 0 && productChart.labels.length <= smallDataSetThreshold) {
        productChart.datasets[0].maxBarThickness = maxThickness;
    }
    
    let timeSeriesChart;
    if (selectedYear === ALL_YEARS_OPTION) {
      const yearlyMap = {};
      relevantTxs.forEach(tx => {
          const year = getYearString(tx.Date);
          if (year && tx.AmountEUR != null) {
              yearlyMap[year] = (yearlyMap[year] || 0) + tx.AmountEUR;
          }
      });
      const sortedYears = Object.keys(yearlyMap).sort((a, b) => a.localeCompare(b));
      timeSeriesChart = {
          labels: sortedYears,
          datasets: [{
              data: sortedYears.map(year => yearlyMap[year]),
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1,
          }]
      };
    } else {
      const monthlyData = new Array(12).fill(0);
      const yearTxs = relevantTxs.filter(tx => getYearString(tx.Date) === selectedYear);
      yearTxs.forEach(tx => {
          const monthIndex = getMonthIndex(tx.Date);
          if (monthIndex !== null && tx.AmountEUR != null) {
              monthlyData[monthIndex] += tx.AmountEUR;
          }
      });
      timeSeriesChart = {
          labels: MONTH_NAMES_CHART,
          datasets: [{
              data: monthlyData,
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1,
          }]
      };
    }

    // *** FIX: Apply maxBarThickness to the dataset ***
    if (timeSeriesChart.labels.length > 0 && timeSeriesChart.labels.length <= smallDataSetThreshold) {
        timeSeriesChart.datasets[0].maxBarThickness = maxThickness;
    }

    return { 
        relevantDividendTransactions: relevantTxs, 
        productChartData: productChart, 
        timeSeriesChartData: timeSeriesChart 
    };
  }, [dividendTransactionsData, selectedYear]);
  
  const productChartOptions = useMemo(() => ({
      responsive: true, maintainAspectRatio: false,
      plugins: {
          legend: { display: false },
          title: { display: true, text: `Gross Dividends by Product` },
          tooltip: { callbacks: { label: (ctx) => `${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
      },
      scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Amount (€)' } },
          x: { title: { display: true, text: 'Product' }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } }
      }
  }), []);

  const timeSeriesChartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Gross Dividends by ${selectedYear === ALL_YEARS_OPTION ? 'Year' : 'Month'}` },
      tooltip: { callbacks: { label: (ctx) => `${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'Amount (€)' } },
      x: { title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Year' : 'Month' } }
    }
  }), [selectedYear]);

  if (dividendTransactionsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>No dividend data {(selectedYear === ALL_YEARS_OPTION) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  const rows = relevantDividendTransactions.map((tx, index) => ({
    id: tx.ID || `${tx.OrderID}-${index}`,
    ...tx
  }));
  
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Dividends ({selectedYear === ALL_YEARS_OPTION ? 'All Years' : selectedYear})</Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={6}>
            <Box sx={{ height: 350 }}>
                {timeSeriesChartData.labels.length > 0 ? (
                    <Bar options={timeSeriesChartOptions} data={timeSeriesChartData} />
                ) : (
                    <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', pt: '25%' }}>No time-series data for this period.</Typography>
                )}
            </Box>
        </Grid>
        <Grid item xs={12} lg={6}>
            <Box sx={{ height: 350 }}>
                {productChartData.labels.length > 0 ? (
                    <Bar options={productChartOptions} data={productChartData} />
                ) : (
                    <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', pt: '25%' }}>No product data for this period.</Typography>
                )}
            </Box>
        </Grid>
      </Grid>
      
      <Box sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
        />
      </Box>
    </Paper>
  );
}