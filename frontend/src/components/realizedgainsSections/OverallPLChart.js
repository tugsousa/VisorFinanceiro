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

const OverallPLChart = ({ allRealizedGainsData, selectedYear }) => {
  const chartData = useMemo(() => {
    if (!allRealizedGainsData) return { labels: [], datasets: [] };

    const yearlyPL = {}; 
    const allYearsInData = new Set();

    (allRealizedGainsData.StockSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.SaleDate);
      if (year && sale.Delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].stocks += sale.Delta;
        yearlyPL[year].total += sale.Delta;
      }
    });

    (allRealizedGainsData.OptionSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.close_date);
      if (year && sale.delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].options += sale.delta;
        yearlyPL[year].total += sale.delta;
      }
    });

    const dividendData = allRealizedGainsData.DividendTaxResult || {};
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

    if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== '') {
        const singleYearData = yearlyPL[selectedYear];
        if (!singleYearData) return { labels: [], datasets: []};
        
        return {
            labels: ['Stocks P/L', 'Options P/L', 'Dividends Net'],
            datasets: [{
                label: `P/L for ${selectedYear}`,
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
  }, [allRealizedGainsData, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: selectedYear !== ALL_YEARS_OPTION && selectedYear !== '' ? false : true, 
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
        beginAtZero: false, 
        title: { display: true, text: 'Profit/Loss (€)' } 
      },
    },
  }), [selectedYear]);

  if (!chartData || chartData.datasets.length === 0 || !chartData.datasets.some(ds => ds.data.some(d => d !== 0 && d !== undefined))) {
    return null; 
  }

  return (
    // Changed elevation to 0
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}> 
      <Typography variant="h6" gutterBottom>
        Overall Profit/Loss Overview
      </Typography>
      <Box sx={{ height: 350 }}> 
        <Bar data={chartData} options={chartOptions} />
      </Box>
    </Paper>
  );
};

export default OverallPLChart;