import React, { useState } from 'react';
import {
    Box, Typography, Paper, TextField, Button, Alert, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, InputAdornment, CircularProgress,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { apiFetchDepositPlan, allocationErrorMessage } from '../api/allocationApi';
import { ALLOCATION_QUERY_KEY, formatPct, groupColor, parseUserNumber } from '../logic/allocationLogic';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';

/**
 * Splits a deposit across the groups to get closer to the targets without selling, and shows how many
 * whole shares of each group's asset it buys.
 */
export default function DepositCalculator({ portfolioId, status }) {
    const [text, setText] = useState('');
    const [amount, setAmount] = useState(null);
    const parsed = parseUserNumber(text);
    const valid = parsed > 0;

    const { data: plan, isFetching, error } = useQuery({
        queryKey: [ALLOCATION_QUERY_KEY, 'deposit', portfolioId, amount],
        queryFn: () => apiFetchDepositPlan(portfolioId, amount).then(res => res.data),
        enabled: Boolean(portfolioId) && amount > 0,
        staleTime: 60 * 1000,
    });

    const submit = (e) => {
        e.preventDefault();
        if (valid) setAmount(parsed);
    };

    return (
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Quanto vais investir?</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Divide o próximo depósito pelos grupos para te aproximares dos alvos, sem vender nada: primeiro
                os grupos abaixo do alvo, em proporção ao que lhes falta.
            </Typography>

            <Box component="form" onSubmit={submit} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    label="Valor a investir"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    inputProps={{ inputMode: 'decimal' }}
                    InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                    sx={{ width: 200 }}
                />
                <Button type="submit" variant="contained" disabled={!valid} sx={{ textTransform: 'none' }}>Calcular</Button>
                {isFetching && <CircularProgress size={20} />}
            </Box>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{allocationErrorMessage(error, 'Não foi possível calcular.')}</Alert>}

            {plan && !error && (
                <>
                    <TableContainer sx={{ mt: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Grupo</TableCell>
                                    <TableCell align="right">Investir</TableCell>
                                    <TableCell>Comprar</TableCell>
                                    <TableCell align="right">Unidades</TableCell>
                                    <TableCell align="right">Custo</TableCell>
                                    <TableCell align="right">Sobra</TableCell>
                                    <TableCell align="right">Depois / alvo</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {plan.lines.map(line => {
                                    // A group that gets nothing buys nothing.
                                    const buys = line.amount_eur > 0;
                                    return (
                                    <TableRow key={line.group_id} sx={{ opacity: buys ? 1 : 0.6 }}>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: groupColor(status.groups, line.group_id) }} />
                                                {line.name}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(line.amount_eur)}</TableCell>
                                        <TableCell>
                                            {!buys ? (
                                                <Typography variant="body2" color="text.secondary">—</Typography>
                                            ) : line.asset ? (
                                                <>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>{line.asset.product_name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {line.asset.price_eur > 0 ? `${formatCurrency(line.asset.price_eur)} / unidade` : 'Sem preço'}
                                                    </Typography>
                                                </>
                                            ) : line.outside_broker ? (
                                                <>
                                                    <Typography variant="body2">Reforçar fora da corretora</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {(line.outside_broker_assets || []).join(', ')}
                                                    </Typography>
                                                </>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary">
                                                    {line.includes_cash ? 'Fica em liquidez' : 'Sem ativo com preço no grupo'}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">{buys && line.asset ? formatQuantity(line.shares) : '—'}</TableCell>
                                        <TableCell align="right">{buys && line.asset ? formatCurrency(line.cost_eur) : '—'}</TableCell>
                                        <TableCell align="right">{buys ? formatCurrency(line.leftover_eur) : '—'}</TableCell>
                                        <TableCell align="right">{formatPct(line.pct_after)} / {formatPct(line.target_pct)}</TableCell>
                                    </TableRow>
                                    );
                                })}
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(plan.amount_eur)}</TableCell>
                                    <TableCell />
                                    <TableCell />
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(plan.shares_cost_eur)}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(plan.leftover_eur)}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        Unidades inteiras ao preço atual, sem comissões. A sobra é o que não chega para mais uma unidade.
                        {status.other_assets_eur > 0 && ' Os ativos fora da corretora contam para as percentagens, mas só se compram ativos da corretora.'}
                        {plan.unassigned_value_eur > 0 && ` Os ativos sem grupo (${formatCurrency(plan.unassigned_value_eur)}) não entram nas contas.`}
                    </Typography>
                </>
            )}
        </Paper>
    );
}
