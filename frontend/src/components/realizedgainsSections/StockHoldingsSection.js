import React, { useState, useMemo } from 'react';
import { Typography, Paper, Box, ToggleButtonGroup, ToggleButton, Tooltip, CircularProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';
import { useQuery } from '@tanstack/react-query';
import { apiFetchCurrentHoldingsValue } from '../../api/apiService';
import { formatCurrency } from '../../utils/formatUtils';

// Helper function to render the Unrealized P/L cell with color coding
const renderUnrealizedPLCell = (params) => {
  const { value, isFetching } = params;
  if (isFetching) {
    return <CircularProgress size={20} />;
  }
  if (typeof value !== 'number') return '';

  const textColor = value >= 0 ? 'success.main' : 'error.main';
  return (
    <Box sx={{ color: textColor, fontWeight: '500' }}>
      {formatCurrency(value)}
    </Box>
  );
};

// Helper function to render the Market Value cell with loading state and tooltip
const renderMarketValueCell = (params) => {
  const { value, status, isFetching } = params;
  if (isFetching) {
    return <CircularProgress size={20} />;
  }
  if (typeof value !== 'number') return '';

  const formattedValue = formatCurrency(value);

  if (status === 'UNAVAILABLE') {
    return (
      <Tooltip title="Preço atual indisponível. A usar o valor de compra." placement="top">
        <span>{`${formattedValue} *`}</span>
      </Tooltip>
    );
  }
  return formattedValue;
};


// Columns for the detailed view (unchanged)
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

export default function StockHoldingsSection({ holdingsData }) {
  const [viewMode, setViewMode] = useState('grouped');

  const { data: liveData, isFetching: isLivePriceFetching } = useQuery({
    queryKey: ['currentHoldingsValue'],
    queryFn: apiFetchCurrentHoldingsValue,
    select: (response) => {
      const liveDataMap = new Map();
      if (response.data) {
        response.data.forEach(item => {
          // --- MODIFICAÇÃO PRINCIPAL AQUI ---
          // Usar 'item.isin' e 'item.status' (minúsculas) para corresponder à resposta JSON da API.
          liveDataMap.set(item.isin, {
            marketValue: item.market_value_eur,
            status: item.status,
          });
        });
      }
      return liveDataMap;
    },
    enabled: !!holdingsData && holdingsData.length > 0,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

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

    return Object.values(groupedByIsin).map(group => {
      const liveInfo = liveData?.get(group.isin);
      const marketValueEUR = liveInfo?.marketValue ?? group.totalCostBasisEUR;
      const unrealizedPL = marketValueEUR - group.totalCostBasisEUR;
      
      return {
        ...group,
        marketValueEUR,
        unrealizedPL,
        priceStatus: liveInfo?.status ?? 'UNAVAILABLE',
      };
    });
  }, [holdingsData, liveData]);

  const groupedColumns = [
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'isin', headerName: 'ISIN', width: 130 },
    { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right' },
    {
      field: 'totalCostBasisEUR',
      headerName: 'Custo Total (€)',
      type: 'number',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'marketValueEUR',
      headerName: 'Valor de Mercado (€)',
      type: 'number',
      width: 180,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => renderMarketValueCell({
        value: params.value,
        status: params.row.priceStatus,
        isFetching: isLivePriceFetching
      }),
    },
    {
      field: 'unrealizedPL',
      headerName: 'L/P Não Realizado (€)',
      type: 'number',
      width: 180,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => renderUnrealizedPLCell({
        value: params.value,
        isFetching: isLivePriceFetching
      }),
    },
  ];

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
              sorting: { sortModel: [{ field: 'marketValueEUR', sort: 'desc' }] },
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