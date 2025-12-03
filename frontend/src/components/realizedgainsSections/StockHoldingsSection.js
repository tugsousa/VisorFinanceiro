// frontend/src/components/realizedgainsSections/StockHoldingsSection.js
import React, { useState, useMemo } from 'react';
import { 
    Typography, Paper, Box, ToggleButtonGroup, ToggleButton, Tooltip, 
    CircularProgress, Popover, Checkbox, FormControlLabel, IconButton, 
    Divider, styled, tooltipClasses 
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import SettingsIcon from '@mui/icons-material/Settings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// --- STYLED COMPONENTS (Professional Light Tooltip) ---

const LightTooltip = styled(({ className, ...props }) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: theme.palette.background.paper, // White/Paper color
    color: 'rgba(0, 0, 0, 0.87)', // Dark gray text
    boxShadow: theme.shadows[3], // Soft shadow for depth
    fontSize: 12,
    border: '1px solid #dadde9', // Subtle border
    maxWidth: 300,
  },
  [`& .${tooltipClasses.arrow}`]: {
    color: theme.palette.background.paper,
    "&:before": {
        border: "1px solid #dadde9"
    }
  },
}));

// --- TOOLTIP CONTENT COMPONENTS ---

const TooltipRow = ({ label, value, isBold = false, isTotal = false, color = null }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: isTotal ? 'bold' : 'normal' }}>
            {label}:
        </Typography>
        <Typography 
            variant="body2" 
            sx={{ 
                fontWeight: isBold || isTotal ? 'bold' : 'normal',
                color: color || 'text.primary'
            }}
        >
            {formatCurrency(value)}
        </Typography>
    </Box>
);

const RealizedGainsTooltipContent = ({ row }) => (
    <Box sx={{ p: 1, minWidth: 220 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'text.primary' }}>
            Ganhos Realizados (Fechados)
        </Typography>
        <Divider sx={{ mb: 1 }} />
        
        <TooltipRow label="L/P Ações (Vendas)" value={row.totalRealizedStockPL} color={row.totalRealizedStockPL >= 0 ? 'success.main' : 'error.main'} />
        <TooltipRow label="Dividendos" value={row.totalDividends} color="success.main" />
        <TooltipRow label="Comissões" value={-Math.abs(row.totalCommissions || 0)} color="error.main" />
        
        <Divider sx={{ my: 1 }} />
        <TooltipRow label="TOTAL LÍQUIDO" value={row.realizedGains} isTotal={true} color={row.realizedGains >= 0 ? 'success.main' : 'error.main'} />
    </Box>
);

const TotalProfitTooltipContent = ({ row }) => (
    <Box sx={{ p: 1, minWidth: 240 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'text.primary' }}>
            Lucro Total (Aberto + Fechado)
        </Typography>
        <Divider sx={{ mb: 1 }} />

        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.7rem' }}>
            Realizado
        </Typography>
        
        <TooltipRow 
            label="L/P Ações (Vendas)" 
            value={row.totalRealizedStockPL} 
            color={row.totalRealizedStockPL >= 0 ? 'success.main' : 'error.main'}
        />
        
        <TooltipRow 
            label="Dividendos" 
            value={row.totalDividends} 
            color="success.main"
        />
        
        <TooltipRow label="Comissões" value={-Math.abs(row.totalCommissions || 0)} color="error.main" />
        
        <Box sx={{ my: 1 }} />
        
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.7rem' }}>
            Não Realizado
        </Typography>
        <TooltipRow label="P/L Aberto" value={row.unrealizedPL} color={row.unrealizedPL >= 0 ? 'success.main' : 'error.main'} />

        <Divider sx={{ my: 1 }} />
        <TooltipRow label="LUCRO TOTAL" value={row.totalProfitAmount} isTotal={true} color={row.totalProfitAmount >= 0 ? 'success.main' : 'error.main'} />
    </Box>
);

// --- HELPER FUNCTIONS (Renderização de Células) ---

