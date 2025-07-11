import React from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';

const columns = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { field: 'buy_date', headerName: 'Dt. compra', width: 110 },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right' },
  { 
    field: 'averageCostEUR', 
    headerName: 'Preço (€)', 
    type: 'number', 
    width: 120, 
    valueGetter: (_, row) => row.quantity > 0 ? (row.buy_amount_eur / row.quantity) : 0,
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  { 
    field: 'buy_amount_eur', 
    headerName: 'Montante (€)', 
    type: 'number', 
    width: 130, 
    // FIX: Updated valueFormatter signature from (params) to (value)
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  { field: 'buy_currency', headerName: 'Moeda', width: 90 },
];

export default function StockHoldingsSection({ holdingsData }) {
  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>Sem dados de posições para mostrar.</Typography>
      </Paper>
    );
  }

  const rows = holdingsData.map((holding, index) => ({
    id: `${holding.isin}-${holding.buy_date}-${index}`,
    ...holding,
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Posições em Ações</Typography>
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
          localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
        />
      </Box>
    </Paper>
  );
}