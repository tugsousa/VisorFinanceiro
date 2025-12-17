// frontend/src/components/realizedgainsSections/OptionHoldingsSection.js
import React from 'react';
import { Typography, Paper, Box, CircularProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const columns = [
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'open_date', headerName: 'Dt. abertura', width: 110 },
    {
        field: 'quantity',
        headerName: 'Qtd',
        type: 'number',
        width: 80,
        align: 'right',
        headerAlign: 'right',
    },
    {
      field: 'open_price',
      headerName: 'Preço abertura',
      type: 'number',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => 
        formatCurrency(value, { 
          minimumFractionDigits: 4, 
          maximumFractionDigits: 4 
        }),
    },
    {
      field: 'open_amount_eur',
      headerName: 'Custo Total (€)',
      type: 'number',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(value),
    },
    { field: 'open_currency', headerName: 'Moeda', width: 90 },
];

// Adicionado prop isLoading e NoRowsOverlay
export default function OptionHoldingsSection({ holdingsData, isLoading, NoRowsOverlay }) {

  const rows = holdingsData.map((holding, index) => ({
    id: `${holding.product_name}-${holding.open_date}-${index}`,
    ...holding
  }));
  
  const hasData = rows.length > 0;

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Posições em Opções</Typography>
      
      {isLoading && !hasData ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : (
        // CORREÇÃO FORÇADA: Usar altura fixa e desativar autoHeight quando não há dados.
        // O height deve ser suficiente para o cabeçalho da tabela + o overlay.
        <Box sx={{ width: '100%', height: hasData ? 'auto' : 300 }}> 
          <DataGrid
            rows={rows}
            columns={columns}
            loading={isLoading} 
            
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'open_amount_eur', sort: 'desc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
            slots={{ noRowsOverlay: NoRowsOverlay }} // <-- NOVO
            // Adicionar estilo inline para garantir que o DataGrid ocupa a altura total da Box quando não há dados
            sx={{ height: hasData ? 'auto' : '100%' }}
          />
        </Box>
      )}
    </Paper>
  );
}
