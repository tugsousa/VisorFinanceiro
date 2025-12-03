import React, { useState, useMemo } from 'react';
import { Typography, Paper, Box, ToggleButtonGroup, ToggleButton, Tooltip, CircularProgress, Popover, Checkbox, FormControlLabel, IconButton, Divider } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils'; // Assumindo que esta função é equivalente ao formatCurrency anterior
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SettingsIcon from '@mui/icons-material/Settings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

// --- HELPER FUNCTIONS (Renderização de Células) ---

// Renderiza Lucro/Prejuízo Não Realizado
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

// Renderiza Preço Atual (com lógica de N/A e aviso)
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

// Renderiza Montante de Custo/Valor de Mercado
const renderMarketValueCell = ({ value, row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    return typeof value === 'number' ? formatCurrency(value) : '';
};

// Renderiza Métricas Históricas (Dividendos, L/P Ações)
const renderLifetimeMetricCell = ({ value }) => {
    const numValue = value || 0;
    const textColor = numValue >= 0 ? 'success.main' : 'error.main';
    return <Box sx={{ color: textColor }}>{formatCurrency(numValue)}</Box>;
};

// Renderiza Comissões (sempre negativo)
const renderCommissionCell = ({ value }) => {
    const numValue = Math.abs(value || 0);
    return <Box sx={{ color: 'error.main' }}>{formatCurrency(-numValue)}</Box>
}

// --- NOVAS FUNÇÕES DE RENDERIZAÇÃO PARA COLUNAS CUSTOMIZADAS ---

// 1. Nome/Ticker (Atualizado: Removido o bold do nome do produto)
const renderNameTickerCell = ({ row }) => {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Typography variant="body2">{row.product_name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.isin}</Typography>
        </Box>
    );
};

// 2. Current Value (Valor Total + Preço da Ação) (Atualizado: Removido o bold do valor total)
const renderCurrentValueCombinedCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    const totalValue = row.marketValueEUR;
    const currentPrice = row.current_price_eur;
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatCurrency(totalValue)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(currentPrice)}</Typography>
        </Box>
    );
};

// 3. Cost Basis (Custo Total + Custo por Ação) (NOVA FUNÇÃO: Agrupamento)
const renderCostBasisCombinedCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    const totalCostBasis = row.total_cost_basis_eur;
    const costPerShare = row.costPerShare;
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {/* Montante de Custo Total (Cost Basis) */}
            <Typography variant="body2">{formatCurrency(totalCostBasis)}</Typography>
            {/* Preço por Ação (Cost Per Share) */}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(costPerShare)}</Typography>
        </Box>
    );
};

// 4. Realized Gains (Líquido) com Tooltip Detalhada (Mantida)
const RealizedGainsTooltipContent = ({ row }) => (
    <Box sx={{ p: 1, minWidth: 200 }}>
        <Typography variant="subtitle2" gutterBottom>Ganhos Realizados (Detalhe)</Typography>
        <Divider sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2">Dividendos:</Typography>
            <Typography variant="body2" color="success.main">{formatCurrency(row.totalDividends || 0)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2">L/P Ações:</Typography>
            <Typography variant="body2">{formatCurrency(row.totalRealizedStockPL || 0)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2">Comissões:</Typography>
            <Typography variant="body2" color="error.main">{formatCurrency(-Math.abs(row.totalCommissions || 0))}</Typography>
        </Box>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>TOTAL LÍQUIDO:</Typography>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }} color={row.realizedGains >= 0 ? 'success.main' : 'error.main'}>
                {formatCurrency(row.realizedGains)}
            </Typography>
        </Box>
    </Box>
);

const renderRealizedGainsCell = ({ value, row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    const textColor = value >= 0 ? 'success.main' : 'error.main';

    return (
        <Tooltip title={<RealizedGainsTooltipContent row={row} />} placement="top" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, cursor: 'help' }}>
                <Typography variant="body2" sx={{ color: textColor, fontWeight: '500' }}>{formatCurrency(value)}</Typography>
                <HelpOutlineIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
            </Box>
        </Tooltip>
    );
};

// 5. Unrealized Gains (Montante Total + Diferença por Ação)
const renderUnrealizedGainsCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    if (row.isHistorical || row.unrealizedPL === undefined) {
        return <Typography variant="body2" sx={{ color: 'text.secondary' }}>N/A</Typography>;
    }
    
    const totalAmount = row.unrealizedPL;
    const perShareAmount = row.quantity > 0 ? totalAmount / row.quantity : 0;
    const color = totalAmount >= 0 ? 'success.main' : 'error.main';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2" sx={{ color: color }}>{formatCurrency(totalAmount)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatCurrency(perShareAmount)}</Typography>
        </Box>
    );
};

