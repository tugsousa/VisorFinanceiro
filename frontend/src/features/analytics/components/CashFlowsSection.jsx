// frontend/src/features/analytics/components/CashFlowsSection.jsx
import React, { Fragment, useMemo } from 'react';
import {
    Typography, Paper, Box, Grid, CircularProgress, Accordion, AccordionSummary, AccordionDetails,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, alpha, useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, BarController,
    LineElement, LineController, PointElement, Title, Tooltip, Legend,
} from 'chart.js';

import MetricCard from './MetricCard';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../../constants';
import { parseDateRobust } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { generateColorPalette } from '../../../lib/utils/chartUtils';
import {
    formatBroker, summarizeCashMovements, buildCashFlowTimeSeries, sumDepositsByBroker, getMonthlyNetStats,
} from '../logic/cashFlowCalculations';

ChartJS.register(
    ArcElement, CategoryScale, LinearScale, BarElement, BarController,
    LineElement, LineController, PointElement, Title, Tooltip, Legend,
);

const formatOriginalAmount = (amount, currency) => {
    const formatted = (amount || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency ? `${formatted} ${currency}` : formatted;
};

/**
 * Picks the limits of the two value axes so that zero sits at the same height on both.
 * Otherwise the running-total line looks like it crosses zero when it doesn't.
 */
const alignZeroAxes = (barValues, lineValues) => {
    const range = (values) => {
        const finite = values.filter(v => typeof v === 'number' && isFinite(v));
        return { neg: -Math.min(0, ...finite), pos: Math.max(0, ...finite) };
    };
    const bars = range(barValues);
    const line = range(lineValues);
    const negShare = (r) => (r.neg + r.pos === 0 ? 0 : r.neg / (r.neg + r.pos));
    const share = Math.max(negShare(bars), negShare(line));

    const fit = (r) => {
        let { neg, pos } = r;
        if (share > 0 && share < 1) {
            if (negShare(r) < share) neg = (share * pos) / (1 - share);
            else pos = (neg * (1 - share)) / share;
        }
        if (neg + pos === 0) pos = 1;
        const padding = 1.1;
        return { min: -neg * padding, max: pos * padding };
    };
    return { y: fit(bars), y1: fit(line) };
};

const formatMonthYear =(date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;

const columns = [
    {
        field: 'date',
        headerName: 'Data',
        width: 110,
        type: 'date',
        valueGetter: (value) => parseDateRobust(value),
        valueFormatter: (value) => {
            if (!value) return '';
            const day = String(value.getDate()).padStart(2, '0');
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const year = value.getFullYear();
            return `${day}-${month}-${year}`;
        }
    },
    {
        field: 'transaction_subtype',
        headerName: 'Tipo',
        flex: 1,
        minWidth: 120,
        valueFormatter: (value) => (value === 'DEPOSIT' ? 'Depósito' : 'Levantamento'),
    },
    { field: 'source', headerName: 'Corretora', width: 120, valueFormatter: (value) => formatBroker(value) },
    {
        field: 'amount',
        headerName: 'Montante original',
        type: 'number',
        width: 160,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params) => formatOriginalAmount(params.value, params.row.currency),
    },
    {
        field: 'amount_eur',
        headerName: 'Montante (€)',
        type: 'number',
        width: 130,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params) => (
            <Box sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {formatCurrency(params.value)}
            </Box>
        ),
    },
];

const SummaryRow = ({ year, broker, totals, isBold }) => {
    const cellSx = isBold ? { fontWeight: 600 } : undefined;
    return (
        <TableRow>
            <TableCell sx={cellSx}>{year}</TableCell>
            <TableCell sx={cellSx}>{broker}</TableCell>
            <TableCell align="right" sx={cellSx}>{formatCurrency(totals.deposited)}</TableCell>
            <TableCell align="right" sx={cellSx}>{formatCurrency(totals.withdrawn)}</TableCell>
            <TableCell align="right" sx={cellSx}>{formatCurrency(totals.net)}</TableCell>
        </TableRow>
    );
};

const GrowthBadge = ({ growthPct, previousYear }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', color: growthPct >= 0 ? 'success.main' : 'error.main' }}>
        {growthPct >= 0 ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
        <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 'bold' }}>
            {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}% vs {previousYear}
        </Typography>
    </Box>
);

