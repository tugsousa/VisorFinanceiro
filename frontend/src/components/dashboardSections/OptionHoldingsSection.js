// frontend/src/components/dashboardSections/OptionHoldingsSection.js
import React from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box
} from '@mui/material';

// Helper to calculate days remaining (simplified, adapt if needed)
const calculateDaysRemaining = (productName) => {
    if (!productName || typeof productName !== 'string') return 'N/A';
    try {
      const parts = productName.split(' ');
      if (parts.length >= 3) {
        const datePart = parts.find(part => /^\d{2}[A-Z]{3}\d{2}$/.test(part));
        if (datePart) {
          const day = datePart.substring(0, 2);
          const monthStr = datePart.substring(2, 5);
          const yearSuffix = datePart.substring(5);
          const year = `20${yearSuffix}`; // Assuming 21st century

          const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
          const monthIndex = monthNames.indexOf(monthStr.toUpperCase());
          if (monthIndex === -1) return "Invalid Month";

          const expirationDate = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
          const today = new Date();
          const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

          if (isNaN(expirationDate.getTime())) return "Invalid Date";

          const timeDiff = expirationDate.getTime() - todayUTC.getTime();
          const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          return days >=0 ? `${days} days` : `Expired (${Math.abs(days)} days ago)`;
        }
      }
    } catch (e) { console.warn(`Failed to parse expiration date from: ${productName}`, e); }
    return 'N/A';
  };


export default function OptionHoldingsSection({ holdingsData, selectedYear }) {
  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Option Holdings</Typography>
        <Typography>No option holdings data to display{selectedYear !== 'all' ? ` for ${selectedYear}` : ''}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Option Holdings Summary
      </Typography>
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Open Date</TableCell>
              <TableCell>Expiration</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Open Value (EUR)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {holdingsData.map((holding, index) => (
              <TableRow hover key={`${holding.product_name}-${holding.open_date}-${index}`}>
                <TableCell>{holding.product_name}</TableCell>
                <TableCell>{holding.open_date}</TableCell>
                <TableCell>{calculateDaysRemaining(holding.product_name)}</TableCell>
                <TableCell align="right">{holding.quantity}</TableCell>
                <TableCell align="right">{(holding.open_amount_eur || 0).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}