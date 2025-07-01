import React from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const columns = [
  { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { field: 'buy_date', headerName: 'Buy Date', width: 110 },
  { field: 'quantity', headerName: 'Qty', type: 'number', width: 80, align: 'right' },
  { 
    field: 'averageCostEUR', 
    headerName: 'Avg. Cost (€)', 
    type: 'number', 
    width: 120, 
    // FIX: Updated valueGetter signature from (params) to (_, row)
    valueGetter: (_, row) => row.quantity > 0 ? (row.buy_amount_eur / row.quantity) : 0,
    // FIX: Updated valueFormatter signature from (params) to (value)
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  { 
    field: 'buy_amount_eur', 
    headerName: 'Total Cost (€)', 
    type: 'number', 
    width: 130, 
    // FIX: Updated valueFormatter signature from (params) to (value)
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  { field: 'buy_currency', headerName: 'Currency', width: 90 },
];

export default function StockHoldingsSection({ holdingsData }) {
  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>No stock holdings data to display.</Typography>
      </Paper>
    );
  }

  const rows = holdingsData.map((holding, index) => ({
    id: `${holding.isin}-${holding.buy_date}-${index}`,
    ...holding,
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Stock Holdings</Typography>
      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
            sorting: { sortModel: [{ field: 'buy_amount_eur', sort: 'desc' }] },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
        />
      </Box>
    </Paper>
  );
}