export default function CashFlowsSection({ movements, allMovements, selectedYear, isLoading, NoRowsOverlay }) {
    const theme = useTheme();
    const isGlobalView = selectedYear === ALL_YEARS_OPTION;

    const summary = useMemo(() => summarizeCashMovements(movements), [movements]);
    const monthlyStats = useMemo(
        () => getMonthlyNetStats(allMovements, selectedYear, ALL_YEARS_OPTION),
        [allMovements, selectedYear]
    );
    const series = useMemo(
        () => buildCashFlowTimeSeries(allMovements, selectedYear, ALL_YEARS_OPTION),
        [allMovements, selectedYear]
    );
    const brokers = useMemo(() => sumDepositsByBroker(movements), [movements]);
    const showBrokerChart = brokers.length > 1;

    const timeSeriesData = useMemo(() => {
        const { success, error, primary } = theme.palette;
        return {
            labels: isGlobalView ? series.labels : MONTH_NAMES_CHART,
            datasets: [
                {
                    type: 'line',
                    label: 'Líquido acumulado',
                    data: series.cumulativeNet,
                    yAxisID: 'y1',
                    borderColor: primary.main,
                    backgroundColor: primary.main,
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.25,
                    order: 0,
                },
                {
                    label: 'Depósitos',
                    data: series.deposited,
                    backgroundColor: alpha(success.main, 0.7),
                    borderColor: success.main,
                    borderWidth: 1,
                    borderRadius: 4,
                    maxBarThickness: 60,
                    order: 1,
                },
                {
                    label: 'Levantamentos',
                    data: series.withdrawn,
                    backgroundColor: alpha(error.main, 0.7),
                    borderColor: error.main,
                    borderWidth: 1,
                    borderRadius: 4,
                    maxBarThickness: 60,
                    order: 1,
                },
            ],
        };
    }, [series, isGlobalView, theme]);

    const axisLimits = alignZeroAxes([...series.deposited, ...series.withdrawn], series.cumulativeNet);
    const lineColor = theme.palette.primary.main;

    const timeSeriesOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            title: {
                display: true,
                text: `Depósitos e Levantamentos por ${isGlobalView ? 'Ano' : 'Mês'}`,
                font: { size: 16, weight: '600' },
            },
            legend: { position: 'top' },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } },
        },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
                stacked: true,
                ...axisLimits.y,
                title: { display: true, text: 'Movimentos (€)' },
                ticks: { callback: (value) => formatCurrency(value, { maximumFractionDigits: 0 }) },
            },
            y1: {
                position: 'right',
                ...axisLimits.y1,
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Líquido acumulado (€)', color: lineColor },
                ticks: { color: lineColor, callback: (value) => formatCurrency(value, { maximumFractionDigits: 0 }) },
            },
        },
    };

    const brokerData = useMemo(() => ({
        labels: brokers.map(b => b.broker),
        datasets: [{
            data: brokers.map(b => b.deposited),
            backgroundColor: generateColorPalette(brokers.length, 'background'),
            borderColor: generateColorPalette(brokers.length, 'border'),
            borderWidth: 1,
        }],
    }), [brokers]);

    const brokerOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Depositado por Corretora', font: { size: 16, weight: '600' } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } },
        },
        cutout: '50%',
    };

    const hasData = movements.length > 0;

    if (isLoading && !hasData) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    if (!hasData) {
        return (
            <Typography align="center" sx={{ my: 4, color: 'text.secondary' }}>
                Não existem depósitos nem levantamentos para o período selecionado.
            </Typography>
        );
    }

    const periodLabel = isGlobalView ? '' : ` em ${selectedYear}`;

    return (
        <>
            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title={`Total Depositado${periodLabel}`}
                        value={summary.totals.deposited}
                        isLoading={isLoading}
                        tooltipText="Soma de todos os depósitos feitos nas corretoras."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title={`Total Levantado${periodLabel}`}
                        value={summary.totals.withdrawn}
                        isLoading={isLoading}
                        tooltipText="Soma de todos os levantamentos feitos das corretoras."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title={`Valor Líquido${periodLabel}`}
                        value={summary.totals.net}
                        isLoading={isLoading}
                        tooltipText="Depósitos menos levantamentos. As transferências entre corretoras contam como um levantamento e um depósito, pelo que aumentam o total depositado e o total levantado, mas não o valor líquido."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Média Mensal (Líquida)"
                        value={monthlyStats.monthlyAverage}
                        isLoading={isLoading}
                        tooltipText={isGlobalView
                            ? 'Valor líquido investido a dividir pelo número de meses desde o primeiro movimento.'
                            : `Valor líquido investido em ${selectedYear} a dividir pelos meses do ano (até ao mês atual, no ano corrente).`}
                        subValue={isGlobalView
                            ? (monthlyStats.firstDate && (
                                <Typography variant="caption" color="text.secondary">
                                    desde {formatMonthYear(monthlyStats.firstDate)}
                                </Typography>
                            ))
                            : (monthlyStats.growthPct !== null && (
                                <GrowthBadge growthPct={monthlyStats.growthPct} previousYear={parseInt(selectedYear, 10) - 1} />
                            ))}
                    />
                </Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={showBrokerChart ? 8 : 12}>
                    <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                        <Bar options={timeSeriesOptions} data={timeSeriesData} />
                    </Paper>
                </Grid>
                {showBrokerChart && (
                    <Grid item xs={12} md={4}>
                        <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                            <Doughnut options={brokerOptions} data={brokerData} />
                        </Paper>
                    </Grid>
                )}
            </Grid>

            <Accordion
                disableGutters
                elevation={0}
                sx={{ mb: 4, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, '&:before': { display: 'none' } }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography sx={{ fontWeight: 600 }}>Detalhe por ano e corretora</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Ano</TableCell>
                                    <TableCell>Corretora</TableCell>
                                    <TableCell align="right">Depositado</TableCell>
                                    <TableCell align="right">Levantado</TableCell>
                                    <TableCell align="right">Líquido</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {summary.years.map(({ year, totals, brokers: yearBrokers }) => (
                                    <Fragment key={year}>
                                        <SummaryRow year={year} broker="Total" totals={totals} isBold />
                                        {yearBrokers.map(({ broker, totals: brokerTotals }) => (
                                            <SummaryRow key={broker} year="" broker={broker} totals={brokerTotals} />
                                        ))}
                                    </Fragment>
                                ))}
                                {summary.years.length > 1 && (
                                    <SummaryRow year="Total" broker="" totals={summary.totals} isBold />
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </AccordionDetails>
            </Accordion>

            <Typography variant="h5" sx={{ mb: 2 }}>Histórico de Movimentos</Typography>
            <Box sx={{ width: '100%' }}>
                <DataGrid
                    rows={movements}
                    columns={columns}
                    loading={isLoading}
                    autoHeight
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                        sorting: { sortModel: [{ field: 'date', sort: 'desc' }] },
                    }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick
                    localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                    slots={{ noRowsOverlay: NoRowsOverlay }}
                />
            </Box>
        </>
    );
}
