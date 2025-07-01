import React, { useMemo } from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Bar } from 'react-chartjs-2';
import { ALL_YEARS_OPTION } from '../../constants';
import { getBaseProductName } from '../../utils/chartUtils';

const columns = [
  { field: 'Date', headerName: 'Date', width: 110 },
  { field: 'ProductName', headerName: 'Product', flex: 1, minWidth: 200 },
  // FIX: Updated valueFormatter signature
  { field: 'Amount', headerName: 'Amount', type: 'number', width: 120, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'Currency', headerName: 'Currency', width: 90 },
  // FIX: Updated valueFormatter signature
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
  const { relevantDividendTransactions, productChartData } = useMemo(() => {
    if (!dividendTransactionsData || dividendTransactionsData.length === 0) {
      return { relevantDividendTransactions: [], productChartData: { labels: [], datasets: [] } };
    }
    const relevantTxs = dividendTransactionsData.filter(tx => tx.OrderType?.toLowerCase() === 'dividend');

    const productDividendMap = {};
    relevantTxs.forEach(tx => {
      if (tx.AmountEUR != null) {
        const baseProduct = getBaseProductName(tx.ProductName);
        productDividendMap[baseProduct] = (productDividendMap[baseProduct] || 0) + tx.AmountEUR;
      }
    });

    const sortedByAmount = Object.entries(productDividendMap).sort(([, a], [, b]) => b - a);
    const topN = 15;
    const topItems = sortedByAmount.slice(0, topN);
    const otherItems = sortedByAmount.slice(topN);

    const chartItems = topItems.map(([name, amount]) => ({ name, amount }));
    if (otherItems.length > 0) {
      const othersAmount = otherItems.reduce((sum, [, amount]) => sum + amount, 0);
      chartItems.push({ name: 'Others', amount: othersAmount });
    }
    chartItems.sort((a,b) => a.amount - b.amount);

    const labels = chartItems.map(item => item.name);
    const data = chartItems.map(item => item.amount);

    const chartData = {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      }]
    };
    return { relevantDividendTransactions: relevantTxs, productChartData: chartData };
  }, [dividendTransactionsData]);
  
  const productChartOptions = useMemo(() => ({
      responsive: true, maintainAspectRatio: false,
      plugins: {
          legend: { display: false },
          title: { display: true, text: `Gross Dividends by Product (${(selectedYear === ALL_YEARS_OPTION) ? 'All Years' : selectedYear})` },
          tooltip: { callbacks: { label: (ctx) => `${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
      },
      scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Amount (€)' } },
          x: { title: { display: true, text: 'Product' }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } }
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
      <Typography variant="h6" sx={{ mb: 2 }}>Dividends</Typography>
      {productChartData.labels.length > 0 ? (
        <Box sx={{ height: 350, mb: 3 }}>
          <Bar options={productChartOptions} data={productChartData} />
        </Box>
      ) : (
        <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary' }}>No chartable dividend data for this period.</Typography>
      )}
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