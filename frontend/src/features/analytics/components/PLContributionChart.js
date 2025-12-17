import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { getYearString, getMonthIndex, extractYearsFromData } from '../../../lib/utils/dateUtils';
import { ALL_YEARS_OPTION, NO_YEAR_SELECTED, MONTH_NAMES_CHART } from '../../../constants';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const COLORS = {
  stocks: 'rgba(46, 125, 50, 0.9)',
  options: 'rgba(0, 121, 107, 0.9)',
  dividends: 'rgba(141, 209, 144, 0.9)',
  fees: 'rgba(210, 91, 91, 0.9)',
};

const BORDER_COLORS = {
  stocks: 'rgba(46, 125, 50, 1)',
  options: 'rgba(0, 121, 107, 1)',
  dividends: 'rgba(141, 209, 144, 1)',
  fees: 'rgba(210, 91, 91, 1)',
};

// Adicionado optionSalesData às props
const PLContributionChart = ({ stockSaleDetails, optionSaleDetails, optionSalesData, dividendTaxResultForChart, dividendTransactionsList, feesData, selectedYear }) => {
  const chartData = useMemo(() => {
    
    // Normalização: Usa optionSalesData se existir, senão tenta optionSaleDetails
    const finalOptionSales = optionSalesData || optionSaleDetails || [];

    let finalChartData = { labels: [], datasets: [] };
    const maxThickness = 50;
    const smallDataSetThreshold = 6;

    const createDataset = (label, data, bgColor, borderColor) => ({
      label,
      data,
      backgroundColor: bgColor,
      borderColor: borderColor,
      borderWidth: 1,
      stack: 'Stack 0',
    });

    if (selectedYear === ALL_YEARS_OPTION || selectedYear === NO_YEAR_SELECTED) {
      const allYears = extractYearsFromData({
        stockSales: stockSaleDetails,
        optionSales: finalOptionSales, // Usa a lista correta
        DividendTaxResult: dividendTaxResultForChart
      }, {
        stockSales: 'SaleDate',
        optionSales: 'close_date', // Assume minúsculo, mas o getYearString trata se a prop existir
        DividendTaxResult: null
      });
      
      (feesData || []).forEach(f => {
          const y = getYearString(f.date);
          if (y && !allYears.includes(y)) allYears.push(y);
      });
      
      const sortedYears = allYears.sort();
      const yearlyData = {};
      sortedYears.forEach(year => {
        yearlyData[year] = { stocks: 0, options: 0, dividends: 0, fees: 0 };
      });

      (stockSaleDetails || []).forEach(sale => {
        const year = getYearString(sale.SaleDate);
        if (year && yearlyData[year]) yearlyData[year].stocks += Number(sale.Delta || 0);
      });

      // Opções
      finalOptionSales.forEach(sale => {
        const rawDate = sale.close_date || sale.CloseDate || sale.date;
        const rawDelta = sale.delta !== undefined ? sale.delta : sale.Delta;
        
        const year = getYearString(rawDate);
        if (year && yearlyData[year]) {
          yearlyData[year].options += Number(rawDelta || 0);
        }
      });

      if (dividendTaxResultForChart) {
        Object.entries(dividendTaxResultForChart).forEach(([year, countries]) => {
          if (yearlyData[year]) {
            let total = 0;
            Object.values(countries).forEach(c => total += Number(c.gross_amt || 0));
            yearlyData[year].dividends += total;
          }
        });
      }

      (feesData || []).forEach(fee => {
        const year = getYearString(fee.date);
        if (year && yearlyData[year]) {
          yearlyData[year].fees += Number(fee.amount_eur || 0);
        }
      });

      finalChartData = {
        labels: sortedYears,
        datasets: [
          createDataset('Acções', sortedYears.map(y => yearlyData[y].stocks), COLORS.stocks, BORDER_COLORS.stocks),
          createDataset('Opções', sortedYears.map(y => yearlyData[y].options), COLORS.options, BORDER_COLORS.options),
          createDataset('Dividendos', sortedYears.map(y => yearlyData[y].dividends), COLORS.dividends, BORDER_COLORS.dividends),
          createDataset('Taxas e Comissões', sortedYears.map(y => yearlyData[y].fees), COLORS.fees, BORDER_COLORS.fees),
        ]
      };

    } else {
      // VISTA MENSAL
      const monthlyData = Array(12).fill(null).map(() => ({ stocks: 0, options: 0, dividends: 0, fees: 0 }));

      (stockSaleDetails || []).forEach(sale => {
        if (getYearString(sale.SaleDate) === selectedYear) {
          const month = getMonthIndex(sale.SaleDate);
          if (month !== null) monthlyData[month].stocks += Number(sale.Delta || 0);
        }
      });

      // Opções
      finalOptionSales.forEach(sale => {
        const rawDate = sale.close_date || sale.CloseDate || sale.date;
        const rawDelta = sale.delta !== undefined ? sale.delta : sale.Delta;

        if (getYearString(rawDate) === selectedYear) {
          const month = getMonthIndex(rawDate);
          if (month !== null) {
             monthlyData[month].options += Number(rawDelta || 0);
          }
        }
      });

      (dividendTransactionsList || []).forEach(tx => {
        if (getYearString(tx.date) === selectedYear && tx.transaction_type === 'DIVIDEND' && tx.transaction_subtype !== 'TAX') {
          const month = getMonthIndex(tx.date);
          if (month !== null) monthlyData[month].dividends += Number(tx.amount_eur || 0);
        }
      });

      (feesData || []).forEach(fee => {
        if (getYearString(fee.date) === selectedYear) {
          const month = getMonthIndex(fee.date);
          if (month !== null) monthlyData[month].fees += Number(fee.amount_eur || 0);
        }
      });

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
  }, [stockSaleDetails, optionSalesData, optionSaleDetails, dividendTaxResultForChart, dividendTransactionsList, feesData, selectedYear]);

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
        <Typography variant="body2" color="text.secondary">Sem dados de contribuição para mostrar.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Bar data={chartData} options={chartOptions} />
    </Box>
  );
};

export default PLContributionChart;