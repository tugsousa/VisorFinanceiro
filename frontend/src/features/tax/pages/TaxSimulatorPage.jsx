// frontend/src/features/tax/pages/TaxSimulatorPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, Button, FormControlLabel, Switch, Chip, Stack, Tooltip, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import SaleSimulatorDrawer, { warningChipSx } from '../components/SaleSimulatorDrawer';
import LossHarvestCard from '../components/LossHarvestCard';
import { apiFetchTaxYearStatus } from '../api/taxApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';
import { purchaseDates, soonLongTermPurchases } from '../logic/lotGrouping';

const SOON_DAYS = 90;

const EXECUTIONS_HELP = 'A corretora pode executar uma ordem em várias partes, em bolsas diferentes e com frações de ação '
    + '(por exemplo 218 + 0,9856 + 0,0004). Cada parte é um lote FIFO, mas foram todas compradas no mesmo dia e passam '
    + 'os 365 dias na mesma data.';

const signColor = (value) => (value > 0.005 ? 'success.main' : value < -0.005 ? 'error.main' : 'text.primary');

const noPriceCell = <Typography variant="body2" color="text.disabled">Sem preço</Typography>;

const moneyCell = (params) => {
    if (params.row.noPrice) return noPriceCell;
    return (
        <Box component="span" sx={{ color: signColor(params.value), fontWeight: 500 }}>
            {formatCurrency(params.value)}
        </Box>
    );
};

const taxEffectCell = (params) => {
    if (params.row.noPrice) return noPriceCell;
    const value = params.value;
    if (Math.abs(value) < 0.005) return <Typography variant="body2" color="text.secondary">{formatCurrency(0)}</Typography>;
    return (
        <Box component="span" sx={{ color: value > 0 ? 'error.main' : 'success.main', fontWeight: 500 }}>
            {value > 0 ? '+' : ''}{formatCurrency(value)}
        </Box>
    );
};

// Rows without a current price sort as empty instead of as zero.
const pricedValue = (value, row) => (row.noPrice ? null : value);

const sectionPaperSx = { border: 1, borderColor: 'divider', borderRadius: 2 };

const BreakdownItem = ({ label, value, color }) => (
    <Box>
        <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, color: color || 'text.primary' }}>{formatCurrency(value)}</Typography>
    </Box>
);

