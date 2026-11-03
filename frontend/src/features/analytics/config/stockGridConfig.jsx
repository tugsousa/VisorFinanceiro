// src/features/analytics/config/stockGridConfig.js
import React from 'react';
import { Box, Typography, CircularProgress, Tooltip, Divider, styled, tooltipClasses } from '@mui/material';
import { gridNumberComparator, gridStringOrNumberComparator } from '@mui/x-data-grid';
import { formatCurrency, formatQuantity } from 'lib/utils/formatUtils';
import { parseDateRobust } from 'lib/utils/dateUtils';
import { ALL_YEARS_OPTION } from 'constants';

// Icons
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// --- STYLED COMPONENTS & HELPERS ---

const LightTooltip = styled(({ className, ...props }) => (
    <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
    [`& .${tooltipClasses.tooltip}`]: {
        backgroundColor: theme.palette.background.paper,
        color: 'rgba(0, 0, 0, 0.87)',
        boxShadow: theme.shadows[3],
        fontSize: 12,
        border: '1px solid #dadde9',
        maxWidth: 300,
    },
    [`& .${tooltipClasses.arrow}`]: {
        color: theme.palette.background.paper,
        "&:before": { border: "1px solid #dadde9" }
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
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.7rem' }}>Realizado</Typography>
        <TooltipRow label="L/P Ações (Vendas)" value={row.totalRealizedStockPL} color={row.totalRealizedStockPL >= 0 ? 'success.main' : 'error.main'} />
        <TooltipRow label="Dividendos" value={row.totalDividends} color="success.main" />
        <TooltipRow label="Comissões" value={-Math.abs(row.totalCommissions || 0)} color="error.main" />
        <Box sx={{ my: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.7rem' }}>Não Realizado</Typography>
        <TooltipRow label="P/L Aberto" value={row.unrealizedPL || 0} color={(row.unrealizedPL || 0) >= 0 ? 'success.main' : 'error.main'} />
        <Divider sx={{ my: 1 }} />
        <TooltipRow label="LUCRO TOTAL" value={row.totalProfitAmount} isTotal={true} color={row.totalProfitAmount >= 0 ? 'success.main' : 'error.main'} />
    </Box>
);

// --- CELL RENDERERS ---

const CostAsValueCell = ({ value }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
        <Tooltip title="Preço indisponível — a mostrar o custo como referência">
            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{formatCurrency(value)}</Typography>
        </Tooltip>
    </Box>
);

const NotAvailableCell = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>N/A</Typography>
    </Box>
);

const renderNameTickerCell = (params) => {
    if (params.row.isTotalRow) {
        return <Typography variant="body2" sx={{ fontWeight: 'bold', textTransform: 'uppercase', pl: 1 }}>TOTAL</Typography>;
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Typography variant="body2">{params.row.product_name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{params.row.isin}</Typography>
        </Box>
    );
};

const renderNameTickerCellDetailed = (params) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Typography variant="body2">{params.row.product_name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{params.row.isin}</Typography>
    </Box>
);

const renderCostBasisCombinedCell = (params) => {
    if (params.row.isFetching) return <CircularProgress size={20} />;
    if (params.row.isTotalRow) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatCurrency(params.row.total_cost_basis_eur)}</Typography>
            </Box>
        );
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatCurrency(params.row.total_cost_basis_eur)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(params.row.costPerShare)}</Typography>
        </Box>
    );
};

const renderCurrentValueCombinedCell = (params) => {
    if (params.row.isFetching) return <CircularProgress size={20} />;
    if (params.row.isTotalRow) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatCurrency(params.row.marketValueEUR)}</Typography>
            </Box>
        );
    }
    if (params.row.priceUnavailable) return <CostAsValueCell value={params.row.marketValueEUR} />;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatCurrency(params.row.marketValueEUR)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(params.row.current_price_eur)}</Typography>
        </Box>
    );
};

