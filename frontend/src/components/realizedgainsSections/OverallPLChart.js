// frontend/src/components/realizedgainsSections/OverallPLChart.js
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants';
import { getYearString } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Helper function to create a gradient for the bar fills
const createGradient = (ctx, chartArea, isPositive) => {
  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  if (isPositive) {
    gradient.addColorStop(0, 'rgba(75, 192, 192, 0.4)');
    gradient.addColorStop(1, 'rgba(75, 192, 192, 0.8)');
  } else {
    gradient.addColorStop(0, 'rgba(255, 99, 132, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 99, 132, 0.8)');
  }
  return gradient;
};

const OverallPLChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear }) => {
  const { chartData, yearlyPLDataForTooltip } = useMemo(() => {
    const yearlyPL = {};
    const allYearsInData = new Set();

    (stockSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.SaleDate);
      if (year && sale.Delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].stocks += sale.Delta;
        yearlyPL[year].total += sale.Delta;
      }
    });

    (optionSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.close_date);
      if (year && sale.delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].options += sale.delta;
        yearlyPL[year].total += sale.delta;
      }
    });

    const dividendData = dividendTaxResultForChart || {};
    Object.entries(dividendData).forEach(([year, countries]) => {
      if (year) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        let yearDividendNet = 0;
        Object.values(countries).forEach(countryData => {
          yearDividendNet += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
        });
        yearlyPL[year].dividends += yearDividendNet;
        yearlyPL[year].total += yearDividendNet;
      }
    });

    const sortedYears = Array.from(allYearsInData).sort((a, b) => a.localeCompare(b));
    if (sortedYears.length === 0) return { chartData: { labels: [], datasets: [] }, yearlyPLDataForTooltip: {} };

    const generateDataset = (data) => ({
      data: data,
      backgroundColor: context => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return 'rgba(0,0,0,0.1)';
        const isPositive = context.raw >= 0;
        return createGradient(ctx, chartArea, isPositive);
      },
      borderColor: context => context.raw >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)',
      borderWidth: 1,
      borderRadius: 4,
      hoverBorderWidth: 2,
    });

    if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== '') {
      const singleYearData = yearlyPL[selectedYear];
      if (!singleYearData) return { chartData: { labels: [], datasets: [] }, yearlyPLDataForTooltip: {} };
      const dataset = generateDataset([singleYearData.stocks, singleYearData.options, singleYearData.dividends]);
      dataset.label = `L/P para ${selectedYear}`;
      return {
        chartData: { labels: ['L/P de Ações', 'L/P de Opções', 'Dividendos'], datasets: [dataset] },
        yearlyPLDataForTooltip: yearlyPL,
      };
    }

    const totalNetPLPerYear = sortedYears.map(year => yearlyPL[year]?.total || 0);
    const yearlyDataset = generateDataset(totalNetPLPerYear);
    yearlyDataset.label = 'Lucro/Prejuízo Total';
    return {
      chartData: { labels: sortedYears, datasets: [yearlyDataset] },
      yearlyPLDataForTooltip: yearlyPL,
    };
  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: selectedYear === ALL_YEARS_OPTION || selectedYear === '' ? 'Lucro/Prejuízo Global Anual' : `Detalhe de L/P para ${selectedYear}`,
        font: { size: 16, weight: '600' },
        padding: { top: 10, bottom: 20 },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          title: (context) => context[0].label,
          label: (context) => {
            const year = context.label;
            const isAllYearsView = selectedYear === ALL_YEARS_OPTION || selectedYear === '';
            if (isAllYearsView && yearlyPLDataForTooltip[year]) {
              const yearData = yearlyPLDataForTooltip[year];
              return [
                `Total: ${formatCurrency(yearData.total)}`,
                ``, // Spacer
                `  Ações: ${formatCurrency(yearData.stocks)}`,
                `  Opções: ${formatCurrency(yearData.options)}`,
                `  Dividendos: ${formatCurrency(yearData.dividends)}`,
              ];
            }
            return `Valor: ${formatCurrency(context.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        title: {
          display: true,
          text: selectedYear === ALL_YEARS_OPTION || selectedYear === '' ? 'Ano' : 'Categoria',
        },
      },
      y: {
        beginAtZero: false,
        grid: { color: '#e0e0e0', borderDash: [2, 4] },
        title: { display: true, text: 'Lucro/Prejuízo (€)' },
      },
    },
  }), [selectedYear, yearlyPLDataForTooltip]);

  if (!chartData || chartData.datasets.length === 0 || !chartData.datasets.some(ds => ds.data && ds.data.length > 0 && ds.data.some(d => d !== undefined))) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">Sem dados de lucro/prejuízo para mostrar no período selecionado.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Bar data={chartData} options={chartOptions} />
    </Box>
  );
};

export default OverallPLChart;