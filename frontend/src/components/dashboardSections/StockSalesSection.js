// frontend/src/components/dashboardSections/StockSalesSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box
} from '@mui/material';
import { Bar, Line } from 'react-chartjs-2'; // Line might not be strictly needed
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants';
import { getYearString, calculateDaysHeld } from '../../utils/dateUtils';
import { generateColorPalette, getBaseProductName } from '../../utils/chartUtils';
import { calculateAnnualizedReturn as calculateStockAnnualizedReturn } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const calculateAnnualizedReturnForStocksLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
    return calculateStockAnnualizedReturn(sale.Delta, sale.BuyAmountEUR, daysHeld);
};

// Helper function for Top N + Others (Not used in this specific Example 5, but kept for consistency)
const getTopNAndOthersData = (yearlyProductPL, allProductNames, sortedYears, topN = 5, chartType = 'bar') => {
  const productAnnualTotals = {};
  allProductNames.forEach(name => {
    productAnnualTotals[name] = sortedYears.reduce((sum, year) => sum + (yearlyProductPL[year]?.[name] || 0), 0);
  });

  const sortedProductsByAbsPL = [...allProductNames].sort((a, b) => {
    const absA = Math.abs(productAnnualTotals[a]);
    const absB = Math.abs(productAnnualTotals[b]);
    return absB - absA;
  });

  const topProducts = sortedProductsByAbsPL.slice(0, topN);
  const otherProducts = sortedProductsByAbsPL.slice(topN);

  const topProductColors = generateColorPalette(topProducts.length, 'background');
  const topProductBorderColors = generateColorPalette(topProducts.length, 'border');

  const datasets = topProducts.map((productName, index) => ({
    label: productName,
    data: sortedYears.map(year => yearlyProductPL[year]?.[productName] || 0),
    backgroundColor: topProductColors[index % topProductColors.length],
    borderColor: topProductBorderColors[index % topProductBorderColors.length],
    borderWidth: 1,
    type: chartType === 'line' ? 'line' : undefined,
    fill: chartType === 'line' ? false : undefined,
    tension: chartType === 'line' ? 0.1 : undefined,
  }));

  if (otherProducts.length > 0) {
    const othersData = sortedYears.map(year => {
      return otherProducts.reduce((sum, productName) => sum + (yearlyProductPL[year]?.[productName] || 0), 0);
    });
    datasets.push({
      label: 'Others',
      data: othersData,
      backgroundColor: 'rgba(150, 150, 150, 0.6)',
      borderColor: 'rgba(150, 150, 150, 1)',
      borderWidth: 1,
      type: chartType === 'line' ? 'line' : undefined,
      fill: chartType === 'line' ? false : undefined,
      tension: chartType === 'line' ? 0.1 : undefined,
    });
  }
  return datasets;
};


