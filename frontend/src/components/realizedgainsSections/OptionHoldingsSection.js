import React from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const columns = [
    { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'open_date', headerName: 'Open Date', width: 110 },
    { 
        field: 'quantity', 
        headerName: 'Qty', 
        type: 'number', 
        width: 80,
        renderCell: (params) => (
            <Typography sx={{ color: params.value >= 0 ? 'inherit' : 'error.main' }}>
                {params.value}
            </Typography>
        ),
    },
    { field: 'open_price', headerName: 'Open Price', type: 'number', width: 120, valueFormatter: (params) => params.value.toFixed(4) },
    { field: 'open_amount_eur', headerName: 'Value (€)', type: 'number', width: 130, valueFormatter: (params) => params.value.toFixed(2) },
    { field: 'open_currency', headerName: 'Currency', width: 90 },
];

export default function OptionHoldingsSection({ holdingsData }) {
  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>No option holdings data to display.</Typography>
      </Paper>
    );
  }

  const rows = holdingsData.map((holding, index) => ({
    id: `${holding.product_name}-${holding.open_date}-${index}`,
    ...holding
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Option Holdings</Typography>
      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
            sorting: { sortModel: [{ field: 'open_amount_eur', sort: 'desc' }] },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
        />
      </Box>
    </Paper>
  );
}