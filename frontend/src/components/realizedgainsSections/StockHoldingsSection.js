import React, { useState, useMemo } from 'react';
import { Typography, Paper, Box, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';

// Columns for the original, detailed view
const detailedColumns = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { 
    field: 'buy_date', 
    headerName: 'Dt. compra', 
    width: 110,
    type: 'date',
    valueGetter: (value) => parseDateRobust(value),
  },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
  {
    field: 'buyPrice',
    headerName: 'Preço (€)',
    type: 'number',
    width: 120,
    align: 'right',
    headerAlign: 'right',
    valueGetter: (_, row) => Math.abs(row.buyPrice || 0),
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  {
    field: 'buy_amount_eur',
    headerName: 'Montante (€)',
    type: 'number',
    width: 130,
    align: 'right',
    headerAlign: 'right',
    valueGetter: (_, row) => Math.abs(row.buy_amount_eur || 0),
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  { field: 'buy_currency', headerName: 'Moeda', width: 90 },
];

// Columns for the new, grouped view
const groupedColumns = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right' },
  {
    field: 'averageCostPriceEUR',
    headerName: 'Preço Médio (€)',
    type: 'number',
    width: 140,
    align: 'right',
    headerAlign: 'right',
    valueGetter: (_, row) => row.quantity > 0 ? (row.totalCostBasisEUR / row.quantity) : 0,
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
  {
    field: 'totalCostBasisEUR',
    headerName: 'Custo Total (€)',
    type: 'number',
    width: 140,
    align: 'right',
    headerAlign: 'right',
    valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '',
  },
];


export default function StockHoldingsSection({ holdingsData }) {
  const [viewMode, setViewMode] = useState('grouped'); // 'detailed' or 'grouped'

  const handleViewChange = (event, newViewMode) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const groupedData = useMemo(() => {
    if (!holdingsData) return [];

    const groupedByIsin = holdingsData.reduce((acc, holding) => {
      const { isin, product_name, quantity, buy_amount_eur, buy_date } = holding;
      if (!isin) return acc;

      if (!acc[isin]) {
        acc[isin] = {
          isin,
          product_name,
          quantity: 0,
          totalCostBasisEUR: 0,
          latestBuyDate: new Date(0),
        };
      }

      acc[isin].quantity += quantity;
      acc[isin].totalCostBasisEUR += Math.abs(buy_amount_eur || 0);

      const currentBuyDate = parseDateRobust(buy_date);
      if (currentBuyDate && currentBuyDate > acc[isin].latestBuyDate) {
        acc[isin].latestBuyDate = currentBuyDate;
        acc[isin].product_name = product_name;
      }
      
      return acc;
    }, {});

    return Object.values(groupedByIsin);
  }, [holdingsData]);


  if (!holdingsData || holdingsData.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>Sem dados de posições para mostrar no período selecionado.</Typography>
      </Paper>
    );
  }

  const detailedRows = holdingsData.map((holding, index) => ({
    id: `${holding.isin}-${holding.buy_date}-${index}`,
    ...holding,
  }));

  const groupedRows = groupedData.map((group) => ({
    id: group.isin,
    ...group,
  }));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Posições em Ações</Typography>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewChange}
          aria-label="Stock holdings view mode"
          size="small"
        >
          <ToggleButton value="grouped" aria-label="grouped view">
            Agrupado
          </ToggleButton>
          <ToggleButton value="detailed" aria-label="detailed view">
            Detalhado
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ height: 400, width: '100%' }}>
        {viewMode === 'detailed' ? (
          <DataGrid
            rows={detailedRows}
            columns={detailedColumns}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'buy_date', sort: 'desc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
          />
        ) : (
          <DataGrid
            rows={groupedRows}
            columns={groupedColumns}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'totalCostBasisEUR', sort: 'desc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            sx={{ height: 'auto' }}
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
          />
        )}
      </Box>
    </Paper>
  );
}