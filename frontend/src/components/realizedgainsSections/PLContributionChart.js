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

const PLContributionChart = ({ stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, selectedYear }) => {
  const chartData = useMemo(() => {
    
    const maxThickness = 60;
    const smallDataSetThreshold = 5;

    if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
      const years = extractYearsFromData({
          stockSales: stockSaleDetails,
          optionSales: optionSaleDetails,
          DividendTaxResult: dividendTaxResultForChart
      }, {
          stockSales: 'SaleDate', // CORRECTED
          optionSales: 'close_date',
          DividendTaxResult: null 
      }).filter(y => y && y !== ALL_YEARS_OPTION && y !== NO_YEAR_SELECTED).sort((a, b) => Number(a) - Number(b));

      if (years.length === 0) return { labels: [], datasets: [] };

      const yearlyData = {};
      years.forEach(year => {
        yearlyData[year] = { stocks: 0, options: 0, dividends: 0 };
      });

      stockSaleDetails.forEach(sale => {
        const year = getYearString(sale.SaleDate); // CORRECTED
        if (year && yearlyData[year]) yearlyData[year].stocks += sale.Delta; // CORRECTED
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

      const datasets = [
        { label: 'Acções', data: years.map(year => yearlyData[year].stocks), backgroundColor: COLORS.stocks },
        { label: 'Opções', data: years.map(year => yearlyData[year].options), backgroundColor: COLORS.options },
        { label: 'Dividendos', data: years.map(year => yearlyData[year].dividends), backgroundColor: COLORS.dividends },
      ];
      
      if (years.length > 0 && years.length <= smallDataSetThreshold) {
          datasets.forEach(ds => {
              ds.maxBarThickness = maxThickness;
          });
      }

      return {
        labels: years,
        datasets: datasets,
      };

    } else {
      const monthlyData = Array(12).fill(null).map(() => ({ stocks: 0, options: 0, dividends: 0 }));

      stockSaleDetails.forEach(sale => {
        if (getYearString(sale.SaleDate) === selectedYear) { // CORRECTED
            const month = getMonthIndex(sale.SaleDate); // CORRECTED
            if (month !== null) monthlyData[month].stocks += sale.Delta; // CORRECTED
        }
      });
      optionSaleDetails.forEach(sale => {
        if (getYearString(sale.close_date) === selectedYear) {
            const month = getMonthIndex(sale.close_date);
            if (month !== null) monthlyData[month].options += sale.delta;
        }
      });
      
      (dividendTransactionsList || []).forEach(tx => {
        if (getYearString(tx.date) === selectedYear) {
            const month = getMonthIndex(tx.date);
            if (month !== null && tx.amount_eur != null) {
                monthlyData[month].dividends += tx.amount_eur;
            }
        }
      });

      return {
          labels: MONTH_NAMES_CHART,
          datasets: [
            { label: 'Acções', data: monthlyData.map(d => d.stocks), backgroundColor: COLORS.stocks },
            { label: 'Opções', data: monthlyData.map(d => d.options), backgroundColor: COLORS.options },
            { label: 'Dividendos', data: monthlyData.map(d => d.dividends), backgroundColor: COLORS.dividends },
          ]
      }
    }
  }, [stockSaleDetails, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: selectedYear === ALL_YEARS_OPTION 
              ? 'Contribuição Anual de Lucro/Prejuízo por Categoria' 
              : `Contribuição Mensal de Lucro/Prejuízo para ${selectedYear}`,
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
        title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Ano' : 'Mês' },
      },
      y: {
        stacked: true,
        beginAtZero: false,
        title: { display: true, text: 'Lucro/Prejuízo (€)' },
      },
    },
  }), [selectedYear]);

  if (!chartData || chartData.labels.length === 0) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
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