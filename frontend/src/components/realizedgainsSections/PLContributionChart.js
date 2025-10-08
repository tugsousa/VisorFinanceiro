// frontend/src/components/realizedgainsSections/PLContributionChart.js
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { getYearString, getMonthIndex, extractYearsFromData } from '../../utils/dateUtils';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED, MONTH_NAMES_CHART } from '../../constants';
import { formatCurrency } from '../../utils/formatUtils';


const COLORS = {
  stocks: 'rgba(46, 125, 50, 0.9)',    // '#2E7D32' - Classic Green
  options: 'rgba(0, 121, 107, 0.9)',    // '#00796b' - Rich Teal
  dividends: 'rgba(141, 209, 144, 0.9)', // '#66BB6A' - Lighter Green
  fees: 'rgba(210, 91, 91, 0.9)',
};

const BORDER_COLORS = {
    stocks: 'rgba(46, 125, 50, 1)',
    options: 'rgba(0, 121, 107, 1)',
    dividends: 'rgba(141, 209, 144, 1)',
    fees: 'rgba(210, 42, 42, 1)',
};

const createDataset = (label, data, color, borderColor) => ({
  label,
  data,
  backgroundColor: color,
  borderColor: borderColor,
  borderWidth: 1,
  borderRadius: (context) => {
    const { chart, dataIndex, datasetIndex } = context;
    const { datasets } = chart.data;
    const currentValue = datasets[datasetIndex].data[dataIndex];

    if (!currentValue) return 0;

    let lastPositiveDatasetIndex = -1;
    let lastNegativeDatasetIndex = -1;

    for (let i = 0; i < datasets.length; i++) {
      const value = datasets[i].data[dataIndex];
      if (value > 0) {
        lastPositiveDatasetIndex = i;
      } else if (value < 0) {
        lastNegativeDatasetIndex = i;
      }
    }

    const radius = 4;

    if (currentValue > 0 && datasetIndex === lastPositiveDatasetIndex) {
      return { topRight: radius, topLeft: radius };
    }
    if (currentValue < 0 && datasetIndex === lastNegativeDatasetIndex) {
      return { bottomRight: radius, bottomLeft: radius };
    }
    
    return 0;
  },
});


const PLContributionChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, feesData, selectedYear }) => {
  const chartData = useMemo(() => {
    // FIX: Garantir que todas as props são pelo menos coleções vazias para evitar o erro 'can't convert undefined to object'
    const safeStockSales = stockSaleDetails || [];
    const safeOptionSales = optionSaleDetails || [];
    const safeDividendSummary = dividendTaxResultForChart || {};
    const safeFeesData = feesData || [];
    const safeDividendTxs = dividendTransactionsList || [];
    
    const maxThickness = 60;
    const smallDataSetThreshold = 5;
    let finalChartData;

    if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
      // Usar as coleções seguras aqui
      const years = extractYearsFromData({ stockSales: safeStockSales, optionSales: safeOptionSales, DividendTaxResult: safeDividendSummary, fees: safeFeesData }, { stockSales: 'SaleDate', optionSales: 'close_date', DividendTaxResult: null, fees: 'date' }).filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED).sort((a, b) => Number(a) - Number(b));
      if (years.length === 0) return { labels: [], datasets: [] };

      const yearlyData = {};
      years.forEach(year => { yearlyData[year] = { stocks: 0, options: 0, dividends: 0, fees: 0 }; });
      
      safeStockSales.forEach(sale => { const year = getYearString(sale.SaleDate); if (year && yearlyData[year]) yearlyData[year].stocks += sale.Delta; });
      safeOptionSales.forEach(sale => { const year = getYearString(sale.close_date); if (year && yearlyData[year]) yearlyData[year].options += sale.delta; });
      
      Object.entries(safeDividendSummary).forEach(([year, countries]) => {
        if (yearlyData[year]) {
          let gross = 0;
          Object.values(countries).forEach(d => {
            gross += (d.gross_amt || 0);
          });
          yearlyData[year].dividends += gross;
        }
      });
      
      safeFeesData.forEach(fee => { const year = getYearString(fee.date); if (year && yearlyData[year]) yearlyData[year].fees += fee.amount_eur; });

      finalChartData = {
        labels: years,
        datasets: [
          createDataset('Acções', years.map(year => yearlyData[year].stocks), COLORS.stocks, BORDER_COLORS.stocks),
          createDataset('Opções', years.map(year => yearlyData[year].options), COLORS.options, BORDER_COLORS.options),
          createDataset('Dividendos', years.map(year => yearlyData[year].dividends), COLORS.dividends, BORDER_COLORS.dividends),
          createDataset('Taxas e Comissões', years.map(year => yearlyData[year].fees), COLORS.fees, BORDER_COLORS.fees),
        ],
      };
    } else {
      const monthlyData = Array(12).fill(null).map(() => ({ stocks: 0, options: 0, dividends: 0, fees: 0 }));
      
      // Usar as coleções seguras aqui
      safeStockSales.forEach(sale => { if (getYearString(sale.SaleDate) === selectedYear) { const month = getMonthIndex(sale.SaleDate); if (month !== null) monthlyData[month].stocks += sale.Delta; } });
      safeOptionSales.forEach(sale => { if (getYearString(sale.close_date) === selectedYear) { const month = getMonthIndex(sale.close_date); if (month !== null) monthlyData[month].options += sale.delta; } });
      
      safeDividendTxs.forEach(tx => {
        if (getYearString(tx.date) === selectedYear && tx.transaction_subtype !== 'TAX') {
          const month = getMonthIndex(tx.date);
          if (month !== null && tx.amount_eur != null) {
            monthlyData[month].dividends += tx.amount_eur;
          }
        }
      });
      
      safeFeesData.forEach(fee => { if (getYearString(fee.date) === selectedYear) { const month = getMonthIndex(fee.date); if (month !== null) monthlyData[month].fees += fee.amount_eur; } });

      finalChartData = {
        labels: MONTH_NAMES_CHART,
        datasets: [
          createDataset('Acções', monthlyData.map(d => d.stocks), COLORS.stocks, BORDER_COLORS.stocks),
          createDataset('Opções', monthlyData.map(d => d.options), COLORS.options, BORDER_COLORS.options),
          createDataset('Dividendos', monthlyData.map(d => d.dividends), COLORS.dividends, BORDER_COLORS.dividends),
          createDataset('Taxas e Comissões', monthlyData.map(d => d.fees), COLORS.fees, BORDER_COLORS.fees),
        ]
      };
    }

    if (finalChartData.labels.length > 0 && finalChartData.labels.length <= smallDataSetThreshold) {
        finalChartData.datasets.forEach(dataset => {
            dataset.maxBarThickness = maxThickness;
        });
    }

    return finalChartData;

  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, feesData, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: selectedYear === ALL_YEARS_OPTION ? 'Contribuição Anual de L/P por Categoria' : `Contribuição Mensal de L/P para ${selectedYear}`,
        font: { size: 16, weight: '600' },
        padding: { top: 10, bottom: 20 }
      },
      legend: {
        position: 'top',
        labels: { usePointStyle: true, boxWidth: 8 },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 6,
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => ` ${context.dataset.label}: ${formatCurrency(context.raw)}`,
          footer: (tooltipItems) => {
            let total = tooltipItems.reduce((sum, item) => sum + item.raw, 0);
            return `Total: ${formatCurrency(total)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Ano' : 'Mês' },
      },
      y: {
        stacked: true,
        beginAtZero: false,
        grid: { color: '#e0e0e0', borderDash: [2, 4] },
        title: { display: true, text: 'Lucro/Prejuízo (€)' },
      },
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
  }), [selectedYear]);

  if (!chartData || chartData.labels.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">Sem dados para o gráfico de contribuição de lucro/prejuízo.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Bar options={chartOptions} data={chartData} />
    </Box>
  );
};

export default PLContributionChart;