// 6. Total Profit (Montante + Percentagem) (Atualizado: Removido o bold e aplicado cor ao montante)
const renderTotalProfitCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    const amount = row.totalProfitAmount;
    const percent = row.totalProfitPercentage;
    const isNegative = amount < 0;
    const color = isNegative ? 'error.main' : 'success.main';
    const TrendIcon = isNegative ? TrendingDownIcon : TrendingUpIcon;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {/* Montante sem bold, com cor */}
            <Typography variant="body2" sx={{ color: color }}>{formatCurrency(amount)}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', color: color }}>
                {TrendIcon && <TrendIcon sx={{ fontSize: '1rem', mr: 0.5 }} />}
                <Typography variant="caption" sx={{ fontWeight: '500' }}>{percent.toFixed(2)}%</Typography>
            </Box>
        </Box>
    );
};

// --- ESTRUTURA DE COLUNAS CUSTOMIZADAS (GROUPED VIEW) ---

const getGroupedColumns = (hiddenCols) => {
    // Colunas BASE (Obrigatórias)
    let columns = [
        { field: 'product_name_ticker', headerName: 'Nome / ISIN', flex: 1.5, minWidth: 200, renderCell: renderNameTickerCell },
        { field: 'quantity', headerName: 'Shares', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
        // Coluna combinada para Cost Basis (Custo Total + Custo por Ação)
        { field: 'cost_basis_combined', headerName: 'Cost Basis', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCostBasisCombinedCell },
        { field: 'marketValueEUR_combined', headerName: 'Current Value', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCurrentValueCombinedCell },
    ];

    // Colunas Opcionais (visibilidade controlada pelo estado)
    if (!hiddenCols.dividends) {
        columns.push({ field: 'totalDividends', headerName: 'Dividendos Rec.', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell });
    }
    if (!hiddenCols.commissions) {
        columns.push({ field: 'totalCommissions', headerName: 'Comissões Pagas', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell });
    }
    if (!hiddenCols.salesRealized) {
        columns.push({ field: 'totalRealizedStockPL', headerName: 'Ganhos C/V', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell });
    }

    // Colunas FINAIS (Obrigatórias)
    columns.push(
        { field: 'unrealizedPL', headerName: 'Unrealized Gains', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderUnrealizedGainsCell },
        { field: 'realizedGains', headerName: 'Realized Gains', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderRealizedGainsCell },
        { field: 'totalProfit', headerName: 'Total Profit', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderTotalProfitCell },
    );

    return columns;
};

// Columns for DETAILED view (Mantidas, mas adaptadas ligeiramente para o novo formato)
const detailedColumns = [
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'isin', headerName: 'ISIN', width: 130 },
    { field: 'buy_date', headerName: 'Dt. compra', width: 110, type: 'date', valueGetter: (value) => parseDateRobust(value) },
    { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
    { field: 'buyPrice', headerName: 'Preço (€)', type: 'number', width: 120, align: 'right', headerAlign: 'right', valueGetter: (_, row) => Math.abs(row.buyPrice || 0), valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'buy_amount_eur', headerName: 'Montante (€)', type: 'number', width: 130, align: 'right', headerAlign: 'right', valueGetter: (_, row) => Math.abs(row.buy_amount_eur || 0), valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'buy_currency', headerName: 'Moeda', width: 90 },
];


export default function StockHoldingsSection({ groupedData, detailedData, isGroupedFetching, isDetailedFetching, NoRowsOverlay }) {
    const [viewMode, setViewMode] = useState('grouped');
    
    // 1. Estado para Colunas Opcionais (Omissas por defeito)
    const [hiddenColumns, setHiddenColumns] = useState({
        dividends: true,
        commissions: true,
        salesRealized: true,
    });
    const [anchorEl, setAnchorEl] = useState(null); // Para o Popover de configurações

    const handleSettingsClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleSettingsClose = () => {
        setAnchorEl(null);
    };

    const handleToggleColumn = (key) => {
        setHiddenColumns(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const isSettingsOpen = Boolean(anchorEl);

    // 2. Colunas Agrupadas (Agora usa a função getGroupedColumns)
    // Para a vista agrupada histórica, mantemos as colunas antigas (que já não incluem L/P Não Realizado)
    const isGroupedDataHistorical = groupedData?.[0]?.isHistorical === true;
    const groupedColumnsHistorical = [ // Mantidas do código antigo, mas o resto será customizado
        { field: 'product_name_ticker', headerName: 'Nome / Ticker', flex: 1.5, minWidth: 200, renderCell: renderNameTickerCell },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right' },
        { field: 'total_cost_basis_eur', headerName: 'Custo Total (€)', type: 'number', width: 140, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatCurrency(value) },
        { field: 'totalDividends', headerName: 'Dividendos (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
        { field: 'totalRealizedStockPL', headerName: 'L/P Ações (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
        { field: 'totalCommissions', headerName: 'Comissões (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell },
    ];
    
    const finalGroupedColumns = isGroupedDataHistorical ? groupedColumnsHistorical : getGroupedColumns(hiddenColumns);

    // 3. Cálculo das Linhas Agrupadas (Adiciona as novas métricas)
    const groupedRows = useMemo(() => {
        if (!groupedData) return [];
        return groupedData.map(item => {
            // Métrica: Cost Per Share
            const costPerShare = item.quantity > 0 ? item.total_cost_basis_eur / item.quantity : 0;
            
            // Métrica: Realized Gains (Soma de dividendos, C/V ações - comissões)
            const realizedGains = (item.totalDividends || 0) + (item.totalRealizedStockPL || 0) - Math.abs(item.totalCommissions || 0);

            // Métrica: Lucro/Prejuízo Não Realizado (existente, mas importante para Total Profit)
            const unrealizedPL = !item.isHistorical ? (item.marketValueEUR - item.total_cost_basis_eur) : undefined;
            let unrealizedPLPercentage;
            if (unrealizedPL !== undefined && item.total_cost_basis_eur > 0) {
                unrealizedPLPercentage = (unrealizedPL / item.total_cost_basis_eur) * 100;
            } else {
                unrealizedPLPercentage = undefined;
            }

            // Métrica: Total Profit (Montante e %)
            const totalProfitAmount = unrealizedPL !== undefined ? (unrealizedPL + realizedGains) : realizedGains;
            const totalProfitPercentage = (item.total_cost_basis_eur > 0) ? (totalProfitAmount / item.total_cost_basis_eur) * 100 : 0;

            

            return {
                id: item.isin,
                ...item,
                costPerShare,
                realizedGains,
                totalProfitAmount,
                totalProfitPercentage,
                unrealizedPL,
                unrealizedPLPercentage,
                isFetching: isGroupedFetching,
            };
        });
    }, [groupedData, isGroupedFetching, isGroupedDataHistorical]);


    const detailedRows = useMemo(() => {
        if (!detailedData) return [];
        return detailedData
            .filter(holding => holding)
            .map((holding, index) => ({
                id: `${holding.isin}-${holding.buy_date}-${index}`,
                ...holding,
            }));
    }, [detailedData]);

    const noData = viewMode === 'grouped'
        ? !isGroupedFetching && groupedRows.length === 0
        : !isDetailedFetching && detailedRows.length === 0;

    if (noData && !isGroupedFetching && !isDetailedFetching) {
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
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    
                    {/* Botão de Configuração de Colunas */}
                    <IconButton 
                        aria-label="configurar colunas" 
                        onClick={handleSettingsClick} 
                        sx={{ mr: 1.5, color: 'text.secondary' }}
                    >
                        <SettingsIcon />
                    </IconButton>

                    <ToggleButtonGroup value={viewMode} exclusive onChange={(e, newMode) => newMode && setViewMode(newMode)} size="small">
                        <ToggleButton value="grouped">Agrupado</ToggleButton>
                        <ToggleButton value="detailed">Detalhado</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            </Box>
            
            {/* Popover de Configuração de Colunas */}
            <Popover
                open={isSettingsOpen}
                anchorEl={anchorEl}
                onClose={handleSettingsClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Colunas Opcionais</Typography>
                    <FormControlLabel
                        control={<Checkbox checked={!hiddenColumns.dividends} onChange={() => handleToggleColumn('dividends')} />}
                        label="Montante recebido em dividendos"
                    />
                    <FormControlLabel
                        control={<Checkbox checked={!hiddenColumns.commissions} onChange={() => handleToggleColumn('commissions')} />}
                        label="Montante pago em comissões"
                    />
                    <FormControlLabel
                        control={<Checkbox checked={!hiddenColumns.salesRealized} onChange={() => handleToggleColumn('salesRealized')} />}
                        label="Montante realizado de compra e venda de ações"
                    />
                </Box>
            </Popover>

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
                        slots={{ noRowsOverlay: NoRowsOverlay }}
                    />
                ) : (
                    <DataGrid
                        rows={groupedRows}
                        columns={finalGroupedColumns}
                        loading={isGroupedFetching}
                        autoHeight
                        initialState={{ pagination: { paginationModel: { pageSize: 10 } }, sorting: { sortModel: [{ field: 'marketValueEUR_combined', sort: 'desc' }] } }}
                        pageSizeOptions={[10, 25, 50]}
                        disableRowSelectionOnClick
                        localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                        slots={{ noRowsOverlay: NoRowsOverlay }}
                    />
                )}
            </Box>
        </Paper>
    );
}