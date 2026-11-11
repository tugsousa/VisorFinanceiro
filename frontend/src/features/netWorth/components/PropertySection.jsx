import React from 'react';
import { Box, Grid, Paper, Typography, Chip, LinearProgress, Tooltip } from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { formatISODate, formatPct, usageLabel } from '../logic/assetTypes';

const Figure = ({ label, value, hint, color }) => (
    <Box>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.65rem' }}>
            {label}
        </Typography>
        <Typography variant="body1" fontWeight={700} sx={{ color: color || 'text.primary' }}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
);

const signColor = (v) => (v > 0 ? 'success.main' : v < 0 ? 'error.main' : 'text.primary');

/** One card per property: market value, debt and equity, then what it earns and costs. */
const PropertySection = ({ assets }) => {
    const properties = assets.filter((a) => a.type === 'real_estate' && a.real_estate && !a.closed_at);
    if (properties.length === 0) return null;

    return (
        <>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>Imóveis</Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
                {properties.map((asset) => {
                    const m = asset.real_estate;
                    const d = asset.details || {};
                    const hasIncome = m.annual_rent_eur > 0 || m.annual_costs_eur > 0;
                    return (
                        <Grid item xs={12} md={6} key={asset.id}>
                            <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, height: '100%' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1 }}>
                                    <Typography variant="subtitle1" fontWeight={700}>{asset.name}</Typography>
                                    {d.usage && <Chip size="small" label={usageLabel(d.usage)} />}
                                </Box>

                                <Grid container spacing={2}>
                                    <Grid item xs={4}>
                                        <Figure label="Valor de mercado" value={formatCurrency(m.market_value_eur)}
                                            hint={asset.last_valuation_date ? `a ${formatISODate(asset.last_valuation_date)}` : null} />
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Figure label="Em dívida" value={formatCurrency(m.debt_eur)} color={m.debt_eur > 0 ? 'error.main' : undefined}
                                            hint={d.mortgage_payment ? `prestação ${formatCurrency(d.mortgage_payment)}` : null} />
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Figure label="Capital próprio" value={formatCurrency(m.equity_eur)} />
                                    </Grid>
                                </Grid>

                                {m.ltv_pct != null && (
                                    <Tooltip title="Percentagem do valor do imóvel que ainda está em dívida (LTV)">
                                        <Box sx={{ mt: 1.5 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="caption" color="text.secondary">Pago</Typography>
                                                <Typography variant="caption" color="text.secondary">Em dívida {formatPct(m.ltv_pct)}</Typography>
                                            </Box>
                                            <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, 100 - m.ltv_pct))} sx={{ height: 8, borderRadius: 4 }} />
                                        </Box>
                                    </Tooltip>
                                )}

                                {(m.appreciation_eur != null || hasIncome) && (
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        {m.appreciation_eur != null && (
                                            <Grid item xs={4}>
                                                <Figure label="Valorização" value={formatCurrency(m.appreciation_eur)} color={signColor(m.appreciation_eur)}
                                                    hint={`${formatPct(m.appreciation_pct)} sobre ${formatCurrency(m.total_cost_eur)}`} />
                                            </Grid>
                                        )}
                                        {m.annual_rent_eur > 0 && (
                                            <Grid item xs={4}>
                                                <Figure label="Renda anual" value={formatCurrency(m.annual_rent_eur)}
                                                    hint={m.gross_yield_pct != null ? `bruta ${formatPct(m.gross_yield_pct)} · líquida ${formatPct(m.net_yield_pct)}` : null} />
                                            </Grid>
                                        )}
                                        {m.annual_cash_flow_eur != null && (
                                            <Grid item xs={4}>
                                                <Tooltip title="Renda anual menos as despesas anuais e as prestações do crédito, antes de IRS.">
                                                    <Box>
                                                        <Figure label="Saldo anual" value={formatCurrency(m.annual_cash_flow_eur)} color={signColor(m.annual_cash_flow_eur)}
                                                            hint={m.annual_costs_eur > 0 ? `despesas ${formatCurrency(m.annual_costs_eur)}` : null} />
                                                    </Box>
                                                </Tooltip>
                                            </Grid>
                                        )}
                                    </Grid>
                                )}
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>
        </>
    );
};

export default PropertySection;
