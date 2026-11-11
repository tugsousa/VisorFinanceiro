// frontend/src/features/dividends/components/DividendCalendarSection.jsx
import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, Chip, Tooltip, ToggleButton, ToggleButtonGroup, Skeleton, Divider,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import { apiFetchDividendCalendar } from '../api/dividendCalendarApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';
import { buildCalendarView, STATUS_LABELS, SKIP_REASONS, UPCOMING_DAYS } from '../logic/calendarTransformers';

const StatusChip = ({ event }) => {
    const status = STATUS_LABELS[event.status] || STATUS_LABELS.estimated;
    let help = '';
    if (event.status === 'announced') {
        help = event.exDateObj && event.dateObj && event.exDateObj < new Date() && !event.pay_date
            ? 'A data ex-dividendo já passou; o pagamento ainda não aparece nos ficheiros carregados.'
            : 'Datas anunciadas pela empresa. O valor por ação é o do último pagamento comparável.';
    } else if (event.status === 'estimated') {
        help = 'Estimativa: o dividendo do ano passado, um ano depois.';
    } else if (event.status === 'received') {
        help = 'Há uma transação de dividendo correspondente; os valores são os reais.';
    } else if (event.status === 'missed') {
        help = 'A data ex-dividendo e o pagamento esperado já passaram e não há transação correspondente nos ficheiros carregados.';
    }
    return (
        <Tooltip title={help}>
            <Chip size="small" label={status.label} color={status.color} variant={status.variant} />
        </Tooltip>
    );
};

const PayDate = ({ event }) => {
    if (!event.pay_date) {
        return (
            <Tooltip title="Sem histórico de pagamentos desta posição para estimar a data de pagamento.">
                <Typography variant="body2" color="text.disabled">—</Typography>
            </Tooltip>
        );
    }
    if (event.pay_date_estimated) {
        return (
            <Tooltip title="Data estimada a partir do tempo que esta posição costuma demorar a pagar.">
                <Typography variant="body2" color="text.secondary">~{event.pay_date}</Typography>
            </Tooltip>
        );
    }
    return <Typography variant="body2">{event.pay_date}</Typography>;
};

const NetAmount = ({ value }) => {
    if (value === null || value === undefined) {
        return (
            <Tooltip title="Sem histórico de retenção na fonte desta posição nos últimos 24 meses.">
                <Typography variant="body2" color="text.disabled">—</Typography>
            </Tooltip>
        );
    }
    return <Typography variant="body2">{formatCurrency(value)}</Typography>;
};

const columns = [
    { field: 'pay_date', headerName: 'Pagamento', width: 120, sortable: false, renderCell: (p) => <PayDate event={p.row} /> },
    { field: 'ex_date', headerName: 'Ex-dividendo', width: 120, sortable: false },
    { field: 'product_name', headerName: 'Empresa', flex: 1, minWidth: 180 },
    {
        field: 'per_share', headerName: 'Por ação', width: 110, sortable: false,
        valueFormatter: (value, row) => `${formatQuantity(value)} ${row.currency || ''}`,
    },
    { field: 'quantity', headerName: 'Quantidade', width: 100, valueFormatter: (value) => formatQuantity(value) },
    {
        field: 'gross_eur', headerName: 'Bruto', width: 110,
        renderCell: (p) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(p.value)}</Typography>,
    },
    { field: 'net_eur', headerName: 'Líquido (est.)', width: 120, renderCell: (p) => <NetAmount value={p.value} /> },
    { field: 'status', headerName: 'Estado', width: 130, renderCell: (p) => <StatusChip event={p.row} /> },
];

const MonthCard = ({ month }) => (
    <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="subtitle2">{month.label}</Typography>
            <Typography variant="subtitle2" color={month.gross > 0 ? 'success.main' : 'text.disabled'}>
                {formatCurrency(month.gross)}
            </Typography>
        </Box>
        {month.events.length > 0 && month.netComplete && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ textAlign: 'right' }}>
                líquido ~{formatCurrency(month.net)}
            </Typography>
        )}
        <Divider sx={{ my: 1 }} />
        {month.events.length === 0 ? (
            <Typography variant="caption" color="text.disabled">Sem dividendos previstos.</Typography>
        ) : (
            month.events.map(e => (
                <Box key={e.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                    <Tooltip title={`Ex-dividendo ${e.ex_date}${e.pay_date ? ` · pagamento ${e.pay_date_estimated ? '~' : ''}${e.pay_date}` : ''} · ${STATUS_LABELS[e.status]?.label || ''}`}>
                        <Typography variant="caption" noWrap sx={{ minWidth: 0, fontStyle: e.status === 'estimated' ? 'italic' : 'normal' }}>
                            {String(e.dateObj.getDate()).padStart(2, '0')} · {e.product_name}
                        </Typography>
                    </Tooltip>
                    <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(e.gross_eur)}</Typography>
                </Box>
            ))
        )}
    </Paper>
);

