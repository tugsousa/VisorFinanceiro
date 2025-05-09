// frontend/src/components/dashboardSections/OptionSalesSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';

// Helper functions (parseDateDDMMYYYY, calculateDaysHeld, calculateAnnualizedReturn for options)
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
  console.warn(`OptionSalesSection: Could not parse date DD-MM-YYYY: ${dateString}`);
  return null;
};

const calculateDaysHeldForOptions = (openDateStr, closeDateStr) => {
    const openDate = parseDateDDMMYYYY(openDateStr);
    const closeDate = parseDateDDMMYYYY(closeDateStr);

    if (!openDate || !closeDate) return 'N/A';
    if (closeDate < openDate) return 'Error';

    const differenceInTime = closeDate.getTime() - openDate.getTime();
    const differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24));
    return differenceInDays === 0 ? 1 : differenceInDays;
};

const calculateAnnualizedReturnForOptions = (sale) => {
    const daysHeld = calculateDaysHeldForOptions(sale.open_date, sale.close_date);
    const delta = sale.delta; // P/L in EUR
    // For options, "cost basis" is the premium paid (open_amount_eur if bought)
    // or premium received (open_amount_eur if sold to open, which would be negative).
    // We use Math.abs for the denominator for rate of return calculation.
    const investmentAmount = Math.abs(sale.open_amount_eur);

    if (typeof daysHeld !== 'number' || daysHeld <= 0 || typeof delta !== 'number' || typeof investmentAmount !== 'number' || investmentAmount === 0) {
        return 'N/A';
    }
    const annualized = (delta / investmentAmount) * (365 / daysHeld) * 100;
    return `${annualized.toFixed(2)}%`;
};


export default function OptionSalesSection({ optionSalesData, selectedYear }) {
  const totalDelta = useMemo(() => {
    return optionSalesData.reduce((sum, sale) => sum + (sale.delta || 0), 0);
  }, [optionSalesData]);

  if (!optionSalesData || optionSalesData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Option Sales</Typography>
        <Typography>No option sales data {selectedYear === 'all' ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Option Sales Summary ({selectedYear === 'all' ? 'All Years' : selectedYear})
      </Typography>
      <Typography variant="body2" component="div" sx={{ mb: 2 }}>
        Total P/L:
        <Typography component="span" sx={{ fontWeight: 'bold', ml: 1, color: totalDelta >= 0 ? 'success.main' : 'error.main' }}>
          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalDelta)}
        </Typography>
      </Typography>

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Open Date</TableCell>
              <TableCell>Close Date</TableCell>
              <TableCell>Days Held</TableCell>
              <TableCell>Product Name</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Open Price</TableCell>
              <TableCell align="right">Close Price</TableCell>
              <TableCell align="right">Open Amt (€)</TableCell>
              <TableCell align="right">Close Amt (€)</TableCell>
              <TableCell align="right">Comm (€)</TableCell>
              <TableCell align="right">P/L (€)</TableCell>
              <TableCell align="right">Annualized (%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {optionSalesData.map((sale, index) => {
              const annualizedReturnDisplay = calculateAnnualizedReturnForOptions(sale);
              const daysHeldDisplay = calculateDaysHeldForOptions(sale.open_date, sale.close_date);
              const key = `${sale.product_name}-${sale.close_date}-${index}`;
              return (
                <TableRow hover key={key}>
                  <TableCell>{sale.open_date}</TableCell>
                  <TableCell>{sale.close_date || 'N/A'}</TableCell>
                  <TableCell align="center">{daysHeldDisplay}</TableCell>
                  <TableCell>{sale.product_name}</TableCell>
                  <TableCell align="right">{sale.quantity}</TableCell>
                  <TableCell align="right">{sale.open_price?.toFixed(4)}</TableCell>
                  <TableCell align="right">{sale.close_price?.toFixed(4)}</TableCell>
                  <TableCell align="right">{sale.open_amount_eur?.toFixed(2)}</TableCell>
                  <TableCell align="right">{sale.close_amount_eur?.toFixed(2)}</TableCell>
                  <TableCell align="right">{sale.commission?.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: (sale.delta || 0) >= 0 ? 'success.main' : 'error.main' }}>
                    {sale.delta?.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: (parseFloat(annualizedReturnDisplay) || 0) >= 0 ? 'success.main' : 'error.main' }}>
                    {annualizedReturnDisplay}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}