export default function StockSalesSection({ stockSalesData, selectedYear, hideIndividualTotalPL = false }) {
  const totalDelta = useMemo(() => {
    return (stockSalesData || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
  }, [stockSalesData]);

  // Common data preparation logic
  const preparedChartInput = useMemo(() => {
    if (!stockSalesData || stockSalesData.length === 0) return null;

    const dataForChart = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
        ? stockSalesData
        : stockSalesData.filter(sale => getYearString(sale.SaleDate) === selectedYear);

    if (dataForChart.length === 0) return null;
        
    const allProductNames = [...new Set(dataForChart.map(sale => getBaseProductName(sale.ProductName)))].sort();
    
    const yearlyProductPL = {};
    const allYearsInChart = new Set();

    dataForChart.forEach(sale => {
      const year = getYearString(sale.SaleDate);
      if (year && sale.Delta != null) {
        allYearsInChart.add(year);
        const baseProduct = getBaseProductName(sale.ProductName);
        if (!yearlyProductPL[year]) yearlyProductPL[year] = {};
        yearlyProductPL[year][baseProduct] = (yearlyProductPL[year][baseProduct] || 0) + sale.Delta;
      }
    });

    const sortedYears = Array.from(allYearsInChart).sort((a,b) => a.localeCompare(b));
    return { yearlyProductPL, allProductNames, sortedYears, dataForChart };
  }, [stockSalesData, selectedYear]);

  // === CHART LOGIC FOR EXAMPLE 5 START ===
  const salesChartData = useMemo(() => {
    if (!preparedChartInput) return { labels: [], datasets: [] };
    const { yearlyProductPL, allProductNames, sortedYears } = preparedChartInput; 

    let chartLabels = [];
    let chartPLData = [];

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
        const totalPLByProduct = {};
        allProductNames.forEach(name => { 
            totalPLByProduct[name] = sortedYears.reduce((sum, year) => sum + (yearlyProductPL[year]?.[name] || 0), 0);
        });
        
        const sortedProducts = Object.entries(totalPLByProduct)
                                   .sort(([,a], [,b]) => b - a); 
        chartLabels = sortedProducts.map(([name]) => name);
        chartPLData = sortedProducts.map(([,pl]) => pl);

    } else {
        const plForSelectedYear = yearlyProductPL[selectedYear] || {};
        const productsInSelectedYear = Object.keys(plForSelectedYear);
        const sortedProducts = productsInSelectedYear
                                .map(name => ([name, plForSelectedYear[name]]))
                                .sort(([,a], [,b]) => b - a); 

        chartLabels = sortedProducts.map(([name]) => name);
        chartPLData = sortedProducts.map(([,pl]) => pl);
    }
    
    if (chartLabels.length === 0) return { labels: [], datasets: [] };

    const backgroundColors = chartPLData.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)');
    const borderColors = chartPLData.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)');

    const datasets = [{
        label: `P/L by Product`, // This label might not be shown if legend is false
        data: chartPLData,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
    }];
    
    return { labels: chartLabels, datasets };
  }, [preparedChartInput, selectedYear]); 

  const salesChartOptions = useMemo(() => ({
    // indexAxis: 'y', // REMOVED to make it a vertical bar chart
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false }, // Only one dataset, legend might be redundant
      title: { display: true, text: `Stock Sales by Product: ${(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'Total P/L (All Years)' : `P/L in ${selectedYear}`}` },
      tooltip: {
        callbacks: { 
          // For vertical bar, value is on y-axis
          label: (context) => `P/L: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.parsed.y || 0)}` 
        }
      },
    },
    scales: {
      // Swapped x and y configurations
      x: { title: { display: true, text: 'Product' } },
      y: { beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } },
    },
  }), [selectedYear]);
  // === CHART LOGIC FOR EXAMPLE 5 END ===

  if (!stockSalesData || stockSalesData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Stock Sales</Typography>
        <Typography>No stock sales data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  const ChartComponent = Bar; // For Example 5, we use a Bar chart with indexAxis: 'y'.

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Stock Sales Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}</Typography></Typography>
      )}

      {salesChartData && salesChartData.datasets && salesChartData.datasets.length > 0 && salesChartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
         <Box sx={{ height: 300, mb: 2 }}>
            <ChartComponent data={salesChartData} options={salesChartOptions} />
         </Box>
      )}

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Buy Date</TableCell><TableCell>Sale Date</TableCell><TableCell>Days Held</TableCell>
              <TableCell>Product Name</TableCell><TableCell>ISIN</TableCell><TableCell align="right">Qty</TableCell>
              <TableCell align="right">Buy Price (€)</TableCell><TableCell align="right">Sale Price (€)</TableCell>
              <TableCell align="right">Cost Basis (€)</TableCell><TableCell align="right">Proceeds (€)</TableCell>
              <TableCell align="right">Commission (€)</TableCell><TableCell align="right">P/L (€)</TableCell>
              <TableCell align="right">Annualized (%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockSalesData.map((sale, index) => (
              <TableRow hover key={`${sale.ISIN || sale.ProductName}-${sale.SaleDate}-${index}`}>
                <TableCell>{sale.BuyDate}</TableCell><TableCell>{sale.SaleDate || 'N/A'}</TableCell>
                <TableCell align="center">{calculateDaysHeld(sale.BuyDate, sale.SaleDate)}</TableCell>
                <TableCell>{sale.ProductName}</TableCell><TableCell>{sale.ISIN}</TableCell>
                <TableCell align="right">{sale.Quantity}</TableCell><TableCell align="right">{sale.BuyPrice?.toFixed(2)}</TableCell>
                <TableCell align="right">{sale.SalePrice?.toFixed(2)}</TableCell><TableCell align="right">{sale.BuyAmountEUR?.toFixed(2)}</TableCell>
                <TableCell align="right">{sale.SaleAmountEUR?.toFixed(2)}</TableCell><TableCell align="right">{sale.Commission?.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: (sale.Delta || 0) >= 0 ? 'success.main' : 'error.main' }}>{sale.Delta?.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: (parseFloat(calculateAnnualizedReturnForStocksLocal(sale)) || 0) >= 0 ? 'success.main' : 'error.main' }}>{calculateAnnualizedReturnForStocksLocal(sale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}