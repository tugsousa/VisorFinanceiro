import React from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const columns = [
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'open_date', headerName: 'Dt. abertura', width: 110 },
    { 
        field: 'quantity', 
        headerName: 'Qtd', 
        type: 'number', 
        width: 80,
        renderCell: (params) => (
            <Typography sx={{ color: params.value >= 0 ? 'inherit' : 'error.main' }}>
                {params.value}
            </Typography>
        ),
    },
    { field: 'open_price', headerName: 'Preço abertura', type: 'number', width: 120, valueFormatter: (params) => params.value.toFixed(4) },
    { field: 'open_amount_eur', headerName: 'Montante (€)', type: 'number', width: 130, valueFormatter: (params) => params.value.toFixed(2) },
    { field: 'open_currency', headerName: 'Moeda', width: 90 },
];

export default function OptionHoldingsSection({ holdingsData }) {
  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>Sem dados de posições em opções para mostrar.</Typography>
      </Paper>
    );
  }

  const rows = holdingsData.map((holding, index) => ({
    id: `${holding.product_name}-${holding.open_date}-${index}`,
    ...holding
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Posições em Opções</Typography>
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