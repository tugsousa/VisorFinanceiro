import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Alert, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiAddOtherAssetEntry, netWorthErrorMessage } from '../api/netWorthApi';
import { parseAmount, todayISO } from '../logic/assetTypes';
import { formatCurrency } from '../../../lib/utils/formatUtils';

/** "Atualizar valor": adds a valuation entry with the asset's value on a date. */
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
            onClose();
        },
        onError: (err) => setError(netWorthErrorMessage(err)),
    });

    const handleSave = () => {
        const amount = parseAmount(value);
        if (!(amount >= 0)) return setError('Indique o valor.');
        mutation.mutate({ date, kind: 'valuation', amount });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>Atualizar valor</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {asset?.name}: valor atual {formatCurrency(asset?.value_eur)}.
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField fullWidth autoFocus label="Novo valor (€)" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField fullWidth type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)}
                            InputLabelProps={{ shrink: true }} inputProps={{ max: todayISO() }} />
                    </Grid>
                </Grid>
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
