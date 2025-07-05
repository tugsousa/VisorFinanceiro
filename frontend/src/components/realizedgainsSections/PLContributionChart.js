// frontend/src/components/realizedgainsSections/PLContributionChart.js
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { getYearString, getMonthIndex, extractYearsFromData } from '../../utils/dateUtils';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED, MONTH_NAMES_CHART } from '../../constants';
import { formatCurrency } from '../../utils/formatUtils';

const COLORS = {
  stocks: 'rgba(75, 192, 192, 0.85)',
  options: 'rgba(255, 205, 86, 0.85)',
  dividends: 'rgba(255, 159, 64, 0.85)',
};

// --- FIX: Add dividendTransactionsList to the component's props ---
const PLContributionChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, selectedYear }) => {
  const chartData = useMemo(() => {
    
    if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
      const years = extractYearsFromData({
          stockSales: stockSaleDetails,
          optionSales: optionSaleDetails,
          DividendTaxResult: dividendTaxResultForChart
      }, {
          stockSales: 'SaleDate',
          optionSales: 'close_date',
          DividendTaxResult: null 
      }).filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED).sort((a, b) => Number(a) - Number(b));

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
      // --- FIX: Logic for single-year (monthly) view now includes dividends ---
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
      
      // Calculate monthly dividend P/L from the individual transactions list
      (dividendTransactionsList || []).forEach(tx => {
        // Double-check year match, though filteredData should already handle this
        if (getYearString(tx.Date) === selectedYear) {
            const month = getMonthIndex(tx.Date);
            if (month !== null && tx.AmountEUR != null) {
                // Dividend tax transactions are negative, so simple addition calculates the net
                monthlyData[month].dividends += tx.AmountEUR;
            }
        }
      });

      return {
          labels: MONTH_NAMES_CHART,
          datasets: [
            { label: 'Stocks', data: monthlyData.map(d => d.stocks), backgroundColor: COLORS.stocks },
            { label: 'Options', data: monthlyData.map(d => d.options), backgroundColor: COLORS.options },
            { label: 'Dividends', data: monthlyData.map(d => d.dividends), backgroundColor: COLORS.dividends },
          ]
      }
    }
  // --- FIX: Add dividendTransactionsList to the dependency array ---
  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
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
        title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Year' : 'Month' },
      },
      y: {
        stacked: true,
        beginAtZero: false,
        title: { display: true, text: 'Profit/Loss (€)' },
      },
    },
  }), [selectedYear]);

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