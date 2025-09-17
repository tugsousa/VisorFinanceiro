import React, { useState, useMemo } from 'react';
import { Typography, Paper, Box, ToggleButtonGroup, ToggleButton, Tooltip, CircularProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

// Helper functions for rendering cells
const renderUnrealizedPLCell = ({ value, row }) => {
  if (row.isFetching) { return <CircularProgress size={20} />; }
  if (typeof value !== 'number') return '';
  const textColor = value >= 0 ? 'success.main' : 'error.main';
  return (<Box sx={{ color: textColor, fontWeight: '500' }}>{formatCurrency(value)}</Box>);
};

const renderUnrealizedPLPercentageCell = ({ value, row }) => {
  if (row.isFetching) { return <CircularProgress size={20} />; }
  if (typeof value !== 'number' || isNaN(value)) return '';
  const textColor = value >= 0 ? 'success.main' : 'error.main';
  const formattedValue = `${value.toFixed(2)}%`;
  return (<Box sx={{ color: textColor, fontWeight: '500' }}>{formattedValue}</Box>);
};

const renderCurrentPriceCell = ({ value, row }) => {
  if (row.isFetching) { return <CircularProgress size={20} />; }
  if (row.status === 'UNAVAILABLE') {
    return (
      <Tooltip title="Preço atual indisponível. O valor de mercado foi estimado usando o custo de aquisição." placement="top">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, cursor: 'help' }}>
          <span>N/A</span>
          <WarningAmberIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
        </Box>
      </Tooltip>
    );
  }
  return typeof value === 'number' ? formatCurrency(value) : 'N/A';
};

const renderMarketValueCell = ({ value, row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    return typeof value === 'number' ? formatCurrency(value) : '';
};

const renderLifetimeMetricCell = ({ value }) => {
    const numValue = value || 0;
    const textColor = numValue >= 0 ? 'success.main' : 'error.main';
    return <Box sx={{ color: textColor }}>{formatCurrency(numValue)}</Box>;
};

const renderCommissionCell = ({ value }) => {
    const numValue = Math.abs(value || 0);
    // Commissions are a cost, so we show them as negative.
    return <Box sx={{ color: 'error.main' }}>{formatCurrency(-numValue)}</Box>
}

// Columns for DETAILED view (no changes)
const detailedColumns = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'isin', headerName: 'ISIN', width: 130 },
  { field: 'buy_date', headerName: 'Dt. compra', width: 110, type: 'date', valueGetter: (value) => parseDateRobust(value) },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
  { field: 'buyPrice', headerName: 'Preço (€)', type: 'number', width: 120, align: 'right', headerAlign: 'right', valueGetter: (_, row) => Math.abs(row.buyPrice || 0), valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'buy_amount_eur', headerName: 'Montante (€)', type: 'number', width: 130, align: 'right', headerAlign: 'right', valueGetter: (_, row) => Math.abs(row.buy_amount_eur || 0), valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
  { field: 'buy_currency', headerName: 'Moeda', width: 90 },
];

// Columns for GROUPED CURRENT view (with new "Comissões" column)
const groupedColumnsCurrent = [
  { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
  { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
  { field: 'total_cost_basis_eur', headerName: 'Custo Total (€)', type: 'number', width: 140, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatCurrency(value) },
  { field: 'current_price_eur', headerName: 'Preço Atual (€)', type: 'number', width: 150, align: 'right', headerAlign: 'right', renderCell: renderCurrentPriceCell },
  { field: 'marketValueEUR', headerName: 'Valor de Mercado (€)', type: 'number', width: 180, align: 'right', headerAlign: 'right', renderCell: renderMarketValueCell },
  { field: 'unrealizedPL', headerName: 'L/P Não Realizado (€)', type: 'number', width: 180, align: 'right', headerAlign: 'right', renderCell: renderUnrealizedPLCell },
  { 
    field: 'unrealizedPLPercentage', 
    headerName: 'L/P Não Realizado (%)', 
    type: 'number', 
    width: 180, 
    align: 'right', 
    headerAlign: 'right', 
    renderCell: renderUnrealizedPLPercentageCell 
  },
  { field: 'totalDividends', headerName: 'Dividendos (Total)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
  { field: 'totalRealizedStockPL', headerName: 'L/P Ações (Total)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
  { field: 'totalCommissions', headerName: 'Comissões (Total)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell },
];

// Columns for GROUPED HISTORICAL view (with new "Comissões" column)
const groupedColumnsHistorical = [
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right' },
    { field: 'total_cost_basis_eur', headerName: 'Custo Total (€)', type: 'number', width: 140, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatCurrency(value) },
    { field: 'totalDividends', headerName: 'Dividendos (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
    { field: 'totalRealizedStockPL', headerName: 'L/P Ações (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
    { field: 'totalCommissions', headerName: 'Comissões (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell },
];

export default function StockHoldingsSection({ groupedData, detailedData, isGroupedFetching, isDetailedFetching }) {
  const [viewMode, setViewMode] = useState('grouped');

  const isGroupedDataHistorical = groupedData?.[0]?.isHistorical === true;
  const groupedColumns = isGroupedDataHistorical ? groupedColumnsHistorical : groupedColumnsCurrent;

  const groupedRows = useMemo(() => {
    if (!groupedData) return [];
    return groupedData.map(item => {
        const unrealizedPL = !item.isHistorical ? (item.marketValueEUR - item.total_cost_basis_eur) : undefined;
        let unrealizedPLPercentage;
        if (unrealizedPL !== undefined && item.total_cost_basis_eur > 0) {
            unrealizedPLPercentage = (unrealizedPL / item.total_cost_basis_eur) * 100;
        } else {
            unrealizedPLPercentage = undefined;
        }

        return {
            id: item.isin,
            ...item,
            unrealizedPL,
            unrealizedPLPercentage,
            isFetching: isGroupedFetching,
        };
    });
}, [groupedData, isGroupedFetching]);

  const detailedRows = useMemo(() => {
    if (!detailedData) return [];
    // ============================ BUG FIX IS HERE ============================
    // We add a .filter(holding => holding) to safely remove any null or
    // undefined entries from the array before we try to map over it.
    return detailedData
      .filter(holding => holding)
      .map((holding, index) => ({
        id: `${holding.isin}-${holding.buy_date}-${index}`,
        ...holding,
      }));
    // =======================================================================
  }, [detailedData]);
  
  const noData = viewMode === 'grouped' 
    ? !isGroupedFetching && groupedRows.length === 0
    : !isDetailedFetching && detailedRows.length === 0;

  if (noData) {
    return (
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
        <Typography>Não existe informação disponível.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Posições em Ações</Typography>
        <ToggleButtonGroup value={viewMode} exclusive onChange={(e, newMode) => newMode && setViewMode(newMode)} size="small">
          <ToggleButton value="grouped">Agrupado</ToggleButton>
          <ToggleButton value="detailed">Detalhado</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ width: '100%' }}>
        {viewMode === 'detailed' ? (
          <DataGrid
            rows={detailedRows}
            columns={detailedColumns}
            loading={isDetailedFetching}
            autoHeight
            initialState={{ pagination: { paginationModel: { pageSize: 10 } }, sorting: { sortModel: [{ field: 'buy_date', sort: 'desc' }] } }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
          />
        ) : (
          <DataGrid
            rows={groupedRows}
            columns={groupedColumns}
            loading={isGroupedFetching}
            autoHeight
            initialState={{ pagination: { paginationModel: { pageSize: 10 } }, sorting: { sortModel: [{ field: 'marketValueEUR', sort: 'desc' }] } }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
          />
        )}
      </Box>
    </Paper>
  );
}