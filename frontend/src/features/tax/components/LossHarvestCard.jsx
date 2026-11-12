// frontend/src/features/tax/components/LossHarvestCard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, Button, Chip, Collapse, TextField, InputAdornment, Skeleton, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import { warningChipSx, parseNumber } from './SaleSimulatorDrawer';
import { apiFetchTaxLossHarvest } from '../api/taxApi';
import { daysUntil, lotDates, summarizeHarvest } from '../logic/lossHarvest';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';

const WARNINGS = [
    'Adia o imposto, não o elimina: se voltares a comprar, o novo lote custa menos e o ganho futuro fica maior pelo mesmo valor. Só poupas de vez se esse ganho for realizado num ano com saldo negativo, ou se não voltares a comprar.',
    'Recomprar recomeça a contagem dos 365 dias: lotes antigos passam a ser de curto prazo outra vez.',
    'As comissões, o câmbio e o spread da venda e da recompra reduzem a poupança.',
    'Perdas em títulos de entidades sediadas em paraísos fiscais (p. ex. Ilhas Caimão) podem não abater aos outros ganhos (art. 72.º do CIRS). Confirma com um contabilista.',
    'O IRS é sobre todas as tuas vendas do ano; este saldo é só deste portfólio.',
    'Os preços podem ter atraso: a perda real depende do preço a que a venda for executada.',
];

const SKIP_REASONS = {
    no_price: 'sem preço atual',
    below_commission: 'a poupança não paga a comissão',
};

/**
 * The sales of positions at a loss that would lower this year's tax, pre-filled from the backend. The user can
 * untick a sale, or open it in the sale simulator with the suggested quantity.
 * @param {{portfolioId: number, balance: number|undefined, onSimulate: (position: object) => void}} props
 */
