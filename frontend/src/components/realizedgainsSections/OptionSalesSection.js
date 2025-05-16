// frontend/src/components/dashboardSections/OptionSalesSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box,
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION } from '../../constants';
import { getYearString, calculateDaysHeld } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';
import { calculateAnnualizedReturn as calculateOptionAnnualizedReturn } from '../../utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const calculateAnnualizedReturnForOptionsLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
    const costBasis = Math.abs(sale.open_amount_eur);
    return calculateOptionAnnualizedReturn(sale.delta, costBasis, daysHeld);
};

export default function OptionSalesSection({ optionSalesData, selectedYear, hideIndividualTotalPL = false }) {
  const totalDelta = useMemo(() => {
    return (optionSalesData || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
  }, [optionSalesData]);

  const chartData = useMemo(() => {
    if (!optionSalesData || optionSalesData.length === 0) return { labels: [], datasets: [] };

    const dataForChart = (selectedYear === ALL_YEARS_OPTION || !selectedYear)
        ? optionSalesData
        : optionSalesData.filter(sale => getYearString(sale.close_date) === selectedYear);

    if (dataForChart.length === 0) return { labels: [], datasets: [] };
        
    const productPLMap = {};
    dataForChart.forEach(sale => {
        if (sale.delta != null) {
            const baseProduct = getBaseProductName(sale.product_name);
            productPLMap[baseProduct] = (productPLMap[baseProduct] || 0) + sale.delta;
        }
    });

    const productsWithPL = Object.entries(productPLMap).map(([name, pl]) => ({ name, pl }));

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

    if (hasOthers && othersPL !== 0) {
        itemsForChart.push({ name: 'Others', pl: othersPL });
    }
    
    // Sort for vertical bar chart: P/L ascending (lowest on left, highest on right)
    itemsForChart.sort((a, b) => {
      if (a.pl !== b.pl) {
        return a.pl - b.pl; // Ascending P/L
      }
      // If P/L is the same, handle 'Others' to be last among them
      if (a.name === 'Others') return 1; 
      if (b.name === 'Others') return -1;
      
      return a.name.localeCompare(b.name); // Alphabetical for same P/L non-'Others' items
    });
    
    const finalLabels = itemsForChart.map(p => p.name);
    const finalPLData = itemsForChart.map(p => p.pl);
    
    const finalBackgroundColors = finalPLData.map((pl, index) => {
        if (itemsForChart[index].name === 'Others') {
            return pl >= 0 ? 'rgba(150, 150, 150, 0.6)' : 'rgba(180, 180, 180, 0.6)'; // Grey for Others
        }
        // Green for positive, Red for negative
        return pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)'; 
    });
    const finalBorderColors = finalPLData.map((pl, index) => {
      if (itemsForChart[index].name === 'Others') {
            return pl >= 0 ? 'rgba(150, 150, 150, 1)' : 'rgba(180, 180, 180, 1)';
        }
        return pl >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)';
    });
    
    if (finalLabels.length === 0) return { labels: [], datasets: [] };

    return {
      labels: finalLabels,
      datasets: [{
        label: `P/L by Product`,
        data: finalPLData,
        backgroundColor: finalBackgroundColors,
        borderColor: finalBorderColors,
        borderWidth: 1,
      }]
    };
  }, [optionSalesData, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false }, 
        title: {
            display: true,
            text: `Option Sales P/L by Product (${(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})`
        },
        tooltip: {
            callbacks: {
                label: (context) => `P/L: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.parsed.y || 0)}`
            }
        }
    },
    scales: {
        x: { 
            title: {
                display: true,
                text: 'Product'
            },
            ticks: { 
              autoSkip: false, 
              maxRotation: 45, 
              minRotation: 30, 
            }
        },
        y: { 
            beginAtZero: false, 
            title: {
                display: true,
                text: 'Profit/Loss (€)'
            }
        }
    }
  }), [selectedYear]);

  if (!optionSalesData || optionSalesData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
        <Typography variant="subtitle1" gutterBottom>Option Sales</Typography>
        <Typography>No option sales data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
      {!hideIndividualTotalPL && (
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}</Typography></Typography>
      )}

      {chartData.datasets && chartData.datasets.length > 0 && chartData.datasets.some(ds => ds.data.some(d => d !== 0 && d !== undefined)) && (
        <Box sx={{ height: 350, mb: 2 }}> 
          <Bar options={chartOptions} data={chartData} />
        </Box>
      )}

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Open Date</TableCell><TableCell>Close Date</TableCell><TableCell>Days Held</TableCell>
              <TableCell>Product Name</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Open Price</TableCell>
              <TableCell align="right">Close Price</TableCell><TableCell align="right">Open Amt (€)</TableCell><TableCell align="right">Close Amt (€)</TableCell>
              <TableCell align="right">Comm (€)</TableCell><TableCell align="right">P/L (€)</TableCell><TableCell align="right">Annualized (%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {optionSalesData.map((sale, index) => (
              <TableRow hover key={`${sale.product_name}-${sale.close_date}-${index}`}>
                <TableCell>{sale.open_date}</TableCell><TableCell>{sale.close_date || 'N/A'}</TableCell>
                <TableCell align="center">{calculateDaysHeld(sale.open_date, sale.close_date)}</TableCell>
                <TableCell>{sale.product_name}</TableCell><TableCell align="right">{sale.quantity}</TableCell>
                <TableCell align="right">{sale.open_price?.toFixed(4)}</TableCell><TableCell align="right">{sale.close_price?.toFixed(4)}</TableCell>
                <TableCell align="right">{sale.open_amount_eur?.toFixed(2)}</TableCell><TableCell align="right">{sale.close_amount_eur?.toFixed(2)}</TableCell>
                <TableCell align="right">{sale.commission?.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: (sale.delta || 0) >= 0 ? 'success.main' : 'error.main' }}>{sale.delta?.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: (parseFloat(calculateAnnualizedReturnForOptionsLocal(sale)) || 0) >= 0 ? 'success.main' : 'error.main' }}>{calculateAnnualizedReturnForOptionsLocal(sale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}