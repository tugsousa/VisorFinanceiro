// frontend/src/features/netWorth/pages/NetWorthPage.jsx
import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, Button, Alert, CircularProgress, IconButton, Tooltip, Table, TableBody,
    TableCell, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { Doughnut, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler,
} from 'chart.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import AssetDialog from '../components/AssetDialog';
import UpdateValueDialog from '../components/UpdateValueDialog';
import MovementsDialog from '../components/MovementsDialog';
import { useNetWorth } from '../hooks/useNetWorth';
import { apiDeleteOtherAsset, netWorthErrorMessage } from '../api/netWorthApi';
import { TYPE_COLORS, TYPE_GROUP_LABELS, capitalisationLabel, formatISODate, typeLabel, usageLabel } from '../logic/assetTypes';
import PropertySection from '../components/PropertySection';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { MONTH_NAMES_CHART } from '../../../constants';

ChartJS.register(ArcElement, ChartTooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const historyLabel = (isoDate, isLast) => {
    if (isLast) return 'Hoje';
    const [year, month] = isoDate.split('-');
    return `${MONTH_NAMES_CHART[Number(month) - 1]} ${year.slice(2)}`;
};

/** The second line of an asset in the table: how its value is obtained. */
const assetDetail = (asset) => {
    if (asset.closed_at) return `Fechado em ${formatISODate(asset.closed_at)}`;
    if (asset.type === 'term_deposit' && asset.details) {
        const d = asset.details;
        const rate = `${Number(d.rate_pct).toLocaleString('pt-PT', { maximumFractionDigits: 3 })}% TANB`;
        const maturity = asset.matured ? `venceu a ${formatISODate(d.maturity)}` : `vence a ${formatISODate(d.maturity)}`;
        return `${formatCurrency(d.principal)} a ${rate} · ${capitalisationLabel(d.capitalisation)} · ${maturity}`;
    }
    if (asset.type === 'real_estate') {
        const parts = [usageLabel(asset.details?.usage)];
        if (asset.debt_eur > 0) parts.push(`valor ${formatCurrency(asset.gross_value_eur)} − dívida ${formatCurrency(asset.debt_eur)}`);
        if (asset.details?.monthly_rent) parts.push(`renda ${formatCurrency(asset.details.monthly_rent)}/mês`);
        if (asset.last_valuation_date) parts.push(`valor de ${formatISODate(asset.last_valuation_date)}`);
        return parts.filter(Boolean).join(' · ');
    }
    if (asset.last_valuation_date) return `Valor atualizado a ${formatISODate(asset.last_valuation_date)}`;
    return asset.entries?.length ? 'Soma dos movimentos' : 'Sem valor';
};

const NetWorthPage = () => {
    const queryClient = useQueryClient();
    const { data, isLoading, isError } = useNetWorth();

    const [assetDialog, setAssetDialog] = useState({ open: false, asset: null });
    const [valueAssetId, setValueAssetId] = useState(null);
    const [movementsAssetId, setMovementsAssetId] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [deleteError, setDeleteError] = useState('');

    const assets = data?.assets || [];
    const findAsset = (id) => assets.find((a) => a.id === id) || null;

    const deleteMutation = useMutation({
        mutationFn: (id) => apiDeleteOtherAsset(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netWorth'] });
            setDeleting(null);
        },
        onError: (err) => setDeleteError(netWorthErrorMessage(err, 'Não foi possível apagar.')),
    });

    const doughnutData = useMemo(() => {
        const slices = (data?.by_type || []).filter((t) => t.value_eur > 0);
        return {
            labels: slices.map((t) => TYPE_GROUP_LABELS[t.type] || t.type),
            datasets: [{
                data: slices.map((t) => t.value_eur),
                backgroundColor: slices.map((t) => TYPE_COLORS[t.type] || '#9e9e9e'),
                borderWidth: 1,
            }],
        };
    }, [data]);

    const lineData = useMemo(() => {
        const history = data?.history || [];
        return {
            labels: history.map((p, i) => historyLabel(p.date, i === history.length - 1)),
            datasets: [
                {
                    label: 'Património total',
                    data: history.map((p) => p.total_eur),
                    borderColor: '#178bba',
                    backgroundColor: 'rgba(23, 139, 186, 0.08)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                },
                {
                    label: 'Outros ativos',
                    data: history.map((p) => p.other_assets_eur),
                    borderColor: '#ff9800',
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                },
            ],
        };
    }, [data]);

    const lineOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
                    footer: (items) => {
                        const point = data?.history?.[items[0]?.dataIndex];
                        return point ? `Investimentos: ${formatCurrency(point.portfolios_eur)}` : '';
                    },
                },
            },
        },
        scales: {
            y: { ticks: { callback: (v) => formatCurrency(v, { maximumFractionDigits: 0, minimumFractionDigits: 0 }) } },
            x: { ticks: { maxTicksLimit: 12 } },
        },
    }), [data]);

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const share = data?.total_eur ? (ctx.parsed / data.total_eur) * 100 : 0;
                        return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${share.toFixed(1)}%)`;
                    },
                },
            },
        },
    };

    const columns = [
        {
            field: 'name', headerName: 'Ativo', flex: 1.4, minWidth: 220,
            renderCell: (params) => (
                <Box sx={{ py: 1, lineHeight: 1.3 }}>
                    <Typography variant="body2" fontWeight={600}>{params.row.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{assetDetail(params.row)}</Typography>
                </Box>
            ),
        },
        { field: 'type', headerName: 'Tipo', flex: 0.8, minWidth: 150, valueGetter: (value) => typeLabel(value) },
        {
            field: 'value_eur', headerName: 'Valor', type: 'number', flex: 0.7, minWidth: 130,
            renderCell: (params) => (
                <Box sx={{ textAlign: 'right', lineHeight: 1.3, py: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{formatCurrency(params.value)}</Typography>
                    {params.row.type === 'real_estate' && params.row.debt_eur > 0 && (
                        <Typography variant="caption" color="text.secondary">capital próprio</Typography>
                    )}
                    {params.row.type === 'term_deposit' && params.row.interest_net_eur > 0 && (
                        <Typography variant="caption" color="text.secondary">
                            juros líq. {formatCurrency(params.row.interest_net_eur)} (bruto {formatCurrency(params.row.interest_gross_eur)})
                        </Typography>
                    )}
                </Box>
            ),
        },
        {
            field: 'actions', headerName: '', sortable: false, filterable: false, flex: 1, minWidth: 280, align: 'right',
            renderCell: (params) => {
                const manual = params.row.type !== 'term_deposit';
                return (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                        {manual && (
                            <>
                                <Button size="small" sx={{ textTransform: 'none' }} onClick={() => setValueAssetId(params.row.id)}>Atualizar valor</Button>
                                <Button size="small" sx={{ textTransform: 'none' }} onClick={() => setMovementsAssetId(params.row.id)}>Movimentos</Button>
                            </>
                        )}
                        <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => setAssetDialog({ open: true, asset: params.row })}><EditOutlinedIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Apagar">
                            <IconButton size="small" onClick={() => { setDeleteError(''); setDeleting(params.row); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </Tooltip>
                    </Box>
                );
            },
        },
    ];

    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }
    if (isError || !data) {
        return <Box sx={{ p: 3 }}><Alert severity="error">Não foi possível calcular o património.</Alert></Box>;
    }

    const unpriced = data.portfolios.reduce((n, p) => n + (p.unpriced_holdings || 0), 0);

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 4 }}>
                <Box>
                    <Typography variant="h4" component="h1" fontWeight="800" sx={{ color: '#2c3e50', letterSpacing: '-0.5px' }}>
                        Património
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Todas as carteiras e as poupanças fora das corretoras. Os outros ativos não entram na rentabilidade nem no IRS das carteiras.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} sx={{ textTransform: 'none' }} onClick={() => setAssetDialog({ open: true, asset: null })}>
                    Adicionar ativo
                </Button>
            </Box>

            {unpriced > 0 && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    {unpriced === 1 ? 'Um ativo das carteiras não tem' : `${unpriced} ativos das carteiras não têm`} preço de mercado e conta{unpriced === 1 ? '' : 'm'} ao custo.
                </Alert>
            )}

            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} md={3}>
                    <MetricCard title="Património total" value={data.total_eur} colorOverride="text.primary" />
                </Grid>
                <Grid item xs={6} md={3}>
                    <MetricCard title="Investimentos (corretoras)" value={data.portfolios_eur} colorOverride="text.primary"
                        tooltipText="Valor de mercado e saldo em dinheiro de todas as carteiras." />
                </Grid>
                <Grid item xs={6} md={3}>
                    <MetricCard title="Outros ativos" value={data.other_assets_eur} colorOverride="text.primary"
                        tooltipText="Depósitos a prazo líquidos da retenção de 28% sobre os juros; imóveis pelo capital próprio (valor menos o crédito em dívida); os restantes pelo último valor indicado."
                        subValue={data.debt_eur > 0 ? (
                            <Typography variant="caption" color="text.secondary">já sem {formatCurrency(data.debt_eur)} de crédito</Typography>
                        ) : null} />
                </Grid>
                <Grid item xs={6} md={3}>
                    <MetricCard title="Variação do mês" value={data.month_change_eur ?? null}
                        tooltipText="Desde o fim do mês anterior, incluindo depósitos e levantamentos." />
                </Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={5}>
                    <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, height: 360 }}>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Por tipo</Typography>
                        <Box sx={{ height: 300 }}>
                            {doughnutData.labels.length > 0
                                ? <Doughnut data={doughnutData} options={doughnutOptions} />
                                : <Typography variant="body2" color="text.secondary">Sem valores.</Typography>}
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={7}>
                    <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, height: 360 }}>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Evolução (fim de cada mês)</Typography>
                        <Box sx={{ height: 300 }}>
                            <Line data={lineData} options={lineOptions} />
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>Outros ativos</Typography>
            {assets.length === 0 ? (
                <Alert severity="info" sx={{ mb: 4 }}>
                    Ainda não há outros ativos. Use "Adicionar ativo" para registar contas, depósitos a prazo, Certificados de Aforro, PPR ou imóveis.
                </Alert>
            ) : (
                <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, mb: 4 }}>
                    <DataGrid
                        rows={assets}
                        columns={columns}
                        getRowHeight={() => 'auto'}
                        autoHeight
                        disableRowSelectionOnClick
                        hideFooter={assets.length <= 25}
                        initialState={{ sorting: { sortModel: [{ field: 'value_eur', sort: 'desc' }] } }}
                        localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                        sx={{ border: 'none' }}
                    />
                </Paper>
            )}

            <PropertySection assets={assets} />

            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>Carteiras nas corretoras</Typography>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Carteira</TableCell>
                            <TableCell align="right">Investido a valor de mercado</TableCell>
                            <TableCell align="right">Dinheiro</TableCell>
                            <TableCell align="right">Total</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.portfolios.map((p) => (
                            <TableRow key={p.id}>
                                <TableCell>{p.name}</TableCell>
                                <TableCell align="right">{formatCurrency(p.holdings_eur)}</TableCell>
                                <TableCell align="right">{formatCurrency(p.cash_eur)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(p.total_eur)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>

            <AssetDialog open={assetDialog.open} asset={assetDialog.asset} onClose={() => setAssetDialog({ open: false, asset: null })} />
            <UpdateValueDialog open={!!valueAssetId} asset={findAsset(valueAssetId)} onClose={() => setValueAssetId(null)} />
            <MovementsDialog open={!!movementsAssetId} asset={findAsset(movementsAssetId)} onClose={() => setMovementsAssetId(null)} />

            <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
                <DialogTitle>Apagar ativo</DialogTitle>
                <DialogContent>
                    <Typography>Apagar "{deleting?.name}" e todos os seus movimentos? Não é possível desfazer.</Typography>
                    {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(null)}>Cancelar</Button>
                    <Button color="error" variant="contained" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting.id)}>
                        Apagar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default NetWorthPage;
