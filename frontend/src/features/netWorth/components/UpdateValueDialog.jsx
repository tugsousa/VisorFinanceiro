import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Alert, Typography, Box } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiAddOtherAssetEntry, netWorthErrorMessage } from '../api/netWorthApi';
import { parseAmount, todayISO } from '../logic/assetTypes';
import { aforroExplanation, canAcceptEstimate } from '../logic/aforro';
import { formatCurrency } from '../../../lib/utils/formatUtils';

/**
 * "Atualizar valor": adds a valuation entry with the asset's value on a date.
 *
 * A Certificado de Aforro with a series also shows here the app's estimate of its value: the last value
 * typed from AforroNet plus the interest capitalised since. The user either types the value from AforroNet,
 * as before, or accepts the estimate, which the server stores as a valuation marked as an estimate (it can be
 * deleted in "Movimentos"). The estimate never counts unless accepted.
 */
const UpdateValueDialog = ({ open, onClose, asset }) => {
    const queryClient = useQueryClient();
    const [value, setValue] = useState('');
    const [date, setDate] = useState(todayISO());
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setValue('');
            setDate(todayISO());
            setError('');
        }
    }, [open]);

    const mutation = useMutation({
        mutationFn: (entry) => apiAddOtherAssetEntry(asset.id, entry),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netWorth'] });
            queryClient.invalidateQueries({ queryKey: ['allocation'] }); // an asset counted in a group changed
            onClose();
        },
        onError: (err) => setError(netWorthErrorMessage(err)),
    });

    const handleSave = () => {
        const amount = parseAmount(value);
        if (!(amount >= 0)) return setError('Indique o valor.');
        mutation.mutate({ date, kind: 'valuation', amount });
    };

    const estimate = asset?.aforro_estimate;
    const explanation = aforroExplanation(estimate);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth={estimate ? 'sm' : 'xs'}>
            <DialogTitle>Atualizar valor</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {asset?.name}: valor atual {formatCurrency(asset?.value_eur)}.
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField fullWidth autoFocus label="Novo valor (€)" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal"
                            helperText={asset?.type === 'savings_certificate' ? 'O valor indicado no AforroNet' : undefined} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField fullWidth type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)}
                            InputLabelProps={{ shrink: true }} inputProps={{ max: todayISO() }} />
                    </Grid>
                </Grid>

                {estimate && (
                    <Alert severity={estimate.status === 'ok' ? 'info' : 'warning'} icon={false} sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            {estimate.value_eur > 0 ? `Estimativa da aplicação: ${formatCurrency(estimate.value_eur)}` : 'Sem estimativa'}
                        </Typography>
                        {explanation.map((line) => (
                            <Typography key={line} variant="caption" display="block" sx={{ mb: 0.5 }}>{line}</Typography>
                        ))}
                        {canAcceptEstimate(estimate) && (
                            <Box sx={{ mt: 1 }}>
                                <Button size="small" variant="outlined" sx={{ textTransform: 'none' }} disabled={mutation.isPending}
                                    onClick={() => mutation.mutate({ estimate: true })}>
                                    Usar a estimativa como valor
                                </Button>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                    Fica registada em "Movimentos" como estimativa e pode ser apagada. Quando indicar o valor do AforroNet, é esse que conta.
                                </Typography>
                            </Box>
                        )}
                    </Alert>
                )}
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button variant="contained" onClick={handleSave} disabled={mutation.isPending}>Guardar</Button>
            </DialogActions>
        </Dialog>
    );
};

export default UpdateValueDialog;