const DividendCalendarSection = () => {
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;
    const [view, setView] = useState('upcoming');

    const { data: calendar, isLoading, isError } = useQuery({
        queryKey: ['dividendCalendar', portfolioId],
        queryFn: () => apiFetchDividendCalendar(portfolioId).then(res => res.data),
        enabled: Boolean(portfolioId),
        staleTime: 30 * 60 * 1000,
    });

    const calendarView = useMemo(() => buildCalendarView(calendar), [calendar]);
    const rows = view === 'upcoming' ? calendarView.upcoming : calendarView.past;

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h5" sx={{ mb: 1 }}>Próximos dividendos</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                Os valores assumem a quantidade que detém hoje. O direito a um dividendo depende de deter as ações na
                data ex-dividendo. Datas e valores por ação vêm do Yahoo Finance; o líquido usa a retenção na fonte dos
                seus dividendos dos últimos 24 meses.
            </Alert>

            {isError && <Alert severity="error" sx={{ mb: 2 }}>Não foi possível carregar o calendário de dividendos.</Alert>}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <MetricCard
                        title={`Próximos ${UPCOMING_DAYS} dias (bruto)`}
                        value={calendarView.upcomingGross}
                        isLoading={isLoading}
                        colorOverride="success.main"
                        tooltipText={`Soma dos dividendos com pagamento (ou data ex-dividendo, sem data de pagamento) nos próximos ${UPCOMING_DAYS} dias.`}
                        subValue={!isLoading && calendarView.upcoming.length > 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                {calendarView.upcomingNetComplete ? 'Líquido estimado' : 'Líquido estimado (parcial)'}: {formatCurrency(calendarView.upcomingNet)}
                            </Typography>
                        ) : null}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <MetricCard
                        title="Próximos 12 meses (bruto)"
                        value={calendarView.yearGross}
                        isLoading={isLoading}
                        colorOverride="success.main"
                        tooltipText="Soma dos dividendos anunciados e estimados dos próximos 12 meses, pelo mês de pagamento."
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <MetricCard
                        title="Pagamentos previstos"
                        value={calendarView.months.reduce((n, m) => n + m.events.length, 0)}
                        unit="pagamentos"
                        isLoading={isLoading}
                        tooltipText="Número de pagamentos anunciados ou estimados nos próximos 12 meses."
                    />
                </Grid>
            </Grid>

            <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                    <Typography variant="h6">
                        {view === 'upcoming' ? `Nos próximos ${UPCOMING_DAYS} dias` : 'Últimos 3 meses'}
                    </Typography>
                    <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
                        <ToggleButton value="upcoming">Próximos {UPCOMING_DAYS} dias</ToggleButton>
                        <ToggleButton value="past">Últimos 3 meses</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
                {isLoading ? (
                    <Skeleton variant="rounded" height={160} />
                ) : (
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        autoHeight
                        density="compact"
                        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                        pageSizeOptions={[10, 25, 50]}
                        disableRowSelectionOnClick
                        disableColumnMenu
                        localeText={{
                            ...ptPT.components.MuiDataGrid.defaultProps.localeText,
                            noRowsLabel: view === 'upcoming'
                                ? `Sem dividendos previstos nos próximos ${UPCOMING_DAYS} dias.`
                                : 'Sem dividendos nos últimos 3 meses.',
                        }}
                        sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }}
                    />
                )}
            </Paper>

            <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
                <Typography variant="h6">Mês a mês (próximos 12 meses)</Typography>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
                    Cada dividendo aparece no mês de pagamento; sem data de pagamento, no mês da data ex-dividendo.
                    Os estimados aparecem em itálico.
                </Typography>
                {isLoading ? (
                    <Skeleton variant="rounded" height={240} />
                ) : (
                    <Grid container spacing={1.5}>
                        {calendarView.months.map(month => (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={month.key}>
                                <MonthCard month={month} />
                            </Grid>
                        ))}
                    </Grid>
                )}
                {calendar?.skipped?.length > 0 && (
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
                        Sem dados de dividendos para: {calendar.skipped.map(s => `${s.product_name || s.isin} (${SKIP_REASONS[s.reason] || s.reason})`).join(', ')}.
                    </Typography>
                )}
            </Paper>
        </Box>
    );
};

export default DividendCalendarSection;
