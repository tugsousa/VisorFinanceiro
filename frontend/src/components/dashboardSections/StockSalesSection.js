// frontend/src/components/dashboardSections/StockSalesSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';

const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.match(/^(\d{2})-(\d{2})-(\d{4})$/); // More specific regex
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1; // Month is 0-indexed in JS Date
    const year = parseInt(parts[3], 10);
    // Basic validation
    if (year > 1900 && year < 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month, day));
      // Double check if date is valid after construction (e.g. Feb 30)
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date;
      }
    }
  }
  console.warn(`StockSalesSection: Could not parse date DD-MM-YYYY: ${dateString}`);
  return null;
};

const calculateDaysHeld = (buyDateStr, saleDateStr) => {
    const buyDate = parseDateDDMMYYYY(buyDateStr);
    const saleDate = parseDateDDMMYYYY(saleDateStr);

    if (!buyDate || !saleDate) return 'N/A';
    if (saleDate < buyDate) return 'Error'; // Sale before buy

    const differenceInTime = saleDate.getTime() - buyDate.getTime();
    const differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24));
    return differenceInDays === 0 ? 1 : differenceInDays; // Min 1 day
};

const calculateAnnualizedReturn = (sale) => {
    const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
    const delta = sale.Delta; // P/L in EUR
    const costBasis = sale.BuyAmountEUR; // Cost in EUR

    if (typeof daysHeld !== 'number' || daysHeld <= 0 || typeof delta !== 'number' || typeof costBasis !== 'number' || costBasis === 0) {
        return 'N/A';
    }
    const annualized = (delta / Math.abs(costBasis)) * (365 / daysHeld) * 100;
    return `${annualized.toFixed(2)}%`;
};

export default function StockSalesSection({ stockSalesData, selectedYear }) {
  const totalDelta = useMemo(() => {
    return stockSalesData.reduce((sum, sale) => sum + (sale.Delta || 0), 0);
  }, [stockSalesData]);

  if (!stockSalesData || stockSalesData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Stock Sales</Typography>
        <Typography>No stock sales data {selectedYear === 'all' ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Stock Sales Summary ({selectedYear === 'all' ? 'All Years' : selectedYear})
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
              <TableCell>Buy Date</TableCell>
              <TableCell>Sale Date</TableCell>
              <TableCell>Days Held</TableCell>
              <TableCell>Product Name</TableCell>
              <TableCell>ISIN</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Buy Price (€)</TableCell>
              <TableCell align="right">Sale Price (€)</TableCell>
              <TableCell align="right">Cost Basis (€)</TableCell>
              <TableCell align="right">Proceeds (€)</TableCell>
              <TableCell align="right">Commission (€)</TableCell>
              <TableCell align="right">P/L (€)</TableCell>
              <TableCell align="right">Annualized (%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockSalesData.map((sale, index) => {
              const annualizedReturnDisplay = calculateAnnualizedReturn(sale);
              const daysHeldDisplay = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
              const key = `${sale.ISIN || sale.ProductName}-${sale.SaleDate}-${index}`;
              return (
                <TableRow hover key={key}>
                  <TableCell>{sale.BuyDate}</TableCell>
                  <TableCell>{sale.SaleDate || 'N/A'}</TableCell>
                  <TableCell align="center">{daysHeldDisplay}</TableCell>
                  <TableCell>{sale.ProductName}</TableCell>
                  <TableCell>{sale.ISIN}</TableCell>
                  <TableCell align="right">{sale.Quantity}</TableCell>
                  <TableCell align="right">{sale.BuyPrice?.toFixed(2)}</TableCell>
                  <TableCell align="right">{sale.SalePrice?.toFixed(2)}</TableCell>
                  <TableCell align="right">{sale.BuyAmountEUR?.toFixed(2)}</TableCell>
                  <TableCell align="right">{sale.SaleAmountEUR?.toFixed(2)}</TableCell>
                  <TableCell align="right">{sale.Commission?.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: (sale.Delta || 0) >= 0 ? 'success.main' : 'error.main' }}>
                    {sale.Delta?.toFixed(2)}
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