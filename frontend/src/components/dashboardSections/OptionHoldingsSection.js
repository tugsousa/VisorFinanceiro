import React from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import { ALL_YEARS_OPTION } from '../../constants'; // Import ALL_YEARS_OPTION

export default function StockHoldingsSection({ holdingsData, selectedYear }) {
  // Note: selectedYear might not be directly applicable to "current" holdings view,
  // but it's passed for consistency with other sections. The filtering of holdings
  // if needed by year would typically happen in the parent (DashboardPage) before passing data.
  // For now, this component just displays what it's given.

  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
        <Typography variant="subtitle1" gutterBottom>Stock Holdings</Typography>
        <Typography>No stock holdings data to display.</Typography> 
        {/* Removed year-specific message as holdings are usually "current" */}
      </Paper>
    );
  }

  const processedHoldings = holdingsData.map(stock => ({
    ...stock,
    averageCostEUR: stock.quantity > 0 && stock.buy_amount_eur != null ? (stock.buy_amount_eur / stock.quantity) : 0,
    totalCostEUR: stock.buy_amount_eur != null ? stock.buy_amount_eur : 0,
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
      <Typography variant="subtitle1" gutterBottom>
        Current Stock Holdings
      </Typography>
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product Name</TableCell><TableCell>ISIN</TableCell>
              <TableCell>Buy Date</TableCell><TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Avg. Cost (EUR)</TableCell><TableCell align="right">Total Cost (EUR)</TableCell>
              <TableCell>Currency</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processedHoldings.map((holding, index) => (
              <TableRow hover key={`${holding.isin}-${holding.buy_date}-${index}`}>
                <TableCell>{holding.product_name}</TableCell><TableCell>{holding.isin}</TableCell>
                <TableCell>{holding.buy_date}</TableCell><TableCell align="right">{holding.quantity}</TableCell>
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