import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Grid, Alert, Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCreateOtherAsset, apiUpdateOtherAsset, netWorthErrorMessage } from '../api/netWorthApi';
import { ASSET_TYPES, CAPITALISATIONS, parseAmount, todayISO } from '../logic/assetTypes';

const emptyForm = () => ({
    type: 'cash_account',
    name: '',
    value: '',
    valueDate: todayISO(),
    principal: '',
    ratePct: '',
    openedAt: todayISO(),
    maturity: '',
    capitalisation: 'maturity',
    closedAt: '',
});

const formOf = (asset) => ({
    ...emptyForm(),
    type: asset.type,
    name: asset.name,
    principal: asset.details?.principal ?? '',
    ratePct: asset.details?.rate_pct ?? '',
    openedAt: asset.opened_at || '',
    maturity: asset.details?.maturity || '',
    capitalisation: asset.details?.capitalisation || 'maturity',
    closedAt: asset.closed_at || '',
});

/**
 * Adds an asset, or edits one when `asset` is given. The fields change with the type: a term deposit asks for
 * its principal, TANB, dates and capitalisation; the other types ask for their current value when added.
 */
const AssetDialog = ({ open, onClose, asset }) => {
    const queryClient = useQueryClient();
    const editing = !!asset;
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(asset ? formOf(asset) : emptyForm());
            setError('');
        }
    }, [open, asset]);

    const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
    const isDeposit = form.type === 'term_deposit';

    const mutation = useMutation({
        mutationFn: (payload) => (editing ? apiUpdateOtherAsset(asset.id, payload) : apiCreateOtherAsset(payload)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netWorth'] });
            onClose();
        },
        onError: (err) => setError(netWorthErrorMessage(err)),
    });

    const handleSave = () => {
        const payload = { type: form.type, name: form.name.trim(), closed_at: form.closedAt || '' };
        if (!payload.name) return setError('Indique um nome.');

        if (isDeposit) {
            const principal = parseAmount(form.principal);
            const ratePct = parseAmount(form.ratePct);
            if (!(principal > 0)) return setError('Indique o capital depositado.');
            if (!(ratePct >= 0)) return setError('Indique a TANB.');
            if (!form.openedAt || !form.maturity) return setError('Indique as datas de início e de vencimento.');
            payload.opened_at = form.openedAt;
            payload.details = { principal, rate_pct: ratePct, maturity: form.maturity, capitalisation: form.capitalisation };
        } else if (!editing) {
            const value = parseAmount(form.value);
            if (!(value >= 0)) return setError('Indique o valor atual.');
            payload.initial_value = value;
            payload.initial_date = form.valueDate || todayISO();
        }
        setError('');
        mutation.mutate(payload);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{editing ? 'Editar ativo' : 'Adicionar ativo'}</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 0 }}>
                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth label="Tipo" value={form.type} onChange={set('type')} disabled={editing}>
                            {ASSET_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField fullWidth label="Nome" value={form.name} onChange={set('name')} inputProps={{ maxLength: 100 }}
                            placeholder={isDeposit ? 'Ex.: DP 12 meses Banco X' : 'Ex.: Conta poupança'} />
                    </Grid>

                    {isDeposit && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Capital (€)" value={form.principal} onChange={set('principal')} inputMode="decimal" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="TANB (%)" value={form.ratePct} onChange={set('ratePct')} inputMode="decimal"
                                    helperText="Taxa anual nominal bruta" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="date" label="Data de início" value={form.openedAt} onChange={set('openedAt')}
                                    InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="date" label="Data de vencimento" value={form.maturity} onChange={set('maturity')}
                                    InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField select fullWidth label="Capitalização dos juros" value={form.capitalisation} onChange={set('capitalisation')}>
                                    {CAPITALISATIONS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">
                                    O valor é calculado: juros pelos dias decorridos (base 365), com retenção na fonte de 28%. Deixa de crescer no vencimento.
                                </Typography>
                            </Grid>
                        </>
                    )}

                    {!isDeposit && !editing && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Valor atual (€)" value={form.value} onChange={set('value')} inputMode="decimal"
                                    helperText={form.type === 'savings_certificate' ? 'O valor indicado no AforroNet' : ' '} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="date" label="Data do valor" value={form.valueDate} onChange={set('valueDate')}
                                    InputLabelProps={{ shrink: true }} inputProps={{ max: todayISO() }} />
                            </Grid>
                        </>
                    )}

                    {editing && (
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth type="date" label="Data de fecho (opcional)" value={form.closedAt} onChange={set('closedAt')}
                                InputLabelProps={{ shrink: true }} helperText="A partir desta data deixa de contar" />
                        </Grid>
                    )}
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

export default AssetDialog;