const renderLifetimeMetricCell = (params) => {
    const numValue = params.value || 0;
    const textColor = numValue >= 0 ? 'success.main' : 'error.main';
    const fontWeight = params.row.isTotalRow ? 'bold' : 'normal';
    return <Box sx={{ color: textColor, fontWeight }}>{formatCurrency(numValue)}</Box>;
};

const renderCommissionCell = (params) => {
    const numValue = Math.abs(params.value || 0);
    const fontWeight = params.row.isTotalRow ? 'bold' : 'normal';
    return <Box sx={{ color: 'error.main', fontWeight }}>{formatCurrency(-numValue)}</Box>;
};

const renderUnrealizedGainsCell = (params) => {
    if (params.row.isFetching) return <CircularProgress size={20} />;
    if (!params.row.isTotalRow && (params.row.isHistorical || params.row.unrealizedPL === undefined)) {
        return <Typography variant="body2" sx={{ color: 'text.secondary' }}>N/A</Typography>;
    }
    
    const totalAmount = params.row.unrealizedPL;
    const color = totalAmount >= 0 ? 'success.main' : 'error.main';

    if (params.row.isTotalRow) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color }}>{formatCurrency(totalAmount)}</Typography>
            </Box>
        );
    }

    const perShareAmount = params.row.quantity > 0 ? totalAmount / params.row.quantity : 0;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2" sx={{ color }}>{formatCurrency(totalAmount)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatCurrency(perShareAmount)}</Typography>
        </Box>
    );
};

const renderRealizedGainsCell = (params) => {
    if (params.row.isFetching) return <CircularProgress size={20} />;
    const value = params.value;
    const textColor = value >= 0 ? 'success.main' : 'error.main';
    const fontWeight = params.row.isTotalRow ? 'bold' : '500';

    return (
        <LightTooltip title={<RealizedGainsTooltipContent row={params.row} />} placement="top" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, cursor: 'help', height: '100%' }}>
                <Typography variant="body2" sx={{ color: textColor, fontWeight }}>{formatCurrency(value)}</Typography>
                {!params.row.isTotalRow && <HelpOutlineIcon sx={{ fontSize: '0.9rem', color: 'text.disabled' }} />}
            </Box>
        </LightTooltip>
    );
};

const renderTotalProfitCell = (params) => {
    if (params.row.isFetching) return <CircularProgress size={20} />;
    const amount = params.row.totalProfitAmount;
    const percent = params.row.totalProfitPercentage;
    const isNegative = amount < 0;
    const color = isNegative ? 'error.main' : 'success.main';
    const TrendIcon = isNegative ? TrendingDownIcon : TrendingUpIcon;
    const fontWeight = params.row.isTotalRow ? 'bold' : 'normal';

    return (
        <LightTooltip title={<TotalProfitTooltipContent row={params.row} />} placement="left" arrow>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%', cursor: 'help' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ color, fontWeight }}>{formatCurrency(amount)}</Typography>
                    {!params.row.isTotalRow && <InfoOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', color }}>
                    {TrendIcon && <TrendIcon sx={{ fontSize: '0.8rem', mr: 0.5 }} />}
                    <Typography variant="caption" sx={{ fontWeight: '500' }}>{percent?.toFixed(2)}%</Typography>
                </Box>
            </Box>
        </LightTooltip>
    );
};

const renderDaysHeldCell = (params) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
        <Typography variant="body2">{params.value === 'N/A' ? params.value : `${params.value} dias`}</Typography>
    </Box>
);

const renderOriginalCostCell = (params) => {
    const totalCost = Math.abs(params.row.buy_amount || 0);
    const costPerShare = params.row.buyPrice || 0;
    const currency = params.row.buy_currency || 'EUR';
    const formatOriginalCurrency = (value) => formatCurrency(value, { currency: currency, showSymbol: true });

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography variant="body2">{formatOriginalCurrency(totalCost)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatOriginalCurrency(costPerShare)}</Typography>
        </Box>
    );
};

