// frontend/src/components/realizedgainsSections/DividendsSection.js
import React, { useMemo } from 'react';
import { Typography, Paper, Box, Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { Bar } from 'react-chartjs-2';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants';
import { getBaseProductName } from '../../utils/chartUtils';
import { getYearString, getMonthIndex, parseDateRobust } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

const columns = [
  {
    field: 'date',
    headerName: 'Data',
    width: 110,
    type: 'date',
    valueGetter: (value) => parseDateRobust(value),
    valueFormatter: (value) => {
      if (!value) return '';
      const day = String(value.getDate()).padStart(2, '0');
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const year = value.getFullYear();
      return `${day}-${month}-${year}`;
    }
  },
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 180 },
  { field: 'amount', headerName: 'Montante', type: 'number', width: 120, align: 'right', headerAlign: 'right', valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'currency', headerName: 'Moeda', width: 90 },
  { field: 'exchange_rate', headerName: 'Taxa de câmbio', type: 'number', width: 120, align: 'right', headerAlign: 'right', valueFormatter: (value) => typeof value === 'number' ? value.toFixed(4) : '' },
  {
    field: 'amount_eur', headerName: 'Montante (€)', type: 'number', width: 130,
    headerAlign: 'right',
    align: 'right',
    renderCell: (params) => (
      <Box sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
        {params.value?.toFixed(2)}
      </Box>
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

    const relevantTxs = dividendTransactionsData.filter(tx =>
      tx.transaction_type === 'DIVIDEND' && tx.transaction_subtype !== 'TAX'
    );

    if (relevantTxs.length === 0) return emptyResult;

    const maxThickness = 60;
    const smallDataSetThreshold = 5;

    const productDividendMap = {};
    relevantTxs.forEach(tx => {
      if (tx.amount_eur != null) {
        const baseProduct = getBaseProductName(tx.product_name);
        productDividendMap[baseProduct] = (productDividendMap[baseProduct] || 0) + tx.amount_eur;
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
    chartItems.sort((a, b) => a.amount - b.amount);

    const productChart = {
      labels: chartItems.map(item => item.name),
      datasets: [{
        data: chartItems.map(item => item.amount),
        backgroundColor: 'rgba(88, 151, 92, 1)',
        borderColor: 'rgba(37, 98, 40, 1)',
        borderWidth: 1,
        borderRadius: 4,
        hoverBorderWidth: 2,
      }]
    };

    if (productChart.labels.length > 0 && productChart.labels.length <= smallDataSetThreshold) {
      productChart.datasets[0].maxBarThickness = maxThickness;
    }

    let timeSeriesChart;
    if (selectedYear === ALL_YEARS_OPTION) {
      const yearlyMap = {};
      relevantTxs.forEach(tx => {
        const year = getYearString(tx.date);
        if (year && tx.amount_eur != null) {
          yearlyMap[year] = (yearlyMap[year] || 0) + tx.amount_eur;
        }
      });
      const sortedYears = Object.keys(yearlyMap).sort((a, b) => a.localeCompare(b));
      timeSeriesChart = {
        labels: sortedYears,
        datasets: [{
          data: sortedYears.map(year => yearlyMap[year]),
          backgroundColor: 'rgba(88, 151, 92, 1)',
          borderColor: 'rgba(37, 98, 40, 1)',
          borderWidth: 1,
          borderRadius: 4,
          hoverBorderWidth: 2,
        }]
      };
    } else {
      const monthlyData = new Array(12).fill(0);
      const yearTxs = relevantTxs.filter(tx => getYearString(tx.date) === selectedYear);
      yearTxs.forEach(tx => {
        const monthIndex = getMonthIndex(tx.date);
        if (monthIndex !== null && tx.amount_eur != null) {
          monthlyData[monthIndex] += tx.amount_eur;
        }
      });
      timeSeriesChart = {
        labels: MONTH_NAMES_CHART,
        datasets: [{
          data: monthlyData,
          backgroundColor: 'rgba(88, 151, 92, 1)',
          borderColor: 'rgba(37, 98, 40, 1)',
          borderWidth: 1,
          borderRadius: 4,
          hoverBorderWidth: 2,
        }]
      };
    }

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
      title: {
        display: true,
        text: `Dividendo por produto`,
        font: { size: 16, weight: '600' },
        padding: { top: 10, bottom: 20 },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: (ctx) => `${formatCurrency(ctx.raw || 0)}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#e0e0e0', borderDash: [2, 4] },
        title: { display: true, text: 'Montante (€)' }
      },
      x: {
        grid: { display: false },
        title: { display: true, text: 'Produto' },
        ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 }
      }
    }
  }), []);

  const timeSeriesChartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: `Dividendo por ${selectedYear === ALL_YEARS_OPTION ? 'ano' : 'mês'}`,
        font: { size: 16, weight: '600' },
        padding: { top: 10, bottom: 20 },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: (ctx) => `${formatCurrency(ctx.raw || 0)}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#e0e0e0', borderDash: [2, 4] },
        title: { display: true, text: 'Montante (€)' }
      },
      x: {
        grid: { display: false },
        title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Ano' : 'Mês' }
      }
    }
  }), [selectedYear]);

  if (relevantDividendTransactions.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>Não existe informação disponível.</Typography>
      </Paper>
    );
  }

  const rows = relevantDividendTransactions.map((tx, index) => ({
    id: tx.id || `${tx.order_id}-${index}`,
    ...tx
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={6}>
            <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
              {timeSeriesChartData.labels.length > 0 ? (
                <Bar options={timeSeriesChartOptions} data={timeSeriesChartData} />
              ) : (
                <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', pt: '25%' }}>Não há dados para este período.</Typography>
              )}
            </Paper>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
            {productChartData.labels.length > 0 ? (
              <Bar options={productChartOptions} data={productChartData} />
            ) : (
              <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', pt: '25%' }}>Não há dados para este período.</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>


      <Box sx={{ width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          autoHeight
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
            sorting: {
              sortModel: [{ field: 'date', sort: 'desc' }],
            },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
        />
      </Box>
    </Paper>
  );
}