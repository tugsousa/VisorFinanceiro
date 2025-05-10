// frontend/src/components/dashboardSections/OverallPLChart.js
import React, { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants';
import { getYearString } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const OverallPLChart = ({ allDashboardData, selectedYear }) => {
  const chartData = useMemo(() => {
    if (!allDashboardData) return { labels: [], datasets: [] };

    const yearlyPL = {}; // { "2023": { stocks: 100, options: 50, dividends: 20, total: 170 }, ... }
    const allYearsInData = new Set();

    // Process Stock Sales
    (allDashboardData.StockSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.SaleDate);
      if (year && sale.Delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].stocks += sale.Delta;
        yearlyPL[year].total += sale.Delta;
      }
    });

    // Process Option Sales
    (allDashboardData.OptionSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.close_date);
      if (year && sale.delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, total: 0 };
        yearlyPL[year].options += sale.delta;
        yearlyPL[year].total += sale.delta;
      }
    });

    // Process Dividends
    const dividendData = allDashboardData.DividendTaxResult || {};
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

    // If a specific year is selected, filter down to that year
    if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== '') {
        const singleYearData = yearlyPL[selectedYear];
        if (!singleYearData) return { labels: [], datasets: []};
        
        return {
            labels: ['Stocks P/L', 'Options P/L', 'Dividends Net'],
            datasets: [{
                label: `P/L for ${selectedYear}`,
                data: [singleYearData.stocks, singleYearData.options, singleYearData.dividends],
                backgroundColor: [
                    singleYearData.stocks >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)',
                    singleYearData.options >= 0 ? 'rgba(54, 162, 235, 0.6)' : 'rgba(255, 159, 64, 0.6)',
                    singleYearData.dividends >= 0 ? 'rgba(153, 102, 255, 0.6)' : 'rgba(255, 205, 86, 0.6)',
                ],
                borderColor: [
                    singleYearData.stocks >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)',
                    singleYearData.options >= 0 ? 'rgba(54, 162, 235, 1)' : 'rgba(255, 159, 64, 1)',
                    singleYearData.dividends >= 0 ? 'rgba(153, 102, 255, 1)' : 'rgba(255, 205, 86, 1)',
                ],
                borderWidth: 1,
            }]
        };
    }
    
    // "All Years" selected - show total P/L per year, colored by total >= 0
    const totalNetPLPerYear = sortedYears.map(year => yearlyPL[year]?.total || 0);
    const backgroundColors = totalNetPLPerYear.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)');
    const borderColors = totalNetPLPerYear.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)');

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
  }, [allDashboardData, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: selectedYear !== ALL_YEARS_OPTION && selectedYear !== '' ? false : true, // Show legend for "All Years" view
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
    return null; // Don't render if no data for the chart
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Overall Profit/Loss Overview
      </Typography>
      <Box sx={{ height: 350 }}> {/* Increased height slightly */}
        <Bar data={chartData} options={chartOptions} />
      </Box>
    </Paper>
  );
};

export default OverallPLChart;