/**
 * Calculates the number of days between the buy date and today.
 */
const calculateDaysHeld = (buyDateStr) => {
    const buyDate = parseDateRobust(buyDateStr);
    if (!buyDate || isNaN(buyDate.getTime())) return 'N/A';
    
    const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
    const diffDays = Math.round(Math.abs((new Date() - buyDate) / oneDay));
    return diffDays;
};

// Reusable Name/Ticker cell render (for Grouped view total row only)
const renderNameTickerCell = ({ row }) => {
    if (row.isTotalRow) {
        return (
            <Typography variant="body2" sx={{ fontWeight: 'bold', textTransform: 'uppercase', pl: 1 }}>
                TOTAL
            </Typography>
        );
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Typography variant="body2">{row.product_name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.isin}</Typography>
        </Box>
    );
};

// NEW: Combined Name/Ticker cell render for DETAILED view
const renderNameTickerCellDetailed = ({ row }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Typography variant="body2">{row.product_name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.isin}</Typography>
    </Box>
);

const renderCurrentValueCombinedCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    
    if (row.isTotalRow) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(row.marketValueEUR)}
                </Typography>
            </Box>
        );
    }

    const totalValue = row.marketValueEUR;
    const currentPrice = row.current_price_eur;
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatCurrency(totalValue)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(currentPrice)}</Typography>
        </Box>
    );
};

const renderCostBasisCombinedCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    
    if (row.isTotalRow) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(row.total_cost_basis_eur)}
                </Typography>
            </Box>
        );
    }

    const totalCostBasis = row.total_cost_basis_eur;
    const costPerShare = row.costPerShare;
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatCurrency(totalCostBasis)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(costPerShare)}</Typography>
        </Box>
    );
};

// NEW: Combined Cost cell render for DETAILED view
const renderCostCombinedCellDetailed = ({ row }) => {
    // Assuming buy_amount_eur is the total cost for this transaction
    const totalCost = row.buy_amount_eur || 0;
    const costPerShare = row.quantity > 0 ? (totalCost / row.quantity) : 0;
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatCurrency(totalCost)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(costPerShare)}</Typography>
        </Box>
    );
};

// NEW: Days Held cell render
const renderDaysHeldCell = ({ value }) => {
    return (
        <Typography variant="body2" align="right">
            {value === 'N/A' ? value : `${value} dias`}
        </Typography>
    );
};

// NEW: Unrealized Gains per Transaction cell render
const renderUnrealizedGainsDetailedCell = ({ value }) => {
    const color = value >= 0 ? 'success.main' : 'error.main';
    return (
        <Typography variant="body2" align="right" sx={{ color: color, fontWeight: '500' }}>
            {formatCurrency(value)}
        </Typography>
    );
};

// Updated Render for Realized Gains using LightTooltip
const renderRealizedGainsCell = ({ value, row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    const textColor = value >= 0 ? 'success.main' : 'error.main';
    const fontWeight = row.isTotalRow ? 'bold' : '500';

    return (
        <LightTooltip title={<RealizedGainsTooltipContent row={row} />} placement="top" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, cursor: 'help', height: '100%' }}>
                <Typography variant="body2" sx={{ color: textColor, fontWeight: fontWeight }}>{formatCurrency(value)}</Typography>
                {!row.isTotalRow && <HelpOutlineIcon sx={{ fontSize: '0.9rem', color: 'text.disabled' }} />}
            </Box>
        </LightTooltip>
    );
};

const renderUnrealizedGainsCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    
    if (!row.isTotalRow && (row.isHistorical || row.unrealizedPL === undefined)) {
        return <Typography variant="body2" sx={{ color: 'text.secondary' }}>N/A</Typography>;
    }
    
    const totalAmount = row.unrealizedPL;
    const color = totalAmount >= 0 ? 'success.main' : 'error.main';

    if (row.isTotalRow) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: color }}>
                    {formatCurrency(totalAmount)}
                </Typography>
            </Box>
        );
    }

    const perShareAmount = row.quantity > 0 ? totalAmount / row.quantity : 0;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2" sx={{ color: color }}>{formatCurrency(totalAmount)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatCurrency(perShareAmount)}</Typography>
        </Box>
    );
};