// Purchases are stored as negative amounts, so the rate is calculated from absolute values
const getExchangeRate = (row) => {
    const buyAmountOriginal = Math.abs(row.buy_amount || 0);
    if ((row.buy_currency || 'EUR') === 'EUR' || buyAmountOriginal === 0) return 1;
    return Math.abs(row.buy_amount_eur || 0) / buyAmountOriginal;
};

const renderExchangeRateCell = (params) => {
    const buyAmountOriginal = params.row.buy_amount || 0;
    const currency = params.row.buy_currency || 'EUR';

    if (currency === 'EUR' || buyAmountOriginal === 0) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%', width: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: '500' }}>1.0000</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>EUR/EUR</Typography>
            </Box>
        );
    }
    const exchangeRate = getExchangeRate(params.row);
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%', width: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: '500' }}>{exchangeRate.toFixed(4)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{currency}/EUR</Typography>
        </Box>
    );
};

const renderCostEURCell = (params) => {
    const totalCostEUR = Math.abs(params.row.buy_amount_eur || 0);
    const quantity = params.row.quantity || 0;
    const costPerShareEUR = quantity > 0 ? totalCostEUR / quantity : 0;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: '500' }}>{formatCurrency(totalCostEUR)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(costPerShareEUR)}</Typography>
        </Box>
    );
};

const renderDetailedCurrentValue = (params) => {
    if (params.row.priceUnavailable) return <CostAsValueCell value={params.row.marketValueEUR} />;
    const marketValue = params.row.marketValueEUR || 0;
    const currentPrice = params.row.current_price_eur || 0;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2">{formatCurrency(marketValue)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{formatCurrency(currentPrice)}</Typography>
        </Box>
    );
};

const renderUnrealizedGainsDetailedCell = (params) => {
    if (params.row.priceUnavailable) return <NotAvailableCell />;
    const totalAmount = params.row.unrealizedPLTotal || 0;
    const perShareAmount = params.row.unrealizedPLPerShare || 0;
    const isNegative = totalAmount < 0;
    const color = isNegative ? 'error.main' : 'success.main';
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: '500', color }}>{formatCurrency(totalAmount)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatCurrency(perShareAmount)}</Typography>
        </Box>
    );
};

const renderDetailedPerformance = (params) => {
    if (params.row.priceUnavailable) return <NotAvailableCell />;
    const totalReturn = params.row.returnPercentage || 0;
    const annualized = params.row.annualizedReturnStr || 'N/A';
    const color = totalReturn >= 0 ? 'success.main' : 'error.main';
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: '500', color }}>
                {totalReturn > 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                Anual: {annualized}
            </Typography>
        </Box>
    );
};

// --- COLUMN DEFINITIONS ---

// Sorts the column normally but keeps the total row last, in both directions
const keepTotalRowLast = (column) => {
    const comparator = column.type === 'number' ? gridNumberComparator : gridStringOrNumberComparator;
    const isTotalRow = (params) => params.api.getRow(params.id)?.isTotalRow;

    return {
        ...column,
        getSortComparator: (sortDirection) => (value1, value2, params1, params2) => {
            if (isTotalRow(params1)) return 1;
            if (isTotalRow(params2)) return -1;
            const result = comparator(value1, value2, params1, params2);
            return sortDirection === 'desc' ? -result : result;
        },
    };
};

