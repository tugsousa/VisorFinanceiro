import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants'; // Import constant

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.match(/^(\d{2})-(\d{2})-(\d{4})$/); 
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; 
    const year = parseInt(parts[3], 10);
    if (year > 1900 && year < 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date;
      }
    }
  }
  return null;
};

const getYearFromSaleDate = (saleDateStr) => {
    const date = parseDateDDMMYYYY(saleDateStr);
    return date ? date.getUTCFullYear().toString() : null;
};

const calculateDaysHeld = (buyDateStr, saleDateStr) => {
    const buyDate = parseDateDDMMYYYY(buyDateStr);
    const saleDate = parseDateDDMMYYYY(saleDateStr);
    if (!buyDate || !saleDate || saleDate < buyDate) return 'N/A';
    const differenceInTime = saleDate.getTime() - buyDate.getTime();
    const differenceInDays = Math.max(1, Math.round(differenceInTime / (1000 * 3600 * 24)));
    return differenceInDays;
};

const calculateAnnualizedReturn = (sale) => {
    const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
    const delta = sale.Delta; 
    const costBasis = sale.BuyAmountEUR; 
    if (daysHeld === 'N/A' || typeof delta !== 'number' || typeof costBasis !== 'number' || costBasis === 0) return 'N/A';
    const annualized = (delta / Math.abs(costBasis)) * (365 / daysHeld) * 100;
    return `${annualized.toFixed(2)}%`;
};

const generateColors = (count) => {
  const colors = []; const hueStep = 360 / Math.max(1, count); // Avoid division by zero
  for (let i = 0; i < count; i++) { colors.push(`hsla(${i * hueStep}, 70%, 50%, 0.6)`); }
  return colors;
};

export default function StockSalesSection({ stockSalesData, selectedYear, hideIndividualTotalPL = false }) {
  const totalDelta = useMemo(() => {
    return (stockSalesData || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
  }, [stockSalesData]);

  const salesChartData = useMemo(() => {
    if (!stockSalesData || stockSalesData.length === 0) return { labels: [], datasets: [] };

    const dataForChart = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
        ? stockSalesData
        : stockSalesData.filter(sale => getYearFromSaleDate(sale.SaleDate) === selectedYear);

    if (dataForChart.length === 0) return { labels: [], datasets: [] };
        
    const productNames = [...new Set(dataForChart.map(sale => sale.ProductName))].sort();
    const productColors = generateColors(productNames.length);
    
    const yearlyProductPL = {};
    const allYearsInChart = new Set();

    dataForChart.forEach(sale => {
      const year = getYearFromSaleDate(sale.SaleDate);
      if (year && sale.Delta != null) { // Check for null or undefined Delta
        allYearsInChart.add(year);
        if (!yearlyProductPL[year]) yearlyProductPL[year] = {};
        yearlyProductPL[year][sale.ProductName] = (yearlyProductPL[year][sale.ProductName] || 0) + sale.Delta;
      }
    });

    const sortedYears = Array.from(allYearsInChart).sort((a,b) => a.localeCompare(b));

    const datasets = productNames.map((productName, index) => ({
        label: productName,
        data: sortedYears.map(year => yearlyProductPL[year]?.[productName] || 0),
        backgroundColor: productColors[index % productColors.length], // Cycle through colors if fewer than products
        borderColor: productColors[index % productColors.length]?.replace('0.6', '1'),
        borderWidth: 1,
    }));
    return { labels: sortedYears, datasets };
  }, [stockSalesData, selectedYear]);

  const salesChartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: `Stock Sales P/L by Product (${(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})` },
      tooltip: {
        mode: 'index', intersect: false,
        callbacks: { label: (context) => `${context.dataset.label || ''}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.parsed.y || 0)}` }
      },
    },
    scales: {
      x: { stacked: true, title: { display: true, text: 'Year' } },
      y: { stacked: true, beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } },
    },
  }), [selectedYear]);

  if (!stockSalesData || stockSalesData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Stock Sales</Typography>
        <Typography>No stock sales data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Stock Sales Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}</Typography></Typography>
      )}

      {salesChartData.datasets && salesChartData.datasets.length > 0 && salesChartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
         <Box sx={{ height: 300, mb: 2 }}> <Bar data={salesChartData} options={salesChartOptions} /> </Box>
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
                <TableCell align="right" sx={{ color: (parseFloat(calculateAnnualizedReturn(sale)) || 0) >= 0 ? 'success.main' : 'error.main' }}>{calculateAnnualizedReturn(sale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}