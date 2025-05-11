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
// import { generateColorPalette, getBaseProductName } from '../../utils/chartUtils'; // generateColorPalette not used for this chart
import { getBaseProductName } from '../../utils/chartUtils'; // Only need getBaseProductName
import { calculateAnnualizedReturn as calculateStockAnnualizedReturn } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const calculateAnnualizedReturnForStocksLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
    return calculateStockAnnualizedReturn(sale.Delta, sale.BuyAmountEUR, daysHeld);
};

// Removed the unused getTopNAndOthersData function

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
    
    const yearlyProductPL = {}; // For 'All Years' view, this will store totals per product across all years
    const allYearsInChart = new Set(); // Only relevant if we were to show yearly breakdown

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
        dataForChart.forEach(sale => {
            if (sale.Delta != null) {
                const baseProduct = getBaseProductName(sale.ProductName);
                // Accumulate total P/L for each product across all relevant sales
                yearlyProductPL[baseProduct] = (yearlyProductPL[baseProduct] || 0) + sale.Delta;
            }
        });
    } else { // Specific year selected
        dataForChart.forEach(sale => {
          if (sale.Delta != null) {
            const baseProduct = getBaseProductName(sale.ProductName);
            yearlyProductPL[baseProduct] = (yearlyProductPL[baseProduct] || 0) + sale.Delta;
          }
        });
    }
    // For the chart, we just need the product names and their aggregated P/L for the selected period
    return { productPLMap: yearlyProductPL, allProductNames, dataForChart };
  }, [stockSalesData, selectedYear]);


  const salesChartData = useMemo(() => {
    if (!preparedChartInput) return { labels: [], datasets: [] };
    const { productPLMap } = preparedChartInput; 

    const productsWithPL = Object.entries(productPLMap).map(([name, pl]) => ({ name, pl }));

    // Sort by absolute P/L descending to find the most impactful items
    productsWithPL.sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl));
    
    const topN = 15; // Display top N products individually
    let finalLabels = [];
    let finalPLData = [];
    let finalBackgroundColors = [];
    let finalBorderColors = [];

    if (productsWithPL.length > topN) {
        const topNProducts = productsWithPL.slice(0, topN);
        const otherProducts = productsWithPL.slice(topN);

        finalLabels = topNProducts.map(p => p.name);
        finalPLData = topNProducts.map(p => p.pl);
        
        const othersPL = otherProducts.reduce((sum, p) => sum + p.pl, 0);
        finalLabels.push('Others'); // Add "Others" category
        finalPLData.push(othersPL);

        // Colors for Top N products
        finalBackgroundColors = topNProducts.map(p => p.pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)');
        finalBorderColors = topNProducts.map(p => p.pl >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)');
        
        // Colors for "Others"
        finalBackgroundColors.push(othersPL >= 0 ? 'rgba(150, 150, 150, 0.6)' : 'rgba(180, 180, 180, 0.6)'); // Grey for Others
        finalBorderColors.push(othersPL >= 0 ? 'rgba(150, 150, 150, 1)' : 'rgba(180, 180, 180, 1)');

    } else { // If less than or equal to topN products, show all
        finalLabels = productsWithPL.map(p => p.name);
        finalPLData = productsWithPL.map(p => p.pl);
        
        finalBackgroundColors = finalPLData.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)');
        finalBorderColors = finalPLData.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)');
    }
    
    if (finalLabels.length === 0) return { labels: [], datasets: [] };

    const datasets = [{
        label: `P/L by Product`, // This label might not be shown if legend is false
        data: finalPLData,
        backgroundColor: finalBackgroundColors,
        borderColor: finalBorderColors,
        borderWidth: 1,
    }];
    
    return { labels: finalLabels, datasets };
  }, [preparedChartInput, selectedYear]); 

  const salesChartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false }, // Only one dataset, legend might be redundant
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
            autoSkip: false, // Important for rotated labels
            maxRotation: 45, // Rotate labels if they overlap
            minRotation: 30, // Minimum rotation
          }
      },
      y: { beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } },
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

  const ChartComponent = Bar; 

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Stock Sales Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}</Typography></Typography>
      )}

      {salesChartData && salesChartData.datasets && salesChartData.datasets.length > 0 && salesChartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
         <Box sx={{ height: 350, mb: 2 }}> {/* Increased height slightly for better label visibility */}
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