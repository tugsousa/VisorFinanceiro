// frontend/src/components/dashboardSections/StockSalesSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants';
import { getYearString, calculateDaysHeld } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils'; 
import { calculateAnnualizedReturn as calculateStockAnnualizedReturn } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const calculateAnnualizedReturnForStocksLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
    return calculateStockAnnualizedReturn(sale.Delta, sale.BuyAmountEUR, daysHeld);
};

export default function StockSalesSection({ stockSalesData, selectedYear, hideIndividualTotalPL = false }) {
  const totalDelta = useMemo(() => {
    return (stockSalesData || []).reduce((sum, sale) => sum + (sale.Delta || 0), 0);
  }, [stockSalesData]);

  const preparedChartInput = useMemo(() => {
    if (!stockSalesData || stockSalesData.length === 0) return null;

    const dataForChart = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
        ? stockSalesData
        : stockSalesData.filter(sale => getYearString(sale.SaleDate) === selectedYear);

    if (dataForChart.length === 0) return null;
        
    const productPLMap = {}; 

    dataForChart.forEach(sale => {
        if (sale.Delta != null) {
            const baseProduct = getBaseProductName(sale.ProductName);
            productPLMap[baseProduct] = (productPLMap[baseProduct] || 0) + sale.Delta;
        }
    });
    
    // No need for allProductNames here if not used for chart labels directly
    return { productPLMap, dataForChart };
  }, [stockSalesData, selectedYear]);


  const salesChartData = useMemo(() => {
    if (!preparedChartInput) return { labels: [], datasets: [] };
    const { productPLMap } = preparedChartInput; 

    const productsWithPL = Object.entries(productPLMap).map(([name, pl]) => ({ name, pl }));

    // 1. Sort by absolute P/L descending to identify the most significant items
    const sortedByAbsolutePL = [...productsWithPL].sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl));
    
    const topN = 15; 
    let itemsForChart = [];
    let othersPL = 0;
    let hasOthers = false;

    if (sortedByAbsolutePL.length > topN) {
        itemsForChart = sortedByAbsolutePL.slice(0, topN);
        const otherProducts = sortedByAbsolutePL.slice(topN);
        othersPL = otherProducts.reduce((sum, p) => sum + p.pl, 0);
        hasOthers = true;
    } else { 
        itemsForChart = sortedByAbsolutePL;
    }

    if (hasOthers) {
        itemsForChart.push({ name: 'Others', pl: othersPL });
    }
    
    // 2. Now sort the itemsForChart (Top N + Others) by P/L ascending for display
    itemsForChart.sort((a, b) => {
      if (a.pl === b.pl) {
        // Ensure "Others" comes last if P/L is the same as another item, or sort alphabetically
        if (a.name === 'Others') return 1;
        if (b.name === 'Others') return -1;
        return a.name.localeCompare(b.name);
      }
      return a.pl - b.pl;
    });
    
    const finalLabels = itemsForChart.map(p => p.name);
    const finalPLData = itemsForChart.map(p => p.pl);
    
    const finalBackgroundColors = finalPLData.map((pl, index) => {
        if (itemsForChart[index].name === 'Others') {
            return pl >= 0 ? 'rgba(150, 150, 150, 0.6)' : 'rgba(180, 180, 180, 0.6)'; // Grey for Others
        }
        return pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)';
    });
    const finalBorderColors = finalPLData.map((pl, index) => {
      if (itemsForChart[index].name === 'Others') {
            return pl >= 0 ? 'rgba(150, 150, 150, 1)' : 'rgba(180, 180, 180, 1)';
        }
        return pl >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)';
    });
    
    if (finalLabels.length === 0) return { labels: [], datasets: [] };

    const datasets = [{
        label: `P/L by Product`,
        data: finalPLData,
        backgroundColor: finalBackgroundColors,
        borderColor: finalBorderColors,
        borderWidth: 1,
    }];
    
    return { labels: finalLabels, datasets };
  }, [preparedChartInput]); 

  const salesChartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false }, 
      title: { display: true, text: `Stock Sales by Product: ${(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'Total P/L (All Years)' : `P/L in ${selectedYear}`}` },
      tooltip: {
        callbacks: { 
          label: (context) => `P/L: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.parsed.y || 0)}` 
        }
      },
    },
    scales: {
      x: { 
          title: { display: true, text: 'Product' },
          ticks: {
            autoSkip: false, 
            maxRotation: 45, 
            minRotation: 30, 
          }
      },
      y: { beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } },
    },
  }), [selectedYear]);

  if (!stockSalesData || stockSalesData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
        <Typography variant="subtitle1" gutterBottom>Stock Sales</Typography>
        <Typography>No stock sales data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  const ChartComponent = Bar; 

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
      <Typography variant="subtitle1" gutterBottom>
        Stock Sales Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}</Typography></Typography>
      )}

      {salesChartData && salesChartData.datasets && salesChartData.datasets.length > 0 && salesChartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
         <Box sx={{ height: 350, mb: 2 }}>
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