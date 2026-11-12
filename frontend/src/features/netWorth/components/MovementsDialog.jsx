import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Grid, Alert, Typography,
    Table, TableHead, TableRow, TableCell, TableBody, IconButton, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiAddOtherAssetEntry, apiDeleteOtherAssetEntry, netWorthErrorMessage } from '../api/netWorthApi';
import {
    CRYPTO_KIND_LABELS, CRYPTO_MOVEMENT_KINDS, ENTRY_KIND_LABELS, MOVEMENT_KINDS, formatISODate, parseAmount, todayISO,
} from '../logic/assetTypes';
import { coinSymbol, formatCoinPrice, formatQuantity, parseQuantity } from '../logic/crypto';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import DateField from '../../../components/ui/DateField';

const emptyForm = () => ({ kind: 'contribution', amount: '', quantity: '', date: todayISO(), note: '' });

/**
 * "Movimentos": the entries of an asset, newest first, and a form to add one.
 *
 * For a manual asset they're money moved in or out, and the value is the last valuation plus the movements
 * after it. For a cryptocurrency they're purchases and sales of a quantity of the coin; the amount paid or
 * received is optional, and the value is the quantity held × the current price.
 */
const MovementsDialog = ({ open, onClose, asset }) => {
    const queryClient = useQueryClient();
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(emptyForm());
            setError('');
        }
    }, [open]);

    const isCrypto = asset?.type === 'crypto';
    const symbol = coinSymbol(asset?.details?.ticker);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['netWorth'] });
        queryClient.invalidateQueries({ queryKey: ['allocation'] }); // an asset counted in a group changed
    };
    const addMutation = useMutation({
        mutationFn: (entry) => apiAddOtherAssetEntry(asset.id, entry),
        onSuccess: () => {
            refresh();
            setForm((f) => ({ ...f, amount: '', quantity: '', note: '' }));
        },
        onError: (err) => setError(netWorthErrorMessage(err)),
    });
    const deleteMutation = useMutation({
        mutationFn: (entryId) => apiDeleteOtherAssetEntry(asset.id, entryId),
        onSuccess: () => {
            setError('');
            refresh();
        },
        onError: (err) => setError(netWorthErrorMessage(err, 'Não foi possível apagar.')),
    });

    const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
    const handleAdd = () => {
        const entry = { kind: form.kind, date: form.date, note: form.note.trim() };
        if (isCrypto) {
            entry.quantity = parseQuantity(form.quantity);
            if (!(entry.quantity > 0)) return setError('Indique a quantidade.');
            entry.amount = String(form.amount).trim() === '' ? 0 : parseAmount(form.amount);
            if (!(entry.amount >= 0)) return setError('Valor inválido.');
        } else {
            entry.amount = parseAmount(form.amount);
            if (!(entry.amount > 0)) return setError('Indique um valor maior que zero.');
        }
        setError('');
        addMutation.mutate(entry);
    };

    const entries = [...(asset?.entries || [])].reverse();
    const kindLabel = (kind) => (isCrypto ? CRYPTO_KIND_LABELS[kind] : ENTRY_KIND_LABELS[kind]) || kind;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Movimentos — {asset?.name}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {isCrypto
                        ? `O valor é a quantidade de ${symbol} que tem × o preço atual. `
                            + (asset?.quantity > 0
                                ? `Tem ${formatQuantity(asset.quantity)} ${symbol}${asset.price_eur ? `, a ${formatCoinPrice(asset.price_eur)} cada` : ''}.`
                                : 'Neste momento não tem saldo.')
                        : 'O valor do ativo é o último valor atualizado, mais as entregas e os juros e menos os levantamentos posteriores.'}
                </Typography>
                {entries.length === 0 ? (
                    <Typography variant="body2" sx={{ mb: 2 }}>Ainda não há movimentos.</Typography>
                ) : (
                    <Table size="small" sx={{ mb: 3 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Data</TableCell>
                                <TableCell>Tipo</TableCell>
                                {isCrypto && <TableCell align="right">Quantidade</TableCell>}
                                <TableCell align="right">Valor</TableCell>
                                <TableCell>Nota</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((e) => (
                                <TableRow key={e.id}>
                                    <TableCell>{formatISODate(e.date)}</TableCell>
                                    <TableCell>{kindLabel(e.kind)}</TableCell>
                                    {isCrypto && (
                                        <TableCell align="right" sx={{ color: e.kind === 'withdrawal' ? 'error.main' : 'text.primary' }}>
                                            {e.kind === 'withdrawal' ? '−' : ''}{formatQuantity(e.quantity ?? 0)}
                                        </TableCell>
                                    )}
                                    <TableCell align="right" sx={{ color: !isCrypto && e.kind === 'withdrawal' ? 'error.main' : 'text.primary' }}>
                                        {isCrypto && !(e.amount > 0)
                                            ? '—'
                                            : `${!isCrypto && e.kind === 'withdrawal' ? '−' : ''}${formatCurrency(e.amount)}`}
                                    </TableCell>
                                    <TableCell>{e.note}</TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Apagar">
                                            <IconButton size="small" onClick={() => deleteMutation.mutate(e.id)} disabled={deleteMutation.isPending}>
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                <Typography variant="subtitle2" sx={{ mb: 1 }}>{isCrypto ? 'Adicionar compra ou venda' : 'Adicionar movimento'}</Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={isCrypto ? 4 : 3}>
                        <TextField select fullWidth size="small" label="Tipo" value={form.kind} onChange={set('kind')}>
                            {(isCrypto ? CRYPTO_MOVEMENT_KINDS : MOVEMENT_KINDS).map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
                        </TextField>
                    </Grid>
                    {isCrypto && (
                        <Grid item xs={12} sm={4}>
                            <TextField fullWidth size="small" label={`Quantidade (${symbol})`} value={form.quantity} onChange={set('quantity')} inputMode="decimal" />
                        </Grid>
                    )}
                    <Grid item xs={12} sm={isCrypto ? 4 : 3}>
                        <TextField fullWidth size="small" value={form.amount} onChange={set('amount')} inputMode="decimal"
                            label={isCrypto ? (form.kind === 'withdrawal' ? 'Valor recebido (€) (opcional)' : 'Valor pago (€) (opcional)') : 'Valor (€)'} />
                    </Grid>
                    <Grid item xs={12} sm={isCrypto ? 4 : 3}>
                        <DateField fullWidth size="small" label="Data" value={form.date} onChange={set('date')} inputProps={{ max: todayISO() }} />
                    </Grid>
                    <Grid item xs={12} sm={isCrypto ? 8 : 3}>
                        <TextField fullWidth size="small" label="Nota" value={form.note} onChange={set('note')} inputProps={{ maxLength: 200 }} />
                    </Grid>
                </Grid>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Fechar</Button>
                <Button variant="contained" onClick={handleAdd} disabled={addMutation.isPending}>Adicionar</Button>
            </DialogActions>
        </Dialog>
    );
};

export default MovementsDialog;
