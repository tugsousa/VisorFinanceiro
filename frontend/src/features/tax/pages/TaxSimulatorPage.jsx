// frontend/src/features/tax/pages/TaxSimulatorPage.jsx
import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, Button, FormControlLabel, Switch, Chip, CircularProgress,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import SaleSimulatorDrawer from '../components/SaleSimulatorDrawer';
import { apiFetchTaxYearStatus } from '../api/taxApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';
import { parseDateRobust } from '../../../lib/utils/dateUtils';

const SOON_DAYS = 90;

const moneyCell = (params) => {
    if (params.row.noPrice) return <Typography variant="body2" color="text.disabled">Sem preço</Typography>;
    return (
        <Box sx={{ color: params.value > 0 ? 'success.main' : params.value < 0 ? 'error.main' : 'text.primary', fontWeight: 600 }}>
            {formatCurrency(params.value)}
        </Box>
    );
};

const taxEffectCell = (params) => {
    if (params.row.noPrice) return '';
    const value = params.value;
    if (Math.abs(value) < 0.005) return <Typography variant="body2" color="text.secondary">{formatCurrency(0)}</Typography>;
    return (
        <Box sx={{ color: value > 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
            {value > 0 ? '+' : ''}{formatCurrency(value)}
        </Box>
    );
};

export default function TaxSimulatorPage() {
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;
    const [onlyLosses, setOnlyLosses] = useState(false);
    const [selected, setSelected] = useState(null);

    const { data: status, isLoading, isError } = useQuery({
        queryKey: ['taxYearStatus', portfolioId],
        queryFn: () => apiFetchTaxYearStatus(portfolioId).then(res => res.data),
        enabled: Boolean(portfolioId),
        staleTime: 5 * 60 * 1000,
    });

    const { rows, unrealizedLosses, unrealizedGains, soonLongTerm } = useMemo(() => {
        const positions = status?.positions || [];
        const today = new Date();
        const limit = new Date(today.getTime() + SOON_DAYS * 24 * 60 * 60 * 1000);

        const soon = [];
        let losses = 0;
        let gains = 0;
        const allRows = positions.map(p => {
            const noPrice = !(p.current_price_eur > 0);
            if (!noPrice) {
                if (p.unrealized_gain < 0) losses += p.unrealized_gain;
                else gains += p.unrealized_gain;
            }
            const shortLots = p.lots.filter(l => l.short_term);
            shortLots.forEach(lot => {
                const date = parseDateRobust(lot.long_term_date);
                if (date && date <= limit) soon.push({ ...lot, product_name: p.product_name, isin: p.isin });
            });
            return {
                id: p.isin,
                ...p,
                noPrice,
                shortLots: shortLots.length,
                nextLongTerm: shortLots[0]?.long_term_date || null,
            };
        });
        soon.sort((a, b) => parseDateRobust(a.long_term_date) - parseDateRobust(b.long_term_date));

        return {
            rows: onlyLosses ? allRows.filter(r => !r.noPrice && r.unrealized_gain < 0) : allRows,
            unrealizedLosses: losses,
            unrealizedGains: gains,
            soonLongTerm: soon,
        };
    }, [status, onlyLosses]);

    const columns = [
        {
            field: 'product_name',
            headerName: 'Ativo',
            flex: 1.5,
            minWidth: 200,
            renderCell: (params) => (
                <Box sx={{ lineHeight: 1.2, py: 0.5 }}>
                    <Typography variant="body2" noWrap>{params.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{params.row.isin}</Typography>
                </Box>
            ),
        },
        { field: 'quantity', headerName: 'Qtd', type: 'number', width: 90, valueFormatter: (value) => formatQuantity(value) },
        { field: 'cost_eur', headerName: 'Custo', type: 'number', width: 120, valueFormatter: (value) => formatCurrency(value) },
        {
            field: 'value_eur', headerName: 'Valor atual', type: 'number', width: 120,
            renderCell: (params) => (params.row.noPrice ? '—' : formatCurrency(params.value)),
        },
        { field: 'unrealized_gain', headerName: 'Por realizar', type: 'number', width: 130, renderCell: moneyCell },
        {
            field: 'tax_effect_if_sold_all',
            headerName: 'IRS se vender tudo',
            description: `Quanto o IRS deste ano muda se venderes a posição toda hoje.`,
            type: 'number',
            width: 150,
            renderCell: taxEffectCell,
        },
        {
            field: 'shortLots',
            headerName: 'Lotes < 365 dias',
            width: 170,
            renderCell: (params) => (params.value > 0
                ? <Chip size="small" color="warning" variant="outlined" label={`${params.value} · próximo a ${params.row.nextLongTerm}`} />
                : <Typography variant="body2" color="text.secondary">—</Typography>),
        },
        {
            field: 'actions',
            headerName: '',
            width: 110,
            sortable: false,
            filterable: false,
            renderCell: (params) => (
                <Button size="small" variant="outlined" onClick={() => setSelected(params.row)}>Simular</Button>
            ),
        },
    ];

    if (!portfolioId) {
        return <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6">Selecione ou crie um portfólio.</Typography></Box>;
    }

    const balance = status?.balance;
    const year = balance?.year ?? new Date().getFullYear();

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h4">Simulador Fiscal</Typography>
                <Typography variant="body2" color="text.secondary">
                    Quanto ganhas e quanto pagas de IRS se venderes hoje, com as vendas que já fizeste em {year}.
                </Typography>
            </Box>

            {isError && <Alert severity="error" sx={{ mb: 3 }}>Não foi possível carregar a situação fiscal.</Alert>}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title={`Saldo realizado ${year}`}
                        value={balance?.balance}
                        isLoading={isLoading}
                        tooltipText="Mais-valias menos menos-valias das vendas de ações e das opções fechadas este ano, já sem comissões."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title={`IRS estimado ${year}`}
                        value={balance?.estimated_tax}
                        isLoading={isLoading}
                        colorOverride={balance?.estimated_tax > 0 ? 'error.main' : 'text.primary'}
                        tooltipText="28% do saldo realizado, se for positivo."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Perdas por realizar"
                        value={unrealizedLosses}
                        isLoading={isLoading}
                        tooltipText="Soma das posições que hoje valem menos do que custaram. Vendê-las realiza a perda e abate aos ganhos deste ano."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Ganhos por realizar"
                        value={unrealizedGains}
                        isLoading={isLoading}
                        tooltipText="Soma das posições que hoje valem mais do que custaram."
                    />
                </Grid>
            </Grid>

            {balance && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Ações: {formatCurrency(balance.stock_gains)} de ganhos e {formatCurrency(balance.stock_losses)} de perdas ·
                    Opções: {formatCurrency(balance.options_result)}
                    {Math.abs(balance.short_term_result) >= 0.01 && ` · Lotes com menos de 365 dias: ${formatCurrency(balance.short_term_result)}`}
                </Typography>
            )}

            {balance?.balance > 0 && unrealizedLosses < 0 && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    Já tens {formatCurrency(balance.balance)} de mais-valias em {year}. Vender posições com perdas antes do fim
                    do ano reduz o saldo e o imposto: vê a coluna "IRS se vender tudo" ou usa o filtro "Só com perdas".
                </Alert>
            )}

            <Paper elevation={0} sx={{ p: 2, mb: 4, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h6">Posições</Typography>
                    <FormControlLabel
                        control={<Switch checked={onlyLosses} onChange={(e) => setOnlyLosses(e.target.checked)} />}
                        label="Só com perdas"
                    />
                </Box>
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : (
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        autoHeight
                        getRowHeight={() => 'auto'}
                        initialState={{
                            pagination: { paginationModel: { pageSize: 25 } },
                            sorting: { sortModel: [{ field: 'unrealized_gain', sort: 'asc' }] },
                        }}
                        pageSizeOptions={[10, 25, 50]}
                        disableRowSelectionOnClick
                        localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                        sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }}
                    />
                )}
            </Paper>

            {soonLongTerm.length > 0 && (
                <Paper elevation={0} sx={{ p: 2, mb: 4, borderRadius: 3 }}>
                    <Typography variant="h6">Lotes que passam os 365 dias nos próximos {SOON_DAYS} dias</Typography>
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                        Só conta se o teu rendimento coletável chegar ao último escalão: aí, os ganhos de títulos detidos
                        menos de 365 dias são englobados. Esperar até à data indicada evita isso.
                    </Typography>
                    {soonLongTerm.map((lot, index) => (
                        <Box key={`${lot.isin}-${lot.buy_date}-${index}`} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider', gap: 2 }}>
                            <Typography variant="body2">
                                <b>{lot.long_term_date}</b> · {lot.product_name} · {formatQuantity(lot.quantity)} unid. compradas a {lot.buy_date}
                            </Typography>
                            <Typography variant="body2" sx={{ color: lot.unrealized_gain >= 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
                                {formatCurrency(lot.unrealized_gain)}
                            </Typography>
                        </Box>
                    ))}
                </Paper>
            )}

            <Typography variant="caption" color="text.secondary" component="p">
                Estimativas à taxa autónoma de 28% sobre o saldo anual. Os valores por realizar não incluem comissões; o "Simular" inclui-as.
                Não considera o englobamento nem perdas de anos anteriores, e não é aconselhamento fiscal.
            </Typography>

            <SaleSimulatorDrawer portfolioId={portfolioId} position={selected} onClose={() => setSelected(null)} />
        </Box>
    );
}
