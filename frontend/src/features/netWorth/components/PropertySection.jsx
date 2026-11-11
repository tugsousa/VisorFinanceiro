import React from 'react';
import { Box, Grid, Paper, Typography, Chip, LinearProgress, Stack, Divider } from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { formatISODate, formatPct, usageLabel } from '../logic/assetTypes';

/** An amount with an explicit sign, as in "+1.200,00 €" or "− 300,00 €". */
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`;
const minus = (v) => `−${formatCurrency(Math.abs(v))}`;

const signColor = (v) => (v > 0 ? 'success.main' : v < 0 ? 'error.main' : 'text.primary');

const captionSx = { fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', lineHeight: 1 };
const numberSx = { fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };

/** One line of a block: label on the left, amount on the right. A total gets a rule above and bold text. */
const Row = ({ label, value, color, total }) => (
    <Box
        sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2,
            ...(total && { borderTop: 1, borderColor: 'divider', pt: 0.75 }),
        }}
    >
        <Typography variant="body2" color={total ? 'text.primary' : 'text.secondary'} fontWeight={total ? 700 : 400}>
            {label}
        </Typography>
        <Typography variant="body2" sx={{ ...numberSx, fontWeight: total ? 700 : 600, color: color || 'text.primary' }}>
            {value}
        </Typography>
    </Box>
);

const BlockTitle = ({ children }) => (
    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>{children}</Typography>
);

/** Market value, debt and equity, with the appreciation since purchase. */
const WealthBlock = ({ m }) => {
    const hasDebt = m.debt_eur > 0;
    return (
        <Box>
            <BlockTitle>Património</BlockTitle>
            <Stack spacing={0.75}>
                <Row label="Valor de mercado" value={formatCurrency(m.market_value_eur)} />
                {hasDebt && <Row label="Crédito em dívida" value={minus(m.debt_eur)} />}
                <Row label="Capital próprio" value={formatCurrency(m.equity_eur)} total />
                {m.appreciation_eur != null && (
                    <Box>
                        <Row label="Valorização" value={signed(m.appreciation_eur)} color={signColor(m.appreciation_eur)} />
                        <Typography variant="caption" color="text.secondary" component="p" sx={{ textAlign: 'right' }}>
                            {m.appreciation_pct > 0 ? '+' : ''}{formatPct(m.appreciation_pct)} face ao custo de compra ({formatCurrency(m.total_cost_eur)})
                        </Typography>
                    </Box>
                )}
            </Stack>
            {hasDebt && m.ltv_pct != null && (
                <Box sx={{ mt: 1.5 }}>
                    <LinearProgress
                        variant="determinate"
                        value={Math.max(0, Math.min(100, m.ltv_pct))}
                        sx={{ height: 6, borderRadius: 3 }}
                    />
                    <Typography variant="caption" color="text.secondary">Crédito = {formatPct(m.ltv_pct)} do valor</Typography>
                </Box>
            )}
        </Box>
    );
};

/** Rent, costs and mortgage payments over a year, and what's left (or what the property costs). */
const IncomeBlock = ({ m, monthlyPayment }) => {
    const rent = m.annual_rent_eur || 0;
    const costs = m.annual_costs_eur || 0;
    const payments = m.annual_mortgage_payments_eur || 0;
    const cashFlow = m.annual_cash_flow_eur;
    const earnsRent = rent > 0;
    return (
        <Box>
            <BlockTitle>Rendimento e despesas (por ano)</BlockTitle>
            <Stack spacing={0.75}>
                {rent > 0 && <Row label="Renda" value={signed(rent)} />}
                {costs > 0 && <Row label="Despesas" value={minus(costs)} />}
                {payments > 0 && (
                    <Row
                        label={monthlyPayment > 0 ? `Prestações do crédito (${formatCurrency(monthlyPayment)}/mês)` : 'Prestações do crédito'}
                        value={minus(payments)}
                    />
                )}
                {cashFlow != null && (earnsRent
                    ? <Row label="Saldo anual" value={signed(cashFlow)} color={signColor(cashFlow)} total />
                    : <Row label="Custo anual do imóvel" value={minus(cashFlow)} total />)}
            </Stack>
            {m.gross_yield_pct != null && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                    Rentabilidade da renda: {formatPct(m.gross_yield_pct)} bruta
                    {m.net_yield_pct != null && ` · ${formatPct(m.net_yield_pct)} líquida`}
                </Typography>
            )}
        </Box>
    );
};

/** One card per property: equity first, then how it's made up, then what it earns and costs in a year. */
const PropertySection = ({ assets }) => {
    const properties = assets.filter((a) => a.type === 'real_estate' && a.real_estate && !a.closed_at);
    if (properties.length === 0) return null;

    return (
        <>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>Imóveis</Typography>
            <Stack spacing={3} sx={{ mb: 4 }}>
                {properties.map((asset) => {
                    const m = asset.real_estate;
                    const d = asset.details || {};
                    const hasIncome = m.annual_rent_eur > 0 || m.annual_costs_eur > 0 || m.annual_mortgage_payments_eur > 0;
                    return (
                        <Paper key={asset.id} elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2.5 }}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                        <Typography variant="subtitle1" fontWeight={700}>{asset.name}</Typography>
                                        {d.usage && <Chip size="small" label={usageLabel(d.usage)} />}
                                    </Box>
                                    {asset.last_valuation_date && (
                                        <Typography variant="caption" color="text.secondary">
                                            Avaliado em {formatISODate(asset.last_valuation_date)}
                                        </Typography>
                                    )}
                                </Box>
                                <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                                    <Typography variant="caption" color="text.secondary" component="p" sx={captionSx}>
                                        Capital próprio
                                    </Typography>
                                    <Typography
                                        variant="h6"
                                        sx={{ fontWeight: 700, fontSize: { xs: '1.1rem', md: '1.25rem' }, lineHeight: 1.2, mt: 0.5, letterSpacing: '-0.5px' }}
                                    >
                                        {formatCurrency(m.equity_eur)}
                                    </Typography>
                                </Box>
                            </Box>

                            <Grid container columnSpacing={4} rowSpacing={2}>
                                <Grid item xs={12} md={6}>
                                    <WealthBlock m={m} />
                                </Grid>
                                {hasIncome && (
                                    <>
                                        <Grid item xs={12} sx={{ display: { xs: 'block', md: 'none' } }}>
                                            <Divider />
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <IncomeBlock m={m} monthlyPayment={d.mortgage_payment} />
                                        </Grid>
                                    </>
                                )}
                            </Grid>
                        </Paper>
                    );
                })}
            </Stack>
        </>
    );
};

export default PropertySection;
