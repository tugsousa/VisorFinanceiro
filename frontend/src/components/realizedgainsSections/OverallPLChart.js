// frontend/src/components/realizedgainsSections/OverallPLChart.js
import React, { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants';
import { getYearString } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const POSITIVE_COLOR_BG = 'rgba(75, 192, 192, 0.6)'; // Greenish
const NEGATIVE_COLOR_BG = 'rgba(255, 99, 132, 0.6)'; // Reddish
const POSITIVE_COLOR_BORDER = 'rgba(75, 192, 192, 1)';
const NEGATIVE_COLOR_BORDER = 'rgba(255, 99, 132, 1)';

const OverallPLChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear }) => {
  const chartData = useMemo(() => {
    if ((!stockSaleDetails || stockSaleDetails.length === 0) &&
        (!optionSaleDetails || optionSaleDetails.length === 0) &&
        (!dividendTaxResultForChart || Object.keys(dividendTaxResultForChart).length === 0)) {
      return { labels: [], datasets: [] };
    }

    const yearlyPL = {};
    const allYearsInData = new Set();

    (stockSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.SaleDate); // CORRECTED
      if (year && sale.Delta != null) { // CORRECTED
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].stocks += sale.Delta; // CORRECTED
        yearlyPL[year].total += sale.Delta; // CORRECTED
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

    if (sortedYears.length === 0) return { labels: [], datasets: []};

    const maxThickness = 60;
    const smallDataSetThreshold = 5;

    if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== '') {
        const singleYearData = yearlyPL[selectedYear];
        if (!singleYearData) return { labels: [], datasets: []};

        const dataset = {
            label: `L/P para ${selectedYear}`,
            data: [singleYearData.stocks, singleYearData.options, singleYearData.dividends],
            backgroundColor: [
                singleYearData.stocks >= 0 ? POSITIVE_COLOR_BG : NEGATIVE_COLOR_BG,
                singleYearData.options >= 0 ? POSITIVE_COLOR_BG : NEGATIVE_COLOR_BG,
                singleYearData.dividends >= 0 ? POSITIVE_COLOR_BG : NEGATIVE_COLOR_BG,
            ],
            borderColor: [
                singleYearData.stocks >= 0 ? POSITIVE_COLOR_BORDER : NEGATIVE_COLOR_BORDER,
                singleYearData.options >= 0 ? POSITIVE_COLOR_BORDER : NEGATIVE_COLOR_BORDER,
                singleYearData.dividends >= 0 ? POSITIVE_COLOR_BORDER : NEGATIVE_COLOR_BORDER,
            ],
            borderWidth: 1,
            maxBarThickness: maxThickness,
        };
        
        return {
            labels: ['L/P de Ações', 'L/P de Opções', 'Dividendos'],
            datasets: [dataset]
        };
    }

    const totalNetPLPerYear = sortedYears.map(year => yearlyPL[year]?.total || 0);
    const backgroundColors = totalNetPLPerYear.map(pl => pl >= 0 ? POSITIVE_COLOR_BG : NEGATIVE_COLOR_BG);
    const borderColors = totalNetPLPerYear.map(pl => pl >= 0 ? POSITIVE_COLOR_BORDER : NEGATIVE_COLOR_BORDER);

    const yearlyDataset = {
      label: 'Lucro/Prejuízo Total (Ações, Opções, Dividendos)',
      data: totalNetPLPerYear,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 1,
    };

    if (sortedYears.length > 0 && sortedYears.length <= smallDataSetThreshold) {
      yearlyDataset.maxBarThickness = maxThickness;
    }

    return {
      labels: sortedYears,
      datasets: [yearlyDataset]
    };
  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: selectedYear === ALL_YEARS_OPTION || selectedYear === '',
        position: 'top'
      },
      title: {
        display: true,
        text: selectedYear === ALL_YEARS_OPTION || selectedYear === ''
            ? 'Lucro/Prejuízo Global por Ano (Ações, Opções, Dividendos)'
            : `Detalhe de L/P para ${selectedYear}`
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            let label = context.dataset.label || context.label || '';
            if (label && (selectedYear === ALL_YEARS_OPTION || selectedYear === '')) {
            } else if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== ''){
                 label = context.label || '';
            } else {
                label = '';
            }

            if (label) {
              label += ': ';
            }
            label += formatCurrency(context.parsed.y);
            return label;
          }
        }
      },
    },
    scales: {
      x: {
        title: {
            display: true,
            text: selectedYear === ALL_YEARS_OPTION || selectedYear === '' ? 'Ano' : 'Categoria'
        }
      },
      y: {
        beginAtZero: false,
        title: { display: true, text: 'Lucro/Prejuízo (€)' }
      },
    },
  }), [selectedYear]);

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