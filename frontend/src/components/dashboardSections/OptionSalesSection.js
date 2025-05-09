import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box,
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants'; // Import constants

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

const getYear = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCFullYear() : null;
};

const getMonth = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCMonth() + 1 : null;
};
// MONTH_NAMES_CHART is now from constants

const getCompanyName = (productName) => {
  if (!productName || typeof productName !== 'string') return 'Unknown';
  const parts = productName.split(' ');
  return parts[0] || 'Unknown';
};

const GOLDEN_ANGLE = 137.5;
const getColorForCompany = (index, total) => {
  if (total <= 0) return 'rgba(200, 200, 200, 0.7)';
  const hue = (index * GOLDEN_ANGLE) % 360;
  const saturation = 60 + (index * 5) % 31;
  const lightness = 65 + (index * 3) % 16;
  return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
};
const getBorderColorForCompany = (index, total) => {
   if (total <= 0) return 'rgba(150, 150, 150, 1)';
   const hue = (index * GOLDEN_ANGLE) % 360;
   const saturation = 70 + (index * 5) % 26;
   const lightness = 50 + (index * 3) % 16;
   return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
};

const calculateDaysHeldForOptions = (openDateStr, closeDateStr) => {
    const openDate = parseDateDDMMYYYY(openDateStr);
    const closeDate = parseDateDDMMYYYY(closeDateStr);
    if (!openDate || !closeDate || closeDate < openDate) return 'N/A';
    const differenceInTime = closeDate.getTime() - openDate.getTime();
    const differenceInDays = Math.max(1, Math.round(differenceInTime / (1000 * 3600 * 24))); // Ensure at least 1 day
    return differenceInDays;
};

const calculateAnnualizedReturnForOptions = (sale) => {
    const daysHeld = calculateDaysHeldForOptions(sale.open_date, sale.close_date);
    const delta = sale.delta;
    const investmentAmount = Math.abs(sale.open_amount_eur);
    if (daysHeld === 'N/A' || typeof delta !== 'number' || typeof investmentAmount !== 'number' || investmentAmount === 0) return 'N/A';
    const annualized = (delta / investmentAmount) * (365 / daysHeld) * 100;
    return `${annualized.toFixed(2)}%`;
};

export default function OptionSalesSection({ optionSalesData, selectedYear, hideIndividualTotalPL = false }) {
  const totalDelta = useMemo(() => {
    return (optionSalesData || []).reduce((sum, sale) => sum + (sale.delta || 0), 0);
  }, [optionSalesData]);

  const chartData = useMemo(() => {
    if (!optionSalesData || optionSalesData.length === 0) return { labels: [], datasets: [] };
    const uniqueCompanies = [...new Set(optionSalesData.map(sale => getCompanyName(sale.product_name)))].sort();
    const datasets = [];
    let labels = [];

    if (selectedYear === ALL_YEARS_OPTION || !selectedYear) { // Use constant
        const yearlyTotalsByCompany = {}; 
        const allYearsInData = new Set();
        optionSalesData.forEach(sale => {
            const year = getYear(sale.close_date);
            const company = getCompanyName(sale.product_name);
            if (year && sale.delta != null) { // Check for null or undefined delta
                allYearsInData.add(String(year));
                if (!yearlyTotalsByCompany[year]) yearlyTotalsByCompany[year] = {};
                yearlyTotalsByCompany[year][company] = (yearlyTotalsByCompany[year][company] || 0) + sale.delta;
            }
        });
        labels = Array.from(allYearsInData).sort((a, b) => Number(a) - Number(b));
        const totalCompanies = uniqueCompanies.length;
        uniqueCompanies.forEach((company, index) => {
            const data = labels.map(year => yearlyTotalsByCompany[year]?.[company] || 0);
            datasets.push({ label: company, data, backgroundColor: getColorForCompany(index, totalCompanies), borderColor: getBorderColorForCompany(index, totalCompanies), borderWidth: 1, });
        });
    } else {
        labels = MONTH_NAMES_CHART; // Use constant
        const monthlyTotalsByCompany = {};
        uniqueCompanies.forEach(company => { monthlyTotalsByCompany[company] = Array(12).fill(0); });
        optionSalesData.forEach(sale => {
            const month = getMonth(sale.close_date);
            const company = getCompanyName(sale.product_name);
            if (month && sale.delta != null) { // Check for null or undefined delta
                monthlyTotalsByCompany[company][month - 1] += sale.delta;
            }
        });
        const totalCompanies = uniqueCompanies.length;
        uniqueCompanies.forEach((company, index) => {
            datasets.push({ label: company, data: monthlyTotalsByCompany[company], backgroundColor: getColorForCompany(index, totalCompanies), borderColor: getBorderColorForCompany(index, totalCompanies), borderWidth: 1, });
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
                <TableCell align="center">{calculateDaysHeldForOptions(sale.open_date, sale.close_date)}</TableCell>
                <TableCell>{sale.product_name}</TableCell><TableCell align="right">{sale.quantity}</TableCell>
                <TableCell align="right">{sale.open_price?.toFixed(4)}</TableCell><TableCell align="right">{sale.close_price?.toFixed(4)}</TableCell>
                <TableCell align="right">{sale.open_amount_eur?.toFixed(2)}</TableCell><TableCell align="right">{sale.close_amount_eur?.toFixed(2)}</TableCell>
                <TableCell align="right">{sale.commission?.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: (sale.delta || 0) >= 0 ? 'success.main' : 'error.main' }}>{sale.delta?.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: (parseFloat(calculateAnnualizedReturnForOptions(sale)) || 0) >= 0 ? 'success.main' : 'error.main' }}>{calculateAnnualizedReturnForOptions(sale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}