import React, { useState, useMemo } from 'react';
import { Typography, Paper, Box, ToggleButtonGroup, ToggleButton, Tooltip, CircularProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';
import { useQuery } from '@tanstack/react-query';
// MODIFICAÇÃO: Apenas precisamos de um endpoint para a vista agrupada, e outro para a detalhada
import { apiFetchCurrentHoldingsValue, apiFetchStockHoldings } from '../../api/apiService';
import { formatCurrency } from '../../utils/formatUtils';

// Helper functions (sem alterações)
const renderUnrealizedPLCell = (params) => {
  const { value, isFetching } = params;
  if (isFetching) { return <CircularProgress size={20} />; }
  if (typeof value !== 'number') return '';
  const textColor = value >= 0 ? 'success.main' : 'error.main';
  return (<Box sx={{ color: textColor, fontWeight: '500' }}>{formatCurrency(value)}</Box>);
};

const renderMarketValueCell = (params) => {
  const { value, status, isFetching } = params;
  if (isFetching) { return <CircularProgress size={20} />; }
  if (typeof value !== 'number') return '';
  const formattedValue = formatCurrency(value);
  if (status === 'UNAVAILABLE') {
    return (<Tooltip title="Preço atual indisponível. A usar o valor de compra." placement="top"><span>{`${formattedValue} *`}</span></Tooltip>);
  }
  return formattedValue;
};

// Colunas para a vista DETALHADA
const detailedColumns = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { field: 'buy_date', headerName: 'Dt. compra', width: 110, type: 'date', valueGetter: (value) => parseDateRobust(value) },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
  { field: 'buyPrice', headerName: 'Preço (€)', type: 'number', width: 120, align: 'right', headerAlign: 'right', valueGetter: (_, row) => Math.abs(row.buyPrice || 0), valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'buy_amount_eur', headerName: 'Montante (€)', type: 'number', width: 130, align: 'right', headerAlign: 'right', valueGetter: (_, row) => Math.abs(row.buy_amount_eur || 0), valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'buy_currency', headerName: 'Moeda', width: 90 },
];

// Colunas para a vista AGRUPADA
const groupedColumns = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right' },
  { field: 'total_cost_basis_eur', headerName: 'Custo Total (€)', type: 'number', width: 140, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatCurrency(value) },
  { field: 'marketValueEUR', headerName: 'Valor de Mercado (€)', type: 'number', width: 180, align: 'right', headerAlign: 'right',
    renderCell: (params) => renderMarketValueCell({ value: params.value, status: params.row.status, isFetching: params.row.isFetching })
  },
  { field: 'unrealizedPL', headerName: 'L/P Não Realizado (€)', type: 'number', width: 180, align: 'right', headerAlign: 'right',
    renderCell: (params) => renderUnrealizedPLCell({ value: params.value, isFetching: params.row.isFetching })
  },
];


export default function StockHoldingsSection() {
  const [viewMode, setViewMode] = useState('grouped');

  // Query para a vista AGRUPADA - chama o endpoint que faz todo o trabalho
  const { data: groupedDataFromApi, isFetching: isGroupedFetching } = useQuery({
    queryKey: ['currentHoldingsValue'],
    queryFn: async () => (await apiFetchCurrentHoldingsValue()).data || [],
    enabled: viewMode === 'grouped', // Só é executada quando esta vista está ativa
  });

  // Query para a vista DETALHADA - chama o endpoint que devolve os lotes individuais
  const { data: detailedDataFromApi, isFetching: isDetailedFetching } = useQuery({
    queryKey: ['stockHoldings'],
    queryFn: async () => (await apiFetchStockHoldings()).data || [],
    enabled: viewMode === 'detailed', // Só é executada quando esta vista está ativa
  });

  const handleViewChange = (event, newViewMode) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };
  
  // Prepara as linhas para a tabela AGRUPADA
  const groupedRows = useMemo(() => {
    if (!groupedDataFromApi) return [];
    return groupedDataFromApi.map(item => ({
      id: item.isin,
      ...item,
      marketValueEUR: item.market_value_eur,
      unrealizedPL: item.market_value_eur + item.total_cost_basis_eur,
      isFetching: isGroupedFetching,
    }));
  }, [groupedDataFromApi, isGroupedFetching]);

  // Prepara as linhas para a tabela DETALHADA
  const detailedRows = useMemo(() => {
    if (!detailedDataFromApi) return [];
    return detailedDataFromApi.map((holding, index) => ({
      id: `${holding.isin}-${holding.buy_date}-${index}`,
      ...holding,
    }));
  }, [detailedDataFromApi]);
  
  const noData = viewMode === 'grouped' 
    ? !isGroupedFetching && groupedRows.length === 0
    : !isDetailedFetching && detailedRows.length === 0;

  if (noData) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>Sem dados de posições para mostrar.</Typography>
      </Paper>
    );
  }

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
          <ToggleButton value="grouped" aria-label="grouped view">Agrupado</ToggleButton>
          <ToggleButton value="detailed" aria-label="detailed view">Detalhado</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ height: 400, width: '100%' }}>
        {viewMode === 'detailed' ? (
          <DataGrid
            rows={detailedRows}
            columns={detailedColumns}
            loading={isDetailedFetching}
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
            loading={isGroupedFetching}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'marketValueEUR', sort: 'desc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
          />
        )}
      </Box>
    </Paper>
  );
}