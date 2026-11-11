import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Grid, Alert, Typography, Divider,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCreateOtherAsset, apiUpdateOtherAsset, netWorthErrorMessage } from '../api/netWorthApi';
import { ASSET_TYPES, CAPITALISATIONS, PROPERTY_USAGES, parseAmount, todayISO } from '../logic/assetTypes';

// The property fields, all optional. Empty text means "not given".
const emptyProperty = () => ({
    usage: 'own_home',
    purchasePrice: '',
    purchaseCosts: '',
    mortgageBalance: '',
    mortgageBalanceDate: todayISO(),
    mortgageRatePct: '',
    mortgagePayment: '',
    monthlyRent: '',
    annualCosts: '',
});

const propertyOf = (details) => {
    const text = (v) => (v ? String(v) : '');
    return {
        usage: details?.usage || 'own_home',
        purchasePrice: text(details?.purchase_price),
        purchaseCosts: text(details?.purchase_costs),
        mortgageBalance: text(details?.mortgage_balance),
        mortgageBalanceDate: details?.mortgage_balance_date || todayISO(),
        mortgageRatePct: text(details?.mortgage_rate_pct),
        mortgagePayment: text(details?.mortgage_payment),
        monthlyRent: text(details?.monthly_rent),
        annualCosts: text(details?.annual_costs),
    };
};

/** The property details to send, or an error message. Empty fields become 0 (not given). */
const propertyPayload = (form) => {
    const amount = (text, label) => {
        if (String(text).trim() === '') return 0;
        const value = parseAmount(text);
        if (!(value >= 0)) throw new Error(`Valor inválido em "${label}".`);
        return value;
    };
    const details = {
        usage: form.usage,
        purchase_price: amount(form.purchasePrice, 'Preço de compra'),
        purchase_costs: amount(form.purchaseCosts, 'Custos de aquisição'),
        mortgage_balance: amount(form.mortgageBalance, 'Capital em dívida'),
        mortgage_rate_pct: amount(form.mortgageRatePct, 'TAN'),
        mortgage_payment: amount(form.mortgagePayment, 'Prestação mensal'),
        monthly_rent: amount(form.monthlyRent, 'Renda mensal'),
        annual_costs: amount(form.annualCosts, 'Despesas anuais'),
    };
    const hasMortgage = details.mortgage_balance > 0 || details.mortgage_payment > 0;
    if (hasMortgage) {
        if (!form.mortgageBalanceDate) throw new Error('Indique a data do capital em dívida.');
        details.mortgage_balance_date = form.mortgageBalanceDate;
    }
    return details;
};

const emptyForm = () => ({
    ...emptyProperty(),
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
    ...(asset.type === 'real_estate' ? propertyOf(asset.details) : {}),
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
    const isProperty = form.type === 'real_estate';

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
        if (isProperty) {
            try {
                payload.details = propertyPayload(form);
            } catch (err) {
                return setError(err.message);
            }
            payload.opened_at = form.openedAt || '';
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
                            placeholder={isDeposit ? 'Ex.: DP 12 meses Banco X' : isProperty ? 'Ex.: Apartamento Lisboa' : 'Ex.: Conta poupança'} />
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
                                <TextField fullWidth label={isProperty ? 'Valor de mercado atual (€)' : 'Valor atual (€)'} value={form.value} onChange={set('value')} inputMode="decimal"
                                    helperText={form.type === 'savings_certificate' ? 'O valor indicado no AforroNet' : ' '} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="date" label="Data do valor" value={form.valueDate} onChange={set('valueDate')}
                                    InputLabelProps={{ shrink: true }} inputProps={{ max: todayISO() }} />
                            </Grid>
                        </>
                    )}

                    {isProperty && (
                        <>
                            <Grid item xs={12}><Divider textAlign="left"><Typography variant="caption" color="text.secondary">Imóvel</Typography></Divider></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select fullWidth label="Uso" value={form.usage} onChange={set('usage')}>
                                    {PROPERTY_USAGES.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="date" label="Data de compra" value={form.openedAt} onChange={set('openedAt')}
                                    InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Preço de compra (€)" value={form.purchasePrice} onChange={set('purchasePrice')} inputMode="decimal" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Custos de aquisição (€)" value={form.purchaseCosts} onChange={set('purchaseCosts')} inputMode="decimal"
                                    helperText="IMT, Imposto do Selo, escritura, registo" />
                            </Grid>

                            <Grid item xs={12}><Divider textAlign="left"><Typography variant="caption" color="text.secondary">Crédito habitação (opcional)</Typography></Divider></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Capital em dívida (€)" value={form.mortgageBalance} onChange={set('mortgageBalance')} inputMode="decimal"
                                    helperText="O valor que consta no banco" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="date" label="À data de" value={form.mortgageBalanceDate} onChange={set('mortgageBalanceDate')}
                                    InputLabelProps={{ shrink: true }} helperText="Conta como dia de pagamento da prestação" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="TAN (%)" value={form.mortgageRatePct} onChange={set('mortgageRatePct')} inputMode="decimal"
                                    helperText="Euribor + spread" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Prestação mensal (€)" value={form.mortgagePayment} onChange={set('mortgagePayment')} inputMode="decimal" />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">
                                    A dívida desce todos os meses com a prestação (amortização à taxa indicada). Se a Euribor mudar,
                                    corrija o capital em dívida com o valor do banco.
                                </Typography>
                            </Grid>

                            <Grid item xs={12}><Divider textAlign="left"><Typography variant="caption" color="text.secondary">Rendimento e despesas (opcional)</Typography></Divider></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Renda mensal (€)" value={form.monthlyRent} onChange={set('monthlyRent')} inputMode="decimal"
                                    helperText={form.usage === 'rented' ? ' ' : 'Se gerar rendimento'} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Despesas anuais (€)" value={form.annualCosts} onChange={set('annualCosts')} inputMode="decimal"
                                    helperText="IMI, condomínio, seguros, manutenção" />
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