// Updated Render for Total Profit using LightTooltip
const renderTotalProfitCell = ({ row }) => {
    if (row.isFetching) { return <CircularProgress size={20} />; }
    const amount = row.totalProfitAmount;
    const percent = row.totalProfitPercentage;
    const isNegative = amount < 0;
    const color = isNegative ? 'error.main' : 'success.main';
    const TrendIcon = isNegative ? TrendingDownIcon : TrendingUpIcon;
    const fontWeight = row.isTotalRow ? 'bold' : 'normal';

    return (
        <LightTooltip title={<TotalProfitTooltipContent row={row} />} placement="left" arrow>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%', cursor: 'help' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ color: color, fontWeight: fontWeight }}>
                        {formatCurrency(amount)}
                    </Typography>
                    {!row.isTotalRow && <InfoOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />}
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', color: color }}>
                    {TrendIcon && <TrendIcon sx={{ fontSize: '0.8rem', mr: 0.5 }} />}
                    <Typography variant="caption" sx={{ fontWeight: '500' }}>{percent.toFixed(2)}%</Typography>
                </Box>
            </Box>
        </LightTooltip>
    );
};

const renderLifetimeMetricCell = ({ value, row }) => {
    const numValue = value || 0;
    const textColor = numValue >= 0 ? 'success.main' : 'error.main';
    const fontWeight = row.isTotalRow ? 'bold' : 'normal';
    return <Box sx={{ color: textColor, fontWeight: fontWeight }}>{formatCurrency(numValue)}</Box>;
};

const renderCommissionCell = ({ value, row }) => {
    const numValue = Math.abs(value || 0);
    const fontWeight = row.isTotalRow ? 'bold' : 'normal';
    return <Box sx={{ color: 'error.main', fontWeight: fontWeight }}>{formatCurrency(-numValue)}</Box>
}

// --- ESTRUTURA DE COLUNAS ---