export const getGroupedColumns = (hiddenCols, isHistorical) => {
    if (isHistorical) {
        return [
            { field: 'product_name_ticker', headerName: 'Nome / Ticker', flex: 1.5, minWidth: 200, valueGetter: (value, row) => row.product_name, renderCell: renderNameTickerCell },
            { field: 'quantity', headerName: 'Qtd', type: 'number', width: 110, align: 'right', headerAlign: 'right', valueFormatter: (val, row) => row.isTotalRow ? '' : formatQuantity(val) },
            { field: 'total_cost_basis_eur', headerName: 'Custo Total (€)', type: 'number', width: 140, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatCurrency(value), renderCell: (params) => params.row.isTotalRow ? <Box sx={{fontWeight: 'bold'}}>{formatCurrency(params.value)}</Box> : formatCurrency(params.value) },
            { field: 'totalDividends', headerName: 'Dividendos (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
            { field: 'totalRealizedStockPL', headerName: 'L/P Ações (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell },
            { field: 'totalCommissions', headerName: 'Comissões (Hist.)', type: 'number', width: 160, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell },
        ].map(keepTotalRowLast);
    }

    let columns = [
        { field: 'product_name_ticker', headerName: 'Nome / ISIN', flex: 1.5, minWidth: 200, valueGetter: (value, row) => row.product_name, renderCell: renderNameTickerCell },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80, align: 'right', headerAlign: 'right', valueFormatter: (val, row) => row.isTotalRow ? '' : formatQuantity(val) },
        { field: 'total_cost_basis_eur', headerName: 'Custo Médio', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCostBasisCombinedCell },
        { field: 'marketValueEUR', headerName: 'Valor Atual', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCurrentValueCombinedCell },
    ];

    if (!hiddenCols.dividends) columns.push({ field: 'totalDividends', headerName: 'Dividendos Rec.', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell });
    if (!hiddenCols.commissions) columns.push({ field: 'totalCommissions', headerName: 'Comissões Pagas', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderCommissionCell });
    if (!hiddenCols.salesRealized) columns.push({ field: 'totalRealizedStockPL', headerName: 'L/P Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderLifetimeMetricCell });

    columns.push(
        { field: 'unrealizedPL', headerName: 'Ganhos Não Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderUnrealizedGainsCell },
        { field: 'realizedGains', headerName: 'Ganhos Realizados', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderRealizedGainsCell },
        { field: 'totalProfitAmount', headerName: 'Lucro Total', type: 'number', width: 130, align: 'right', headerAlign: 'right', renderCell: renderTotalProfitCell },
    );

    return columns.map(keepTotalRowLast);
};

export const getDetailedColumns = (hiddenCols, selectedYear) => {
    let columns = [
        { field: 'product_name_ticker', headerName: 'Nome / ISIN', flex: 1, minWidth: 180, valueGetter: (value, row) => row.product_name, renderCell: renderNameTickerCellDetailed },
        { field: 'buy_date', headerName: 'Data Compra', width: 100, type: 'date', valueGetter: (value) => parseDateRobust(value) },
        { field: 'daysHeld', headerName: 'Dias', width: 70, type: 'number', align: 'right', headerAlign: 'right', renderCell: renderDaysHeldCell },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 70, align: 'right', headerAlign: 'right' },
    ];

    if (!hiddenCols.originalCost) columns.push({ field: 'buy_amount', headerName: 'Custo Orig.', type: 'number', width: 120, align: 'right', headerAlign: 'right', valueGetter: (value) => Math.abs(value || 0), renderCell: renderOriginalCostCell });
    if (!hiddenCols.exchangeRate) columns.push({ field: 'exchangeRate', headerName: 'Câmbio', type: 'number', width: 100, align: 'right', headerAlign: 'right', valueGetter: (value, row) => getExchangeRate(row), renderCell: renderExchangeRateCell });

    columns.push({ field: 'buy_amount_eur', headerName: 'Custo (€)', type: 'number', width: 120, align: 'right', headerAlign: 'right', renderCell: renderCostEURCell });

    const currentSystemYear = new Date().getFullYear().toString();
    const showCurrentMetrics = selectedYear === ALL_YEARS_OPTION || selectedYear === currentSystemYear;

    if (showCurrentMetrics) {
        columns.push(
            { field: 'marketValueEUR', headerName: 'Valor Atual', type: 'number', width: 130, align: 'right', headerAlign: 'right', renderCell: renderDetailedCurrentValue },
            { field: 'unrealizedPLTotal', headerName: 'P/L (€)', type: 'number', width: 110, align: 'right', headerAlign: 'right', renderCell: renderUnrealizedGainsDetailedCell },
            { field: 'returnPercentage', headerName: 'Rentabilidade', type: 'number', width: 140, align: 'right', headerAlign: 'right', renderCell: renderDetailedPerformance }
        );
    }

    return columns;
};