
import React from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';

// Renamed component function to OptionHoldingsSection
export default function OptionHoldingsSection({ holdingsData, selectedYear }) {
  // Note: selectedYear might not be directly applicable to "current" holdings view,
  // but it's passed for consistency with other sections. The filtering of holdings
  // if needed by year would typically happen in the parent (DashboardPage) before passing data.
  // For now, this component just displays what it's given.

  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
        {/* Title Removed */}
        <Typography>No option holdings data to display.</Typography>
        {/* Removed year-specific message as holdings are usually "current" */}
      </Paper>
    );
  }

  // Option holdings data structure might be different, adapt as needed
  // Assuming holdingsData is already the array of OptionHolding from the backend model
  const processedHoldings = holdingsData; // Use directly or map if needed

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3 , border: 'none'}}>
      {/* Title removed */}
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {/* Updated Table Headers for Option Holdings */}
              <TableCell>Product Name</TableCell>
              <TableCell>Open Date</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Open Price</TableCell>
              <TableCell align="right">Open Amount (EUR)</TableCell>
              <TableCell>Currency</TableCell>
              <TableCell>Order ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Updated Table Body mapping for Option Holdings */}
            {processedHoldings.map((holding, index) => (
              <TableRow hover key={`${holding.product_name}-${holding.open_date}-${index}`}>
                <TableCell>{holding.product_name}</TableCell>
                <TableCell>{holding.open_date}</TableCell>
                {/* Show quantity sign (positive for long, negative for short) */}
                <TableCell align="right" sx={{ color: holding.quantity >= 0 ? 'inherit' : 'error.main' }}>{holding.quantity}</TableCell>
                <TableCell align="right">{holding.open_price?.toFixed(2)}</TableCell>
                <TableCell align="right">{holding.open_amount_eur?.toFixed(2)}</TableCell>
                <TableCell>{holding.open_currency}</TableCell>
                <TableCell>{holding.open_order_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}