const getGroupedColumns = (hiddenCols) => {
    let columns = [
        { field: 'product_name_ticker', headerName: 'Nome / ISIN', flex: 1.5, minWidth: 200, renderCell: renderNameTickerCell },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right', valueFormatter: (val, row) => row.isTotalRow ? '' : val },
        { field: 'cost_basis_combined', headerName: 'Custo Médio', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCostBasisCombinedCell },
        { field: 'marketValueEUR_combined', headerName: 'Valor Atual', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCurrentValueCombinedCell },
    ];

    if (!hiddenCols.dividends) {
        columns.push({ field: 'totalDividends', headerName: 'Dividendos Rec.', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell });
    }
    if (!hiddenCols.commissions) {
        columns.push({ field: 'totalCommissions', headerName: 'Comissões Pagas', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell });
    }
    if (!hiddenCols.salesRealized) {
        columns.push({ field: 'totalRealizedStockPL', headerName: 'L/P Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell });
    }

    columns.push(
        { field: 'unrealizedPL', headerName: 'Ganhos Não Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderUnrealizedGainsCell },
        { field: 'realizedGains', headerName: 'Ganhos Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderRealizedGainsCell },
        { field: 'totalProfit', headerName: 'Lucro Total', type: 'number', width: 130, align: 'right', headerAlign: 'right', renderCell: renderTotalProfitCell },
    );

    return columns;
};

// UPDATED DETAILED COLUMNS
const detailedColumns = [
    // 1. Combined Name/ISIN
    { field: 'product_name_ticker', headerName: 'Nome / ISIN', flex: 1, minWidth: 200, renderCell: renderNameTickerCellDetailed },
    // 3. Days Held
    { field: 'daysHeld', headerName: 'Dias (Held)', width: 90, type: 'number', align: 'right', headerAlign: 'right', renderCell: renderDaysHeldCell },
    { field: 'buy_date', headerName: 'Data Compra', width: 110, type: 'date', valueGetter: (value) => parseDateRobust(value) },
    { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
    // 2. Combined Cost (Custo Total + @Preço)
    { field: 'cost_combined', headerName: 'Custo', type: 'number', width: 130, align: 'right', headerAlign: 'right', renderCell: renderCostCombinedCellDetailed },
    // 4. Unrealized Gains per Transaction
    { field: 'unrealizedGainTransaction', headerName: 'Ganhos Não Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderUnrealizedGainsDetailedCell },
    { field: 'buy_currency', headerName: 'Moeda', width: 90 },
    // Removed: buyPrice and buy_amount_eur (merged into 'cost_combined')
];

export default function StockHoldingsSection({ groupedData, detailedData, isGroupedFetching, isDetailedFetching, NoRowsOverlay }) {
    const [viewMode, setViewMode] = useState('grouped');
    
    const [hiddenColumns, setHiddenColumns] = useState({
        dividends: true,
        commissions: true,
        salesRealized: true,
    });
    const [anchorEl, setAnchorEl] = useState(null);

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

    // 2. Colunas Agrupadas
    const isGroupedDataHistorical = groupedData?.[0]?.isHistorical === true;
    const groupedColumnsHistorical = [
        { field: 'product_name_ticker', headerName: 'Nome / Ticker', flex: 1.5, minWidth: 200, renderCell: renderNameTickerCell },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right', valueFormatter: (val, row) => row.isTotalRow ? '' : val },
        { field: 'total_cost_basis_eur', headerName: 'Custo Total (€)', type: 'number', width: 140, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatCurrency(value), renderCell: (params) => params.row.isTotalRow ? <Box sx={{fontWeight: 'bold'}}>{formatCurrency(params.value)}</Box> : formatCurrency(params.value) },
        { field: 'totalDividends', headerName: 'Dividendos (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
        { field: 'totalRealizedStockPL', headerName: 'L/P Ações (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
        { field: 'totalCommissions', headerName: 'Comissões (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell },
    ];
    
    const finalGroupedColumns = isGroupedDataHistorical ? groupedColumnsHistorical : getGroupedColumns(hiddenColumns);

    // 3. Cálculo das Linhas Agrupadas + Linha de TOTAL
    const rowsWithTotal = useMemo(() => {
        if (!groupedData || groupedData.length === 0) return [];

        const standardRows = groupedData.map(item => {
            const costPerShare = item.quantity > 0 ? item.total_cost_basis_eur / item.quantity : 0;
            const realizedGains = (item.totalDividends || 0) + (item.totalRealizedStockPL || 0) - Math.abs(item.totalCommissions || 0);
            const unrealizedPL = !item.isHistorical ? (item.marketValueEUR - item.total_cost_basis_eur) : 0;
            
            let unrealizedPLPercentage = 0;
            if (unrealizedPL !== 0 && item.total_cost_basis_eur > 0) {
                unrealizedPLPercentage = (unrealizedPL / item.total_cost_basis_eur) * 100;
            }

            const totalProfitAmount = unrealizedPL + realizedGains;
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
                isTotalRow: false,
            };
        });

        // Calcular Totais
        const totals = standardRows.reduce((acc, row) => {
            return {
                total_cost_basis_eur: acc.total_cost_basis_eur + (row.total_cost_basis_eur || 0),
                marketValueEUR: acc.marketValueEUR + (row.marketValueEUR || 0),
                totalDividends: acc.totalDividends + (row.totalDividends || 0),
                totalCommissions: acc.totalCommissions + (row.totalCommissions || 0),
                totalRealizedStockPL: acc.totalRealizedStockPL + (row.totalRealizedStockPL || 0),
                realizedGains: acc.realizedGains + (row.realizedGains || 0),
                unrealizedPL: acc.unrealizedPL + (row.unrealizedPL || 0),
                totalProfitAmount: acc.totalProfitAmount + (row.totalProfitAmount || 0),
            };
        }, {
            total_cost_basis_eur: 0,
            marketValueEUR: 0,
            totalDividends: 0,
            totalCommissions: 0,
            totalRealizedStockPL: 0,
            realizedGains: 0,
            unrealizedPL: 0,
            totalProfitAmount: 0
        });

        // Calcular percentagem global
        const totalProfitPercentage = totals.total_cost_basis_eur > 0 
            ? (totals.totalProfitAmount / totals.total_cost_basis_eur) * 100 
            : 0;

        const totalRow = {
            id: 'TOTAL_SUMMARY_ROW',
            product_name_ticker: 'TOTAL',
            isin: '',
            isTotalRow: true,
            quantity: null,
            ...totals,
            totalProfitPercentage,
            isFetching: isGroupedFetching
        };

        return [...standardRows, totalRow];

    }, [groupedData, isGroupedFetching, isGroupedDataHistorical]);


    // UPDATED DETAILED ROWS CALCULATION
    const detailedRows = useMemo(() => {
        if (!detailedData) return [];
        return detailedData
            .filter(holding => holding)
            .map((holding, index) => {
                const id = `${holding.isin}-${holding.buy_date}-${index}`;
                
                // 3. Days Held
                const daysHeld = calculateDaysHeld(holding.buy_date);

                // 4. Unrealized Gains per Transaction
                const currentPriceEUR = holding.current_price_eur || 0;
                // Calculate buy price in EUR per share from total amount
                const buyPriceEUR = holding.quantity > 0 ? (holding.buy_amount_eur / holding.quantity) : 0; 
                
                // Unrealized Gain = (Current Price - Buy Price) * Quantity
                const unrealizedGainTransaction = (currentPriceEUR - buyPriceEUR) * holding.quantity;

                return {
                    id,
                    ...holding,
                    daysHeld,
                    unrealizedGainTransaction,
                };
            });
    }, [detailedData]);
    // END UPDATED DETAILED ROWS CALCULATION

    const noData = viewMode === 'grouped'
        ? !isGroupedFetching && rowsWithTotal.length === 0
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
            
            <Popover
                open={isSettingsOpen}
                anchorEl={anchorEl}
                onClose={handleSettingsClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Colunas Opcionais</Typography>
                    <FormControlLabel
                        control={<Checkbox checked={!hiddenColumns.dividends} onChange={() => handleToggleColumn('dividends')} />}
                        label="Dividendos Recebidos"
                    />
                    <FormControlLabel
                        control={<Checkbox checked={!hiddenColumns.commissions} onChange={() => handleToggleColumn('commissions')} />}
                        label="Comissões Pagas"
                    />
                    <FormControlLabel
                        control={<Checkbox checked={!hiddenColumns.salesRealized} onChange={() => handleToggleColumn('salesRealized')} />}
                        label="L/P Realizados (Vendas)"
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
                        rows={rowsWithTotal}
                        columns={finalGroupedColumns}
                        loading={isGroupedFetching}
                        autoHeight
                        initialState={{ 
                            pagination: { paginationModel: { pageSize: 25 } }, 
                            sorting: { sortModel: [{ field: 'marketValueEUR_combined', sort: 'desc' }] } 
                        }}
                        pageSizeOptions={[10, 25, 50]}
                        disableRowSelectionOnClick
                        localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                        slots={{ noRowsOverlay: NoRowsOverlay }}
                        getRowClassName={(params) => 
                            params.row.isTotalRow ? 'total-summary-row' : ''
                        }
                        sx={{
                            '& .total-summary-row': {
                                bgcolor: '#f5f5f5',
                                fontWeight: 'bold',
                                position: 'sticky',
                                bottom: 0,
                                zIndex: 1,
                                borderTop: '2px solid #e0e0e0',
                                '&:hover': {
                                    bgcolor: '#eeeeee',
                                }
                            },
                            '& .total-summary-row .MuiDataGrid-cell': {
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                            }
                        }}
                    />
                )}
            </Box>
        </Paper>
    );
}