// frontend/src/components/dashboardSections/StockHoldingsSection.js
import React from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Box
} from '@mui/material';

export default function StockHoldingsSection({ holdingsData, selectedYear }) {
  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
        <Typography variant="subtitle1" gutterBottom>Stock Holdings</Typography>
        <Typography>No stock holdings data to display{selectedYear !== 'all' ? ` for ${selectedYear}` : ''}.</Typography>
      </Paper>
    );
  }

  // Calculate average cost and total cost if not already done or to ensure consistent formatting
  const processedHoldings = holdingsData.map(stock => ({
    ...stock,
    averageCostEUR: stock.quantity > 0 && stock.buy_amount_eur !== undefined ? (stock.buy_amount_eur / stock.quantity) : 0,
    totalCostEUR: stock.buy_amount_eur !== undefined ? stock.buy_amount_eur : 0,
  }));


  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
      <Typography variant="subtitle1" gutterBottom>
        Stock Holdings Summary
      </Typography>
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product Name</TableCell>
              <TableCell>ISIN</TableCell>
              <TableCell>Buy Date</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Avg. Cost (EUR)</TableCell>
              <TableCell align="right">Total Cost (EUR)</TableCell>
              <TableCell>Currency</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processedHoldings.map((holding, index) => (
              <TableRow hover key={`${holding.isin}-${holding.buy_date}-${index}`}>
                <TableCell>{holding.product_name}</TableCell>
                <TableCell>{holding.isin}</TableCell>
                <TableCell>{holding.buy_date}</TableCell>
                <TableCell align="right">{holding.quantity}</TableCell>
                <TableCell align="right">{holding.averageCostEUR.toFixed(2)}</TableCell>
                <TableCell align="right">{holding.totalCostEUR.toFixed(2)}</TableCell>
                <TableCell>{holding.buy_currency}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}