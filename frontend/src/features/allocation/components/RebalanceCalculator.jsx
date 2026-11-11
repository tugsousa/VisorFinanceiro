import React, { useState } from 'react';
import {
    Box, Typography, Paper, Button, Alert, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
    CircularProgress, Grid,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import { apiFetchRebalancePlan, allocationErrorMessage } from '../api/allocationApi';
import {
    ALLOCATION_QUERY_KEY, formatPct, groupColor, rebalanceOutcome, taxDiffersFromSum, unsoldLines,
} from '../logic/allocationLogic';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';

const GroupName = ({ groups, groupId, name }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: groupColor(groups, groupId), flexShrink: 0 }} />
        {name}
    </Box>
);

const signed = (value) => `${value > 0 ? '+' : ''}${formatCurrency(value)}`;

/**
 * "Reequilibrar com vendas": the sales that would bring every group back to its target, what the money raised
 * would buy, and the IRS the sales would add to this year. Only computed when the user asks, and it only
 * simulates: nothing is sold.
 */
export default function RebalanceCalculator({ portfolioId, status }) {
    const [asked, setAsked] = useState(false);

    const { data: plan, isFetching, error } = useQuery({
        queryKey: [ALLOCATION_QUERY_KEY, 'rebalance', portfolioId],
        queryFn: () => apiFetchRebalancePlan(portfolioId).then(res => res.data),
        enabled: Boolean(portfolioId) && asked,
        staleTime: 60 * 1000,
    });

    const outcome = plan ? rebalanceOutcome(plan) : null;
    const unsold = plan ? unsoldLines(plan) : [];
    const buys = plan ? plan.lines.filter(l => l.buy_amount_eur > 0) : [];

    return (
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Reequilibrar com vendas</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                As vendas que levariam cada grupo ao alvo, o que comprar com esse dinheiro e o IRS que as vendas
                acrescentariam a este ano. É só uma simulação: nada é vendido.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button variant="outlined" onClick={() => setAsked(true)} disabled={asked && isFetching} sx={{ textTransform: 'none' }}>
                    {plan ? 'Vendas calculadas' : 'Calcular vendas'}
                </Button>
                {isFetching && <CircularProgress size={20} />}
            </Box>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{allocationErrorMessage(error, 'Não foi possível calcular.')}</Alert>}

            {plan && !error && outcome === 'on_target' && (
                <Alert severity="success" sx={{ mt: 2 }}>Nenhum grupo está acima do alvo: não há nada para vender.</Alert>
            )}

            {plan && !error && outcome === 'nothing_sellable' && (
                <Alert severity="info" sx={{ mt: 2 }}>
                    Há grupos acima do alvo, mas nada do que têm a mais se pode vender na corretora.
                </Alert>
            )}

            {plan && !error && outcome === 'plan' && (
                <>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12} sm={4}>
                            <MetricCard title="Total a vender" value={plan.total_sale_eur} colorOverride="text.primary"
                                subValue={plan.cash_used_eur > 0 ? (
                                    <Typography variant="caption" color="text.secondary">mais {formatCurrency(plan.cash_used_eur)} da liquidez</Typography>
                                ) : null} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <MetricCard title="Mais/menos-valias das vendas" value={plan.total_gain}
                                tooltipText="Pelo método FIFO: vendem-se primeiro as unidades compradas há mais tempo." />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <MetricCard title={`IRS estimado (${plan.year})`} value={plan.total_tax_eur}
                                colorOverride={plan.total_tax_eur > 0 ? 'error.main' : 'success.main'}
                                tooltipText="O imposto que todas estas vendas juntas acrescentam ao ano: 28% sobre o saldo anual de mais e menos-valias de ações e opções. Paga-se no ano seguinte."
                                subValue={(
                                    <Typography variant="caption" color="text.secondary">
                                        saldo do ano: {formatCurrency(plan.year_before.balance)} → {formatCurrency(plan.year_after.balance)}
                                    </Typography>
                                )} />
                        </Grid>
                    </Grid>

                    {plan.sales.length > 0 && (
                        <>
                            <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Vender</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Grupo</TableCell>
                                            <TableCell>Ativo</TableCell>
                                            <TableCell align="right">Unidades</TableCell>
                                            <TableCell align="right">Valor</TableCell>
                                            <TableCell align="right">Mais/menos-valia</TableCell>
                                            <TableCell align="right">IRS desta venda</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {plan.sales.map(sale => (
                                            <TableRow key={sale.isin}>
                                                <TableCell><GroupName groups={status.groups} groupId={sale.group_id} name={sale.group_name} /></TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>{sale.product_name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {formatCurrency(sale.price_eur)} / unidade · tens {formatQuantity(sale.held_quantity)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">{formatQuantity(sale.quantity)}</TableCell>
                                                <TableCell align="right">{formatCurrency(sale.sale_amount_eur)}</TableCell>
                                                <TableCell align="right" sx={{ color: sale.gain < 0 ? 'error.main' : 'success.main' }}>
                                                    {signed(sale.gain)}
                                                    {sale.short_term_gain !== 0 && (
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            {formatCurrency(sale.short_term_gain)} com menos de 365 dias
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">{signed(sale.marginal_tax)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                                            <TableCell />
                                            <TableCell />
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(plan.total_sale_eur)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{signed(plan.total_gain)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{signed(plan.total_tax_eur)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            {taxDiffersFromSum(plan) && (
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                                    O IRS total não é a soma das linhas: cada linha é essa venda sozinha, e o total é o de todas
                                    juntas, em que as menos-valias abatem às mais-valias do ano.
                                </Typography>
                            )}
                        </>
                    )}

                    {unsold.length > 0 && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            Estas vendas não chegam para pôr todos os grupos no alvo:
                            {unsold.map(u => (
                                <Box key={u.groupId} component="span" display="block">
                                    «{u.name}» fica com {formatCurrency(u.amount)} a mais{u.reason ? `, que ${u.reason}` : ''}.
                                </Box>
                            ))}
                        </Alert>
                    )}

                    <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Comprar com o valor das vendas</Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Grupo</TableCell>
                                    <TableCell align="right">Investir</TableCell>
                                    <TableCell>Comprar</TableCell>
                                    <TableCell align="right">Unidades</TableCell>
                                    <TableCell align="right">Custo</TableCell>
                                    <TableCell align="right">Sobra</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {buys.map(line => (
                                    <TableRow key={line.group_id}>
                                        <TableCell><GroupName groups={status.groups} groupId={line.group_id} name={line.name} /></TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(line.buy_amount_eur)}</TableCell>
                                        <TableCell>
                                            {line.buy_asset ? (
                                                <>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>{line.buy_asset.product_name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{formatCurrency(line.buy_asset.price_eur)} / unidade</Typography>
                                                </>
                                            ) : line.outside_broker ? (
                                                <>
                                                    <Typography variant="body2">Reforçar fora da corretora</Typography>
                                                    <Typography variant="caption" color="text.secondary">{(line.outside_broker_assets || []).join(', ')}</Typography>
                                                </>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary">
                                                    {line.includes_cash ? 'Fica em liquidez' : 'Sem ativo com preço no grupo'}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">{line.buy_asset ? formatQuantity(line.buy_shares) : '—'}</TableCell>
                                        <TableCell align="right">{line.buy_asset ? formatCurrency(line.buy_cost_eur) : '—'}</TableCell>
                                        <TableCell align="right">{formatCurrency(line.buy_leftover_eur)}</TableCell>
                                    </TableRow>
                                ))}
                                {buys.length === 0 && (
                                    <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Nada para comprar.</Typography></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Como ficam os grupos</Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Grupo</TableCell>
                                    <TableCell align="right">Antes</TableCell>
                                    <TableCell align="right">Depois</TableCell>
                                    <TableCell align="right">Alvo</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {plan.lines.map(line => (
                                    <TableRow key={line.group_id}>
                                        <TableCell><GroupName groups={status.groups} groupId={line.group_id} name={line.name} /></TableCell>
                                        <TableCell align="right">{formatPct(line.pct_before)}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600, color: line.outside_tolerance_after ? 'error.main' : 'text.primary' }}>
                                            {formatPct(line.pct_after)}
                                        </TableCell>
                                        <TableCell align="right">{formatPct(line.target_pct)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        Unidades inteiras ao preço atual, sem comissões. Só se vendem ativos da corretora com preço de mercado; a
                        liquidez de um grupo acima do alvo é usada antes de qualquer venda. O IRS é uma estimativa, a 28% sobre o
                        saldo do ano, e paga-se no ano seguinte: não é descontado do valor a reinvestir. Não é aconselhamento fiscal.
                        {plan.unassigned_value_eur > 0 && ` Os ativos sem grupo (${formatCurrency(plan.unassigned_value_eur)}) não entram nas contas.`}
                    </Typography>
                </>
            )}
        </Paper>
    );
}