export default function TaxSimulatorPage() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;
    const [onlyLosses, setOnlyLosses] = useState(false);
    const [selected, setSelected] = useState(null);

    // A position of another portfolio can't be simulated in this one.
    useEffect(() => { setSelected(null); }, [portfolioId]);

    const { data: status, isLoading, isError, refetch, isRefetching } = useQuery({
        queryKey: ['taxYearStatus', portfolioId],
        queryFn: () => apiFetchTaxYearStatus(portfolioId).then(res => res.data),
        enabled: Boolean(portfolioId),
        staleTime: 5 * 60 * 1000,
    });

    const { rows, unrealizedLosses, unrealizedGains, soonLongTerm } = useMemo(() => {
        const positions = status?.positions || [];
        let losses = 0;
        let gains = 0;
        const allRows = positions.map(p => {
            const noPrice = !(p.current_price_eur > 0);
            if (!noPrice) {
                if (p.unrealized_gain < 0) losses += p.unrealized_gain;
                else gains += p.unrealized_gain;
            }
            const shortLots = p.lots.filter(l => l.short_term);
            return {
                id: p.isin,
                ...p,
                noPrice,
                // Purchase days, not lots: one order filled in several executions is one purchase.
                shortPurchases: purchaseDates(shortLots).length,
                nextLongTerm: shortLots[0]?.long_term_date || null,
            };
        });

        return {
            rows: onlyLosses ? allRows.filter(r => !r.noPrice && r.unrealized_gain < 0) : allRows,
            unrealizedLosses: losses,
            unrealizedGains: gains,
            soonLongTerm: soonLongTermPurchases(positions, new Date(), SOON_DAYS),
        };
    }, [status, onlyLosses]);

    const columns = useMemo(() => [
        {
            field: 'product_name',
            headerName: 'Ativo',
            flex: 1.5,
            minWidth: 200,
            renderCell: (params) => (
                <Box sx={{ lineHeight: 1.2, py: 0.75, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{params.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{params.row.isin}</Typography>
                </Box>
            ),
        },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 90, valueFormatter: (value) => formatQuantity(value) },
        { field: 'cost_eur', headerName: 'Custo', type: 'number', width: 120, valueFormatter: (value) => formatCurrency(value) },
        {
            field: 'value_eur', headerName: 'Valor atual', type: 'number', width: 120,
            valueGetter: pricedValue,
            renderCell: (params) => (params.row.noPrice ? noPriceCell : formatCurrency(params.value)),
        },
        { field: 'unrealized_gain', headerName: 'Por realizar', type: 'number', width: 130, valueGetter: pricedValue, renderCell: moneyCell },
        {
            field: 'tax_effect_if_sold_all',
            headerName: 'Impacto no IRS',
            description: 'Quanto o IRS deste ano muda se venderes a posição toda hoje (+ pagas mais, − pagas menos).',
            type: 'number',
            width: 140,
            valueGetter: pricedValue,
            renderCell: taxEffectCell,
        },
        {
            field: 'shortPurchases',
            headerName: 'Compras < 365 dias',
            description: 'Compras feitas há menos de 365 dias (uma por dia) e a data em que a mais antiga delas os completa.',
            width: 210,
            renderCell: (params) => (params.value > 0
                ? (
                    <Chip
                        size="small"
                        sx={warningChipSx(theme)}
                        label={`${params.value} ${params.value === 1 ? 'compra' : 'compras'} · 365 dias a ${params.row.nextLongTerm}`}
                    />
                )
                : <Typography variant="body2" color="text.secondary">—</Typography>),
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
                    onClick={(e) => { e.stopPropagation(); setSelected(params.row); }}
                >
                    Simular
                </Button>
            ),
        },
    ], [theme]);

    if (!portfolioId) {
        return <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6">Selecione ou crie um portfólio.</Typography></Box>;
    }

    const balance = status?.balance;
    const year = balance?.year ?? new Date().getFullYear();
    const showContent = !isError;

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Simulador Fiscal</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720, mt: 0.5 }}>
                        Quanto ganhas e quanto pagas de IRS se venderes hoje, com as vendas que já fizeste em {year}.
                    </Typography>
                </Box>

                {isError && (
                    <Alert
                        severity="error"
                        action={<Button color="inherit" size="small" onClick={() => refetch()} disabled={isRefetching}>Tentar de novo</Button>}
                    >
                        Não foi possível carregar a situação fiscal.
                    </Alert>
                )}

                {showContent && (
                    <Box>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6} md={3}>
                                <MetricCard
                                    title={`Saldo realizado ${year}`}
                                    value={balance?.balance}
                                    isLoading={isLoading}
                                    colorOverride="text.primary"
                                    tooltipText="Mais-valias menos menos-valias das vendas de ações e das opções fechadas este ano, já sem comissões. É sobre este saldo, se positivo, que se paga IRS."
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <MetricCard
                                    title={`IRS estimado ${year}`}
                                    value={balance?.estimated_tax}
                                    isLoading={isLoading}
                                    colorOverride={balance?.estimated_tax > 0.005 ? 'error.main' : 'text.primary'}
                                    tooltipText="28% do saldo realizado, se for positivo (taxa autónoma, sem englobamento nem perdas de anos anteriores)."
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <MetricCard
                                    title="Perdas por realizar"
                                    value={unrealizedLosses}
                                    isLoading={isLoading}
                                    colorOverride={signColor(unrealizedLosses)}
                                    tooltipText="Soma das posições que hoje valem menos do que custaram. Vendê-las realiza a perda e abate aos ganhos deste ano."
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <MetricCard
                                    title="Ganhos por realizar"
                                    value={unrealizedGains}
                                    isLoading={isLoading}
                                    colorOverride={signColor(unrealizedGains)}
                                    tooltipText="Soma das posições que hoje valem mais do que custaram."
                                />
                            </Grid>
                        </Grid>

                        {balance && (
                            <Box
                                sx={{
                                    mt: 2.5, px: 2, py: 1.25, borderRadius: 2, bgcolor: 'action.hover',
                                    display: 'flex', flexWrap: 'wrap', columnGap: 4, rowGap: 1.5,
                                }}
                            >
                                <BreakdownItem label="Ganhos em ações" value={balance.stock_gains} color={signColor(balance.stock_gains)} />
                                <BreakdownItem label="Perdas em ações" value={balance.stock_losses} color={signColor(balance.stock_losses)} />
                                <BreakdownItem label="Resultado de opções" value={balance.options_result} color={signColor(balance.options_result)} />
                                {Math.abs(balance.short_term_result) >= 0.01 && (
                                    <BreakdownItem label="Dos quais lotes < 365 dias" value={balance.short_term_result} />
                                )}
                            </Box>
                        )}
                    </Box>
                )}

                {showContent && balance?.balance > 0 && unrealizedLosses < 0 && (
                    <LossHarvestCard portfolioId={portfolioId} balance={balance.balance} onSimulate={setSelected} />
                )}

                {showContent && (
                    <Paper elevation={0} sx={{ ...sectionPaperSx, overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>Posições</Typography>
                                <Typography variant="caption" color="text.secondary">Clica numa linha para simular a venda.</Typography>
                            </Box>
                            <FormControlLabel
                                control={<Switch checked={onlyLosses} onChange={(e) => setOnlyLosses(e.target.checked)} />}
                                label="Só com perdas"
                                sx={{ mr: 0 }}
                            />
                        </Box>
                        <DataGrid
                            rows={rows}
                            columns={columns}
                            loading={isLoading}
                            autoHeight
                            getRowHeight={() => 'auto'}
                            columnVisibilityModel={{ quantity: !isMobile, cost_eur: !isMobile }}
                            initialState={{
                                pagination: { paginationModel: { pageSize: 25 } },
                                sorting: { sortModel: [{ field: 'unrealized_gain', sort: 'asc' }] },
                            }}
                            pageSizeOptions={[10, 25, 50]}
                            disableRowSelectionOnClick
                            onRowClick={(params) => setSelected(params.row)}
                            localeText={{
                                ...ptPT.components.MuiDataGrid.defaultProps.localeText,
                                noRowsLabel: onlyLosses ? 'Nenhuma posição está com perdas.' : 'Sem posições abertas neste portfólio.',
                            }}
                            sx={{
                                border: 'none',
                                borderTop: 1,
                                borderColor: 'divider',
                                borderRadius: 0,
                                '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
                                '& .MuiDataGrid-row': { cursor: 'pointer' },
                                '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' },
                                '& .MuiDataGrid-cell--textRight': { justifyContent: 'flex-end' },
                                '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
                            }}
                        />
                    </Paper>
                )}

                {showContent && soonLongTerm.length > 0 && (
                    <Paper elevation={0} sx={{ ...sectionPaperSx, p: 2 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            Compras que passam os 365 dias nos próximos {SOON_DAYS} dias
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5, maxWidth: 720 }}>
                            Só conta se o teu rendimento coletável chegar ao último escalão: aí, os ganhos de títulos detidos
                            menos de 365 dias são englobados. Esperar até à data indicada evita isso.
                        </Typography>
                        {soonLongTerm.map((lot, index) => (
                            <Box
                                key={lot.key}
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr auto', sm: '110px 1fr auto' },
                                    columnGap: 2,
                                    rowGap: 0.25,
                                    alignItems: 'center',
                                    py: 1,
                                    borderBottom: index < soonLongTerm.length - 1 ? 1 : 0,
                                    borderColor: 'divider',
                                }}
                            >
                                <Chip size="small" sx={{ ...warningChipSx(theme), justifySelf: 'start' }} label={lot.long_term_date} />
                                <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}>
                                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{lot.product_name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {formatQuantity(lot.quantity)} unid. compradas a {lot.buy_date}
                                        {lot.executions > 1 && (
                                            <>
                                                {' · '}
                                                <Tooltip title={EXECUTIONS_HELP}>
                                                    <Box component="span" sx={{ textDecoration: 'underline dotted', cursor: 'help' }}>
                                                        {lot.executions} execuções
                                                    </Box>
                                                </Tooltip>
                                            </>
                                        )}
                                    </Typography>
                                </Box>
                                {lot.noPrice ? noPriceCell : (
                                    <Typography variant="body2" sx={{ color: signColor(lot.unrealized_gain), fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'right' }}>
                                        {formatCurrency(lot.unrealized_gain)}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Paper>
                )}

                <Typography variant="caption" color="text.secondary" component="p" sx={{ maxWidth: 820 }}>
                    Estimativas à taxa autónoma de 28% sobre o saldo anual. Os valores por realizar não incluem comissões; o "Simular" inclui-as.
                    Não considera o englobamento nem perdas de anos anteriores, e não é aconselhamento fiscal.
                </Typography>
            </Stack>

            <SaleSimulatorDrawer portfolioId={portfolioId} position={selected} onClose={() => setSelected(null)} />
        </Box>
    );
}
