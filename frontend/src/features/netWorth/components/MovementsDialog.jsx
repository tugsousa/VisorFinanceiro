import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Grid, Alert, Typography,
    Table, TableHead, TableRow, TableCell, TableBody, IconButton, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiAddOtherAssetEntry, apiDeleteOtherAssetEntry, netWorthErrorMessage } from '../api/netWorthApi';
import { ENTRY_KIND_LABELS, MOVEMENT_KINDS, formatISODate, parseAmount, todayISO } from '../logic/assetTypes';
import { formatCurrency } from '../../../lib/utils/formatUtils';

/**
 * "Movimentos": the entries of a manual asset, newest first, and a form to add money moved in or out. The value
 * is the last valuation plus the movements after it.
 */
const MovementsDialog = ({ open, onClose, asset }) => {
    const queryClient = useQueryClient();
    const [form, setForm] = useState({ kind: 'contribution', amount: '', date: todayISO(), note: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm({ kind: 'contribution', amount: '', date: todayISO(), note: '' });
            setError('');
        }
    }, [open]);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['netWorth'] });
    const addMutation = useMutation({
        mutationFn: (entry) => apiAddOtherAssetEntry(asset.id, entry),
        onSuccess: () => {
            refresh();
            setForm((f) => ({ ...f, amount: '', note: '' }));
        },
        onError: (err) => setError(netWorthErrorMessage(err)),
    });
    const deleteMutation = useMutation({
        mutationFn: (entryId) => apiDeleteOtherAssetEntry(asset.id, entryId),
        onSuccess: refresh,
        onError: (err) => setError(netWorthErrorMessage(err, 'Não foi possível apagar.')),
    });

    const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
    const handleAdd = () => {
        const amount = parseAmount(form.amount);
        if (!(amount > 0)) return setError('Indique um valor maior que zero.');
        setError('');
        addMutation.mutate({ kind: form.kind, amount, date: form.date, note: form.note.trim() });
    };

    const entries = [...(asset?.entries || [])].reverse();

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Movimentos — {asset?.name}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    O valor do ativo é o último valor atualizado, mais as entregas e os juros e menos os levantamentos posteriores.
                </Typography>
                {entries.length === 0 ? (
                    <Typography variant="body2" sx={{ mb: 2 }}>Ainda não há movimentos.</Typography>
                ) : (
                    <Table size="small" sx={{ mb: 3 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Data</TableCell>
                                <TableCell>Tipo</TableCell>
                                <TableCell align="right">Valor</TableCell>
                                <TableCell>Nota</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {entries.map((e) => (
                                <TableRow key={e.id}>
                                    <TableCell>{formatISODate(e.date)}</TableCell>
                                    <TableCell>{ENTRY_KIND_LABELS[e.kind] || e.kind}</TableCell>
                                    <TableCell align="right" sx={{ color: e.kind === 'withdrawal' ? 'error.main' : 'text.primary' }}>
                                        {e.kind === 'withdrawal' ? '−' : ''}{formatCurrency(e.amount)}
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

                <Typography variant="subtitle2" sx={{ mb: 1 }}>Adicionar movimento</Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={3}>
                        <TextField select fullWidth size="small" label="Tipo" value={form.kind} onChange={set('kind')}>
                            {MOVEMENT_KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Valor (€)" value={form.amount} onChange={set('amount')} inputMode="decimal" />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" type="date" label="Data" value={form.date} onChange={set('date')}
                            InputLabelProps={{ shrink: true }} inputProps={{ max: todayISO() }} />
                    </Grid>
                    <Grid item xs={12} sm={3}>
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
