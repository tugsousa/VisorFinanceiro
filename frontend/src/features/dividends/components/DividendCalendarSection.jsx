// frontend/src/features/dividends/components/DividendCalendarSection.jsx
import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, Chip, Tooltip, ToggleButton, ToggleButtonGroup, Skeleton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import DividendMonthChart from './DividendMonthChart';
import { apiFetchDividendCalendar } from '../api/dividendCalendarApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';
import {
    buildCalendarView, describeNet, STATUS_LABELS, SKIP_REASONS, NEAR_MONTHS, YEAR_MONTHS,
} from '../logic/calendarTransformers';

const NO_WITHHOLDING_HELP = 'Ainda não recebeu dividendos desta posição nos últimos 24 meses, por isso a retenção na fonte é desconhecida.';

// Columns hidden on phones, to keep the table readable.
const HIDE_ON_XS = { display: { xs: 'none', sm: 'table-cell' } };

const StatusChip = ({ event }) => {
    const status = STATUS_LABELS[event.status] || STATUS_LABELS.estimated;
    let help = '';
    if (event.status === 'announced') {
        help = event.exDateObj && event.exDateObj < new Date()
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

/** The payment date; "~" when estimated; the ex-date, said as such, when the payment date is unknown. */
const PayDate = ({ event }) => {
    if (!event.pay_date) {
        return (
            <Tooltip title="Data de pagamento desconhecida: sem histórico de pagamentos desta posição nem data anunciada. Mostra-se a data ex-dividendo.">
                <Typography variant="body2" color="text.secondary" component="span">ex. {event.ex_date}</Typography>
            </Tooltip>
        );
    }
    if (event.pay_date_estimated) {
        return (
            <Tooltip title="Data estimada a partir do tempo que esta posição costuma demorar a pagar.">
                <Typography variant="body2" color="text.secondary" component="span">~{event.pay_date}</Typography>
            </Tooltip>
        );
    }
    return <Typography variant="body2" component="span">{event.pay_date}</Typography>;
};

const Amount = ({ event, value }) => (
    <Typography variant="body2" component="span" color={event.status === 'estimated' ? 'text.secondary' : 'text.primary'}>
        {event.status === 'estimated' ? '~' : ''}{formatCurrency(value)}
    </Typography>
);

const NetAmount = ({ event }) => {
    if (event.net_eur === null || event.net_eur === undefined) {
        return (
            <Tooltip title={NO_WITHHOLDING_HELP}>
                <Typography variant="caption" color="text.disabled" component="span">sem histórico</Typography>
            </Tooltip>
        );
    }
    return <Amount event={event} value={event.net_eur} />;
};

/** The net of a group of dividends, with the companies without a net estimate named in a tooltip. */
const NetSummary = ({ split, capitalize = false }) => {
    let text = describeNet(split, formatCurrency);
    if (!text) return null;
    if (capitalize) text = text.charAt(0).toUpperCase() + text.slice(1);
    if (split.grossWithoutNet === 0) return <>{text}</>;
    return (
        <Tooltip title={`Sem estimativa de retenção para: ${split.withoutNet.join(', ')}. ${NO_WITHHOLDING_HELP}`}>
            <span style={{ textDecoration: 'underline dotted', cursor: 'help' }}>{text}</span>
        </Tooltip>
    );
};

const MonthHeader = ({ group }) => (
    <TableRow sx={{ bgcolor: 'action.hover' }}>
        <TableCell colSpan={8} sx={{ py: 0.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2 }}>
                <Typography variant="subtitle2">
                    {group.label}
                    <Typography component="span" variant="caption" color="text.secondary">
                        {' · '}{group.events.length} {group.events.length === 1 ? 'pagamento' : 'pagamentos'}
                    </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    bruto <b>{formatCurrency(group.split.gross)}</b> · <NetSummary split={group.split} />
                </Typography>
            </Box>
        </TableCell>
    </TableRow>
);

const EventRow = ({ event }) => (
    <TableRow hover>
        <TableCell sx={{ whiteSpace: 'nowrap' }}><PayDate event={event} /></TableCell>
        <TableCell sx={{ ...HIDE_ON_XS, whiteSpace: 'nowrap' }}>{event.ex_date}</TableCell>
        <TableCell>{event.product_name}</TableCell>
        <TableCell sx={{ ...HIDE_ON_XS, whiteSpace: 'nowrap' }} align="right">
            {formatQuantity(event.per_share)} {event.currency || ''}
        </TableCell>
        <TableCell sx={HIDE_ON_XS} align="right">{formatQuantity(event.quantity)}</TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}><Amount event={event} value={event.gross_eur} /></TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><NetAmount event={event} /></TableCell>
        <TableCell><StatusChip event={event} /></TableCell>
    </TableRow>
);

const CalendarTable = ({ groups, emptyText }) => {
    if (groups.length === 0) {
        return <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{emptyText}</Typography>;
    }
    return (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Pagamento</TableCell>
                        <TableCell sx={HIDE_ON_XS}>Ex-dividendo</TableCell>
                        <TableCell>Empresa</TableCell>
                        <TableCell sx={HIDE_ON_XS} align="right">Por ação</TableCell>
                        <TableCell sx={HIDE_ON_XS} align="right">Quantidade</TableCell>
                        <TableCell align="right">Bruto</TableCell>
                        <TableCell align="right">
                            <Tooltip title="Depois da retenção na fonte estrangeira, estimada com a dos seus dividendos desta posição nos últimos 24 meses. Antes do IRS em Portugal.">
                                <span>Líquido (est.)</span>
                            </Tooltip>
                        </TableCell>
                        <TableCell>Estado</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {groups.map(group => (
                        <React.Fragment key={group.key}>
                            <MonthHeader group={group} />
                            {group.events.map(e => <EventRow key={e.id} event={e} />)}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

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
    const next = calendarView.nextPayment;

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h5" sx={{ mb: 1 }}>Calendário de dividendos</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                Os valores assumem a quantidade que detém hoje; o direito a um dividendo depende de deter as ações na
                data ex-dividendo. Datas e valores por ação vêm do Yahoo Finance; o líquido usa a retenção na fonte dos
                seus dividendos de cada posição nos últimos 24 meses.
            </Alert>

            {isError && <Alert severity="error" sx={{ mb: 2 }}>Não foi possível carregar o calendário de dividendos.</Alert>}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                    <MetricCard
                        title={`Próximos ${NEAR_MONTHS} meses (bruto)`}
                        value={calendarView.near.gross}
                        isLoading={isLoading}
                        colorOverride="success.main"
                        tooltipText={`Dividendos ainda por receber com pagamento (ou data ex-dividendo, sem data de pagamento) até ${calendarView.nearLimit.toLocaleDateString('pt-PT')}.`}
                        subValue={!isLoading && calendarView.near.count > 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                <NetSummary split={calendarView.near} capitalize />
                            </Typography>
                        ) : null}
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <MetricCard
                        title="Próximo pagamento"
                        value={next ? next.gross_eur : null}
                        isLoading={isLoading}
                        tooltipText="O próximo dividendo ainda por receber, anunciado ou estimado."
                        subValue={!isLoading && next ? (
                            <Typography variant="caption" color="text.secondary">
                                {next.product_name} · <PayDate event={next} /> · {STATUS_LABELS[next.status]?.label}
                            </Typography>
                        ) : null}
                    />
                </Grid>
            </Grid>

            <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h6">Próximos {YEAR_MONTHS} meses por mês de pagamento</Typography>
                    {!isLoading && (
                        <Typography variant="body2" color="text.secondary">
                            bruto <b>{formatCurrency(calendarView.year.gross)}</b> · <NetSummary split={calendarView.year} />
                        </Typography>
                    )}
                </Box>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                    Sem data de pagamento, um dividendo conta no mês da data ex-dividendo.
                </Typography>
                {isLoading ? <Skeleton variant="rounded" height={220} /> : <DividendMonthChart months={calendarView.chartMonths} />}
            </Paper>

            <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                    <Typography variant="h6">{view === 'upcoming' ? 'Por receber' : 'Últimos 3 meses'}</Typography>
                    <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
                        <ToggleButton value="upcoming">Próximos {YEAR_MONTHS} meses</ToggleButton>
                        <ToggleButton value="past">Últimos 3 meses</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
                {isLoading ? (
                    <Skeleton variant="rounded" height={240} />
                ) : (
                    <CalendarTable
                        groups={view === 'upcoming' ? calendarView.upcomingMonths : calendarView.pastMonths}
                        emptyText={view === 'upcoming'
                            ? `Sem dividendos previstos nos próximos ${YEAR_MONTHS} meses.`
                            : 'Sem dividendos nos últimos 3 meses.'}
                    />
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
