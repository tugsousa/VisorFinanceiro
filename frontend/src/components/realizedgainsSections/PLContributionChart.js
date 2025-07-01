// frontend/src/components/realizedgainsSections/PLContributionChart.js
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
// NEW: Import monthly constants and date utils
import { getYearString, getMonthIndex, extractYearsFromData } from '../../utils/dateUtils';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED, MONTH_NAMES_CHART } from '../../constants';
import { formatCurrency } from '../../utils/formatUtils';

// Define consistent colors for each category
const COLORS = {
  stocks: 'rgba(75, 192, 192, 0.8)',
  options: 'rgba(153, 102, 255, 0.8)',
  dividends: 'rgba(255, 206, 86, 0.8)',
};

// NEW: The component now accepts selectedYear
const PLContributionChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear }) => {
  const chartData = useMemo(() => {
    
    // --- START: NEW DYNAMIC LOGIC ---
    if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
      // --- LOGIC FOR "ALL YEARS" VIEW ---
      const years = extractYearsFromData({
          stockSales: stockSaleDetails,
          optionSales: optionSaleDetails,
          DividendTaxResult: dividendTaxResultForChart
      }, {
          stockSales: 'SaleDate',
          optionSales: 'close_date',
          DividendTaxResult: null 
      }).filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED);

      if (years.length === 0) return { labels: [], datasets: [] };

      const yearlyData = {};
      years.forEach(year => {
        yearlyData[year] = { stocks: 0, options: 0, dividends: 0 };
      });

      stockSaleDetails.forEach(sale => {
        const year = getYearString(sale.SaleDate);
        if (year && yearlyData[year]) yearlyData[year].stocks += sale.Delta;
      });

      optionSaleDetails.forEach(sale => {
        const year = getYearString(sale.close_date);
        if (year && yearlyData[year]) yearlyData[year].options += sale.delta;
      });

      Object.entries(dividendTaxResultForChart).forEach(([year, countries]) => {
        if (yearlyData[year]) {
          let yearDividendNet = 0;
          Object.values(countries).forEach(countryData => {
            yearDividendNet += (countryData.gross_amt || 0) + (countryData.taxed_amt || 0);
          });
          yearlyData[year].dividends += yearDividendNet;
        }
      });
      
      return {
        labels: years,
        datasets: [
          { label: 'Stocks', data: years.map(year => yearlyData[year].stocks), backgroundColor: COLORS.stocks },
          { label: 'Options', data: years.map(year => yearlyData[year].options), backgroundColor: COLORS.options },
          { label: 'Dividends', data: years.map(year => yearlyData[year].dividends), backgroundColor: COLORS.dividends },
        ],
      };

    } else {
      // --- LOGIC FOR SINGLE-YEAR (MONTHLY) VIEW ---
      const monthlyData = Array(12).fill(null).map(() => ({ stocks: 0, options: 0, dividends: 0 }));

      stockSaleDetails.forEach(sale => {
        if (getYearString(sale.SaleDate) === selectedYear) {
            const month = getMonthIndex(sale.SaleDate);
            if (month !== null) monthlyData[month].stocks += sale.Delta;
        }
      });
      optionSaleDetails.forEach(sale => {
        if (getYearString(sale.close_date) === selectedYear) {
            const month = getMonthIndex(sale.close_date);
            if (month !== null) monthlyData[month].options += sale.delta;
        }
      });
      const dividendYearData = dividendTaxResultForChart[selectedYear] || {};
      Object.values(dividendYearData).forEach(countryData => {
         // This is yearly data, so we can't break it down monthly from this source.
         // If you had individual dividend transactions, you could. For now, we omit it from monthly.
         // Or, for simplicity, we can just not show dividends in the monthly drill-down.
      });

      return {
          labels: MONTH_NAMES_CHART,
          datasets: [
            { label: 'Stocks', data: monthlyData.map(d => d.stocks), backgroundColor: COLORS.stocks },
            { label: 'Options', data: monthlyData.map(d => d.options), backgroundColor: COLORS.options },
            // Not including dividends as we only have yearly summary for them
          ]
      }
    }
    // --- END: NEW DYNAMIC LOGIC ---

  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        // NEW: Dynamic title
        text: selectedYear === ALL_YEARS_OPTION 
              ? 'Annual P/L Contribution by Category' 
              : `Monthly P/L Contribution for ${selectedYear}`,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            return `${label}: ${formatCurrency(context.raw)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        // NEW: Dynamic axis label
        title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Year' : 'Month' },
      },
      y: {
        stacked: true,
        beginAtZero: false,
        title: { display: true, text: 'Profit/Loss (€)' },
      },
    },
  }), [selectedYear]); // NEW: Dependency on selectedYear

  if (!chartData || chartData.labels.length === 0) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
            <Typography color="text.secondary">No data for P/L Contribution Chart.</Typography>
        </Box>
    );
  }

  return <Bar options={chartOptions} data={chartData} />;
};

export default PLContributionChart;