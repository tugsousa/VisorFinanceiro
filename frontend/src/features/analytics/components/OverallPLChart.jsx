import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { ALL_YEARS_OPTION } from '../../../constants';
import { getYearString } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Adicionado optionSalesData às props
const OverallPLChart = ({ stockSaleDetails, optionSaleDetails, optionSalesData, dividendTaxResultForChart, feesData, selectedYear }) => {
  const { chartData, yearlyPLDataForTooltip } = useMemo(() => {
    
    // Normalização: Usa optionSalesData se existir, senão tenta optionSaleDetails
    const finalOptionSales = optionSalesData || optionSaleDetails || [];

    const yearlyPL = {};
    const allYearsInData = new Set();

    // 1. Ações (Stocks)
    (stockSaleDetails || []).forEach(sale => {
      const year = getYearString(sale.SaleDate);
      if (year && sale.Delta != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, fees: 0, total: 0 };
        // Conversão explícita
        const val = Number(sale.Delta);
        yearlyPL[year].stocks += val;
        yearlyPL[year].total += val;
      }
    });

    // 2. Opções (Options) - Agora usa finalOptionSales
    finalOptionSales.forEach(sale => {
      // Verifica vários formatos de data possíveis
      const rawDate = sale.close_date || sale.CloseDate || sale.date;
      const year = getYearString(rawDate);
      
      // Verifica vários formatos de valor possíveis
      const rawDelta = sale.delta !== undefined ? sale.delta : sale.Delta;

      if (year) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, fees: 0, total: 0 };
        
        // Forçar conversão para Number
        const val = Number(rawDelta || 0);
        
        yearlyPL[year].options += val;
        yearlyPL[year].total += val;
      }
    });

    // 3. Dividendos
    const dividendData = dividendTaxResultForChart || {};
    Object.entries(dividendData).forEach(([year, countries]) => {
      if (year) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, fees: 0, total: 0 };
        
        let yearDividendGross = 0;
        Object.values(countries).forEach(countryData => {
          yearDividendGross += Number(countryData.gross_amt || 0);
        });
        
        yearlyPL[year].dividends += yearDividendGross;
        yearlyPL[year].total += yearDividendGross;
      }
    });

    // 4. Taxas e Comissões (Fees)
    (feesData || []).forEach(fee => {
      const year = getYearString(fee.date);
      if (year && fee.amount_eur != null) {
        allYearsInData.add(year);
        if (!yearlyPL[year]) yearlyPL[year] = { stocks: 0, options: 0, dividends: 0, fees: 0, total: 0 };
        
        const val = Number(fee.amount_eur);
        yearlyPL[year].fees += val;
        yearlyPL[year].total += val;
      }
    });

    const sortedYears = Array.from(allYearsInData).sort((a, b) => a.localeCompare(b));

    if (sortedYears.length === 0) return { chartData: { labels: [], datasets: [] }, yearlyPLDataForTooltip: {} };

    const maxThickness = 60;
    const smallDataSetThreshold = 5;

    const generateDataset = (data) => ({
      data: data,
      backgroundColor: context => context.raw >= 0 ? 'rgba(88, 151, 92, 1)' : 'rgba(210, 91, 91, 1)',
      borderColor: context => context.raw >= 0 ? 'rgba(37, 98, 40, 1)' : 'rgba(210, 42, 42, 1)',
      borderWidth: 1,
      borderRadius: 4,
      hoverBorderWidth: 2,
    });

    // Lógica de visualização para Ano Específico vs Tudo
    if (selectedYear !== ALL_YEARS_OPTION && selectedYear !== '') {
      const singleYearData = yearlyPL[selectedYear];
      if (!singleYearData) return { chartData: { labels: [], datasets: [] }, yearlyPLDataForTooltip: {} };

      const labels = ['Resultado Ações', 'Resultado Opções', 'Dividendos', 'Taxas e Comissões'];
      const dataset = generateDataset([
        singleYearData.stocks,
        singleYearData.options,
        singleYearData.dividends,
        singleYearData.fees
      ]);
      dataset.label = `L/P para ${selectedYear}`;
      
      if (labels.length <= smallDataSetThreshold) {
        dataset.maxBarThickness = maxThickness;
      }

      return {
        chartData: { labels: labels, datasets: [dataset] },
        yearlyPLDataForTooltip: yearlyPL,
      };
    }

    // Visualização "Tudo" (Evolução Anual)
    const totalNetPLPerYear = sortedYears.map(year => yearlyPL[year]?.total || 0);
    const yearlyDataset = generateDataset(totalNetPLPerYear);
    yearlyDataset.label = 'Lucro/Prejuízo Total';

    if (sortedYears.length > 0 && sortedYears.length <= smallDataSetThreshold) {
      yearlyDataset.maxBarThickness = maxThickness;
    }

    return {
      chartData: { labels: sortedYears, datasets: [yearlyDataset] },
      yearlyPLDataForTooltip: yearlyPL,
    };

  }, [stockSaleDetails, optionSalesData, optionSaleDetails, dividendTaxResultForChart, feesData, selectedYear]);

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
                ``, 
                ` Ações: ${formatCurrency(yearData.stocks)}`,
                ` Opções: ${formatCurrency(yearData.options)}`,
                ` Dividendos: ${formatCurrency(yearData.dividends)}`,
                ` Taxas: ${formatCurrency(yearData.fees)}`,
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
        beginAtZero: true,
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