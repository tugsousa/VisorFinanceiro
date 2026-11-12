import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Alert, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiAddOtherAssetEntry, netWorthErrorMessage } from '../api/netWorthApi';
import { parseAmount, todayISO } from '../logic/assetTypes';
import { aforroExplanation } from '../logic/aforro';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import DateField from '../../../components/ui/DateField';

/**
 * "Atualizar valor": adds a valuation entry with the asset's value on a date.
 *
 * A Certificado de Aforro with a series is valued by the app from IGCP's rates; this dialog explains how. A
 * value typed here (from AforroNet) becomes the new starting point of that calculation, which is needed when
 * a quarter has no known rate.
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
                        <DateField fullWidth label="Data" value={date} onChange={(e) => setDate(e.target.value)}
                            inputProps={{ max: todayISO() }} />
                    </Grid>
                </Grid>

                {estimate && (
                    <Alert severity={estimate.status === 'ok' ? 'info' : 'warning'} icon={false} sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            {estimate.status === 'unavailable' ? 'Sem cálculo automático' : `Calculado pela aplicação: ${formatCurrency(estimate.value_eur)}`}
                        </Typography>
                        {explanation.map((line) => (
                            <Typography key={line} variant="caption" display="block" sx={{ mb: 0.5 }}>{line}</Typography>
                        ))}
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
