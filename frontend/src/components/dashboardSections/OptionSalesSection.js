// frontend/src/components/dashboardSections/OptionSalesSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box,
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants';
import { getYearString, getMonthIndex, calculateDaysHeld } from '../../utils/dateUtils';
import { generateDistinctColor, getBaseProductName } from '../../utils/chartUtils';
import { calculateAnnualizedReturn as calculateOptionAnnualizedReturn } from '../../utils/formatUtils'; // Renamed for clarity

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const calculateAnnualizedReturnForOptionsLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
    // For options, cost basis is often the open_amount_eur. If it's a credit spread, delta itself is the P/L.
    // Here, we assume delta is P/L and open_amount_eur is the "cost" or margin if applicable for percentage.
    // If open_amount_eur is negative (credit received), use its absolute value.
    const costBasis = Math.abs(sale.open_amount_eur);
    return calculateOptionAnnualizedReturn(sale.delta, costBasis, daysHeld);
};

export default function OptionSalesSection({ optionSalesData, selectedYear, hideIndividualTotalPL = false }) {
  const totalDelta = useMemo(() => {
    return (optionSalesData || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
  }, [optionSalesData]);

  const chartData = useMemo(() => {
    if (!optionSalesData || optionSalesData.length === 0) return { labels: [], datasets: [] };
    const uniqueCompanies = [...new Set(optionSalesData.map(sale => getBaseProductName(sale.product_name)))].sort();
    const datasets = [];
    let labels = [];

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) {
        const yearlyTotalsByCompany = {}; 
        const allYearsInData = new Set();
        optionSalesData.forEach(sale => {
            const year = getYearString(sale.close_date);
            const company = getBaseProductName(sale.product_name);
            if (year && sale.delta != null) {
                allYearsInData.add(year);
                if (!yearlyTotalsByCompany[year]) yearlyTotalsByCompany[year] = {};
                yearlyTotalsByCompany[year][company] = (yearlyTotalsByCompany[year][company] || 0) + sale.delta;
            }
        });
        labels = Array.from(allYearsInData).sort((a, b) => Number(a) - Number(b));
        const totalCompanies = uniqueCompanies.length;
        uniqueCompanies.forEach((company, index) => {
            const data = labels.map(year => yearlyTotalsByCompany[year]?.[company] || 0);
            datasets.push({ 
              label: company, data, 
              backgroundColor: generateDistinctColor(index, totalCompanies, 'background'), 
              borderColor: generateDistinctColor(index, totalCompanies, 'border'), 
              borderWidth: 1, 
            });
        });
    } else {
        labels = MONTH_NAMES_CHART;
        const monthlyTotalsByCompany = {};
        uniqueCompanies.forEach(company => { monthlyTotalsByCompany[company] = Array(12).fill(0); });
        optionSalesData.forEach(sale => {
            const monthIdx = getMonthIndex(sale.close_date); // 0-11
            const company = getBaseProductName(sale.product_name);
            if (monthIdx !== null && sale.delta != null) {
                monthlyTotalsByCompany[company][monthIdx] += sale.delta;
            }
        });
        const totalCompanies = uniqueCompanies.length;
        uniqueCompanies.forEach((company, index) => {
            datasets.push({ 
              label: company, data: monthlyTotalsByCompany[company], 
              backgroundColor: generateDistinctColor(index, totalCompanies, 'background'), 
              borderColor: generateDistinctColor(index, totalCompanies, 'border'), 
              borderWidth: 1, 
            });
        });
    }
    return { labels, datasets };
  }, [optionSalesData, selectedYear]);

  const chartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { display: true, position: 'top' },
        title: { display: true, text: (selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'Total Option Delta per Year by Company' : `Monthly Option Delta by Company - ${selectedYear}`},
        tooltip: { callbacks: { label: (context) => `${context.dataset.label || ''}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(context.raw || 0)}` } }
    },
    scales: {
        y: { beginAtZero: false, stacked: true, title: { display: true, text: 'Total Delta (€)'}},
        x: { stacked: true, title: { display: true, text: (selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'Year' : 'Month'}}
    }
  }), [selectedYear]);

  if (!optionSalesData || optionSalesData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Option Sales</Typography>
        <Typography>No option sales data {(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Option Sales Summary ({(selectedYear === ALL_YEARS_OPTION || !selectedYear) ? 'All Years' : selectedYear})
      </Typography>
      {!hideIndividualTotalPL && (
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>Total P/L: <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}</Typography></Typography>
      )}

      {chartData.datasets && chartData.datasets.length > 0 && chartData.datasets.some(ds => ds.data.some(d => d !== 0)) && (
        <Box sx={{ height: 300, mb: 2 }}> <Bar options={chartOptions} data={chartData} /> </Box>
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