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

// Updated props: stockSaleDetails, optionSaleDetails, dividendTaxResultForChart
const OverallPLChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear }) => {
  const chartData = useMemo(() => {
    // Check if any data is present
    if ((!stockSaleDetails || stockSaleDetails.length === 0) &&
        (!optionSaleDetails || optionSaleDetails.length === 0) &&
        (!dividendTaxResultForChart || Object.keys(dividendTaxResultForChart).length === 0)) {
      return { labels: [], datasets: [] };
    }

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

    // Use the new prop dividendTaxResultForChart
    const dividendData = dividendTaxResultForChart || {};
    Object.entries(dividendData).forEach(([year, countries]) => {
      if (year) { // Year here is the key from dividendTaxResultForChart, e.g., "2023"
        allYearsInData.add(year); // Add string year
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

    if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== '') {
        const singleYearData = yearlyPL[selectedYear];
        if (!singleYearData) return { labels: [], datasets: []};

        return {
            labels: ['Stocks P/L', 'Options P/L', 'Dividends Net'],
            datasets: [{
                label: `P/L for ${selectedYear}`, // This label might not be shown if legend.display is false
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
            }]
        };
    }

    // For ALL_YEARS_OPTION
    const totalNetPLPerYear = sortedYears.map(year => yearlyPL[year]?.total || 0);
    const backgroundColors = totalNetPLPerYear.map(pl => pl >= 0 ? POSITIVE_COLOR_BG : NEGATIVE_COLOR_BG);
    const borderColors = totalNetPLPerYear.map(pl => pl >= 0 ? POSITIVE_COLOR_BORDER : NEGATIVE_COLOR_BORDER);

    return {
      labels: sortedYears,
      datasets: [{
        label: 'Total P/L (Stocks, Options, Dividends)',
        data: totalNetPLPerYear,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
      }]
    };
  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: selectedYear === ALL_YEARS_OPTION || selectedYear === '', // Only display legend for "All Years" view
        position: 'top'
      },
      title: {
        display: true,
        text: selectedYear === ALL_YEARS_OPTION || selectedYear === ''
            ? 'Overall P/L per Year (Stocks, Options, Dividends)'
            : `P/L Breakdown for ${selectedYear}`
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            let label = context.dataset.label || context.label || '';
            if (label && (selectedYear === ALL_YEARS_OPTION || selectedYear === '')) {
                 // For "All Years" view, the dataset label is fine.
            } else if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== ''){
                 // For specific year view, context.label is 'Stocks P/L', etc.
                 label = context.label || '';
            } else {
                label = ''; // Default empty if somehow no label
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
            text: selectedYear === ALL_YEARS_OPTION || selectedYear === '' ? 'Year' : 'Category'
        }
      },
      y: {
        beginAtZero: false, // Allow negative axis for losses
        title: { display: true, text: 'Profit/Loss (€)' }
      },
    },
  }), [selectedYear]);

  if (!chartData || chartData.datasets.length === 0 || !chartData.datasets.some(ds => ds.data && ds.data.length > 0 && ds.data.some(d => d !== undefined))) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">No P/L data to display for the selected period.</Typography>
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