export default function LossHarvestCard({ portfolioId, balance, onSimulate }) {
    const theme = useTheme();
    const [commissionText, setCommissionText] = useState('');
    const [commission, setCommission] = useState(0);
    const [selection, setSelection] = useState(null); // null: every sale ticked
    const [showWarnings, setShowWarnings] = useState(false);

    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => { setSelection(null); }, [portfolioId, commission]);

    const enabled = Boolean(portfolioId) && balance > 0;
    const { data: plan, isLoading, isError } = useQuery({
        queryKey: ['taxLossHarvest', portfolioId, commission],
        queryFn: () => apiFetchTaxLossHarvest(portfolioId, commission).then(res => res.data),
        enabled,
        staleTime: 5 * 60 * 1000,
        // Keeps the plan on screen while another commission is worked out (same portfolio only).
        placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === portfolioId ? previous : undefined),
    });

    const allIsins = useMemo(() => (plan?.sales || []).map(s => s.isin), [plan]);
    const ticked = selection ?? allIsins;
    const summary = useMemo(
        () => summarizeHarvest(plan, allIsins.filter(isin => !ticked.includes(isin))),
        [plan, allIsins, ticked],
    );

    const columns = useMemo(() => [
        {
            field: 'product_name',
            headerName: 'Ativo',
            flex: 1.4,
            minWidth: 190,
            renderCell: (params) => (
                <Box sx={{ lineHeight: 1.2, py: 0.75, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{params.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{params.row.isin}</Typography>
                </Box>
            ),
        },
        {
            field: 'quantity',
            headerName: 'Vender',
            width: 120,
            renderCell: (params) => (
                <Box sx={{ lineHeight: 1.2 }}>
                    <Typography variant="body2">{formatQuantity(params.value)}</Typography>
                    <Typography variant="caption" color="text.secondary">de {formatQuantity(params.row.held_quantity)}</Typography>
                </Box>
            ),
        },
        {
            field: 'lots',
            headerName: 'Lotes (FIFO)',
            description: 'Data de compra dos lotes que a venda usa, dos mais antigos para os mais recentes.',
            flex: 1,
            minWidth: 150,
            sortable: false,
            valueGetter: (value, row) => lotDates(row),
        },
        { field: 'sale_amount_eur', headerName: 'Valor da venda', type: 'number', width: 130, valueFormatter: (value) => formatCurrency(value) },
        {
            field: 'gain',
            headerName: 'Perda',
            description: 'Perda realizada, já com as comissões da compra (e da venda, se indicaste).',
            type: 'number',
            width: 120,
            renderCell: (params) => <Box component="span" sx={{ color: 'error.main', fontWeight: 500 }}>{formatCurrency(params.value)}</Box>,
        },
        {
            field: 'actions',
            headerName: '',
            width: 100,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            align: 'right',
            renderCell: (params) => (
                <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSimulate({
                            isin: params.row.isin,
                            product_name: params.row.product_name,
                            quantity: params.row.held_quantity,
                            initialQuantity: params.row.quantity,
                        });
                    }}
                >
                    Simular
                </Button>
            ),
        },
    ], [onSimulate]);

    if (!enabled) return null;

    if (isError) {
        return <Alert severity="warning">Não foi possível calcular as vendas que reduzem o IRS.</Alert>;
    }
    if (isLoading) {
        return <Skeleton variant="rounded" height={180} />;
    }
    if (!plan || plan.sales.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                Não há posições com perdas que reduzam o IRS de {plan?.year ?? ''}.
                {plan?.skipped?.length > 0 && ` Fora da conta: ${plan.skipped.map(s => `${s.product_name} (${SKIP_REASONS[s.reason] || s.reason})`).join(', ')}.`}
            </Typography>
        );
    }

    const daysLeft = daysUntil(plan.deadline);
    const urgent = daysLeft !== null && daysLeft <= 31;
    const rows = plan.sales.map(sale => ({ id: sale.isin, ...sale }));
    const applyCommission = () => setCommission(parseNumber(commissionText));

    return (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, pt: 1.5, pb: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mr: 0.5 }}>
                    Reduzir o IRS de {plan.year} com perdas por realizar
                </Typography>
                <Chip size="small" variant="outlined" label="Sugestão" />
                <Box sx={{ flexGrow: 1 }} />
                <Chip
                    size="small"
                    sx={urgent ? warningChipSx(theme) : undefined}
                    variant={urgent ? 'filled' : 'outlined'}
                    label={`Vender até ${plan.deadline}${daysLeft !== null ? ` · faltam ${daysLeft} dias` : ''}`}
                />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5, maxWidth: 820 }}>
                Vender estas posições hoje realiza perdas que abatem ao saldo do ano. Como se vende sempre pelos lotes mais
                antigos (FIFO), a quantidade sugerida é a que dá a maior perda; e só até o saldo chegar a zero, porque as
                perdas não passam para os anos seguintes.
            </Typography>

            <Grid container spacing={2} sx={{ px: 2, pb: 2 }}>
                <Grid item xs={6} md={4}>
                    <MetricCard title="IRS estimado agora" value={summary.taxBefore} colorOverride="text.primary" />
                </Grid>
                <Grid item xs={6} md={4}>
                    <MetricCard
                        title="IRS com estas vendas"
                        value={summary.taxAfter}
                        colorOverride="text.primary"
                        tooltipText={`O saldo do ano passa de ${formatCurrency(plan.year_before.balance)} para ${formatCurrency(summary.balanceAfter)}.`}
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <MetricCard
                        title="Poupança estimada"
                        value={summary.taxSaved}
                        colorOverride={summary.taxSaved > 0.005 ? 'success.main' : 'text.primary'}
                        tooltipText="Antes das comissões, do câmbio e do spread da recompra. É sobretudo imposto adiado: vê os avisos abaixo."
                    />
                </Grid>
            </Grid>

            <DataGrid
                rows={rows}
                columns={columns}
                autoHeight
                getRowHeight={() => 'auto'}
                checkboxSelection
                disableRowSelectionOnClick
                rowSelectionModel={ticked}
                onRowSelectionModelChange={(model) => setSelection(model.map(String))}
                columnVisibilityModel={{ lots: !isMobile, sale_amount_eur: !isMobile }}
                hideFooter
                localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                sx={{
                    border: 'none',
                    borderTop: 1,
                    borderColor: 'divider',
                    borderRadius: 0,
                    '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
                    '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' },
                    '& .MuiDataGrid-cell--textRight': { justifyContent: 'flex-end' },
                    '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
                }}
            />

            <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {summary.sales.length === 0
                        ? 'Nenhuma venda escolhida.'
                        : <>Perda realizada <b>{formatCurrency(summary.totalLoss)}</b> em vendas de {formatCurrency(summary.totalSale)} · saldo passa a {formatCurrency(summary.balanceAfter)}</>}
                </Typography>
                <TextField
                    size="small"
                    label="Comissão por venda"
                    value={commissionText}
                    onChange={(e) => setCommissionText(e.target.value)}
                    onBlur={applyCommission}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyCommission(); }}
                    inputProps={{ inputMode: 'decimal' }}
                    InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                    sx={{ width: 170 }}
                />
            </Box>

            {(plan.unused_loss_eur < -0.005 || plan.skipped.length > 0) && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, pb: 1 }}>
                    {plan.unused_loss_eur < -0.005 && `Ficam de fora ${formatCurrency(-plan.unused_loss_eur)} de perdas que já não baixariam o IRS deste ano. `}
                    {plan.skipped.length > 0 && `Fora da conta: ${plan.skipped.map(s => `${s.product_name} (${SKIP_REASONS[s.reason] || s.reason})`).join(', ')}.`}
                </Typography>
            )}

            <Box sx={{ px: 2, pb: 1.5 }}>
                <Button size="small" onClick={() => setShowWarnings(v => !v)} sx={{ px: 0 }}>
                    {showWarnings ? '▾' : '▸'} Antes de vender ({WARNINGS.length + 1} avisos)
                </Button>
                <Collapse in={showWarnings}>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
                        {WARNINGS.map(text => (
                            <Typography key={text} component="li" variant="body2" color="text.secondary">{text}</Typography>
                        ))}
                        <Typography component="li" variant="body2" color="text.secondary">
                            Para contar em {plan.year}, a venda tem de ser feita até {plan.deadline}. Deixa margem: os mercados
                            fecham mais cedo no fim do ano e a liquidação demora dois dias úteis.
                        </Typography>
                    </Box>
                </Collapse>
            </Box>
        </Paper>
    );
}
