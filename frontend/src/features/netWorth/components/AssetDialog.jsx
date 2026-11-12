import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Grid, Alert, Typography, Divider,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCreateOtherAsset, apiUpdateOtherAsset, netWorthErrorMessage } from '../api/netWorthApi';
import { ASSET_TYPES, CAPITALISATIONS, CERTIFICATE_SERIES, PROPERTY_USAGES, parseAmount, todayISO } from '../logic/assetTypes';
import { coinSymbol, isValidTicker, normalizeTicker, parseQuantity } from '../logic/crypto';
import DateField from '../../../components/ui/DateField';

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
    ticker: '',
    quantity: '',
    series: '',
    subscribedAt: '',
});

const formOf = (asset) => ({
    ...emptyForm(),
    ...(asset.type === 'real_estate' ? propertyOf(asset.details) : {}),
    type: asset.type,
    name: asset.name,
    ticker: coinSymbol(asset.details?.ticker),
    series: asset.details?.series || '',
    subscribedAt: asset.type === 'savings_certificate' ? asset.opened_at || '' : '',
    principal: asset.details?.principal ?? '',
    ratePct: asset.details?.rate_pct ?? '',
    openedAt: asset.opened_at || '',
    maturity: asset.details?.maturity || '',
    capitalisation: asset.details?.capitalisation || 'maturity',
    closedAt: asset.closed_at || '',
});

/**
 * Adds an asset, or edits one when `asset` is given. The fields change with the type: a term deposit asks for
 * its principal, TANB, dates and capitalisation; a cryptocurrency asks for the coin and, when added, the
 * quantity bought; the other types ask for their current value when added.
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
    const isCrypto = form.type === 'crypto';
    const isCertificate = form.type === 'savings_certificate';

    const mutation = useMutation({
        mutationFn: (payload) => (editing ? apiUpdateOtherAsset(asset.id, payload) : apiCreateOtherAsset(payload)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netWorth'] });
            queryClient.invalidateQueries({ queryKey: ['allocation'] }); // an asset counted in a group changed
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
        } else if (isCrypto) {
            // The coin can't change once the asset exists: its movements are quantities of that coin.
            if (!editing) {
                const ticker = normalizeTicker(form.ticker);
                if (!isValidTicker(ticker)) return setError('Indique o símbolo da moeda, por exemplo BTC. Só são suportados preços em EUR.');
                const quantity = parseQuantity(form.quantity);
                if (!(quantity > 0)) return setError('Indique a quantidade que tem.');
                payload.details = { ticker };
                payload.initial_quantity = quantity;
                if (String(form.value).trim() !== '') {
                    const cost = parseAmount(form.value);
                    if (!(cost >= 0)) return setError('Valor inválido em "Custo total".');
                    payload.initial_value = cost;
                }
                payload.initial_date = form.valueDate || todayISO();
            }
        } else if (!editing) {
            const value = parseAmount(form.value);
            if (!(value >= 0)) return setError('Indique o valor atual.');
            payload.initial_value = value;
            payload.initial_date = form.valueDate || todayISO();
        }
        if (isCertificate && form.series) {
            // Optional: with the series and the subscription date the app estimates the value between updates.
            if (!form.subscribedAt) return setError('Indique a data de subscrição do certificado, ou deixe a série em branco.');
            payload.details = { series: form.series };
            payload.opened_at = form.subscribedAt;
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
                            placeholder={isDeposit ? 'Ex.: DP 12 meses Banco X' : isProperty ? 'Ex.: Apartamento Lisboa' : isCrypto ? 'Ex.: Bitcoin' : 'Ex.: Conta poupança'} />
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
                                <DateField fullWidth label="Data de início" value={form.openedAt} onChange={set('openedAt')} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <DateField fullWidth label="Data de vencimento" value={form.maturity} onChange={set('maturity')} />
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

                    {isCrypto && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Símbolo da moeda" value={form.ticker} onChange={set('ticker')} disabled={editing}
                                    inputProps={{ maxLength: 14 }} placeholder="Ex.: BTC, ETH"
                                    helperText={editing ? 'A moeda não pode ser alterada' : 'O símbolo no Yahoo Finance, com preço em EUR'} />
                            </Grid>
                            {!editing && (
                                <>
                                    <Grid item xs={12} sm={6}>
                                        <TextField fullWidth label="Quantidade" value={form.quantity} onChange={set('quantity')} inputMode="decimal"
                                            helperText="Quantas moedas tem, por exemplo 0,5" />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField fullWidth label="Custo total (€) (opcional)" value={form.value} onChange={set('value')} inputMode="decimal"
                                            helperText="Quanto pagou por essa quantidade" />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <DateField fullWidth label="Data da compra" value={form.valueDate} onChange={set('valueDate')} inputProps={{ max: todayISO() }} />
                                    </Grid>
                                </>
                            )}
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">
                                    O valor é a quantidade × o preço atual no Yahoo Finance. Registe as compras e vendas seguintes em "Movimentos".
                                    As criptomoedas não entram no IRS nem no simulador de vendas.
                                </Typography>
                            </Grid>
                        </>
                    )}

                    {!isDeposit && !isCrypto && !editing && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label={isProperty ? 'Valor de mercado atual (€)' : 'Valor atual (€)'} value={form.value} onChange={set('value')} inputMode="decimal"
                                    helperText={form.type === 'savings_certificate' ? 'O valor indicado no AforroNet' : ' '} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <DateField fullWidth label="Data do valor" value={form.valueDate} onChange={set('valueDate')} inputProps={{ max: todayISO() }} />
                            </Grid>
                        </>
                    )}

                    {isCertificate && (
                        <>
                            <Grid item xs={12}><Divider textAlign="left"><Typography variant="caption" color="text.secondary">Estimativa entre atualizações (opcional)</Typography></Divider></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select fullWidth label="Série" value={form.series} onChange={set('series')}
                                    helperText="Como consta no AforroNet">
                                    <MenuItem value=""><em>Não indicar</em></MenuItem>
                                    {CERTIFICATE_SERIES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <DateField fullWidth label="Data de subscrição" value={form.subscribedAt} onChange={set('subscribedAt')} inputProps={{ max: todayISO() }} disabled={!form.series} />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">
                                    O património conta sempre o valor que indicar do AforroNet. Com a série e a data de subscrição, a
                                    aplicação mostra ao lado uma estimativa do valor atual, com os juros dos trimestres entretanto
                                    capitalizados. Registe um ativo por subscrição: cada uma tem as suas datas e o seu prémio de permanência.
                                    A aplicação só conhece as taxas do IGCP a partir de dezembro de 2024: se o último valor do AforroNet
                                    for mais antigo, a estimativa não avança até o atualizar.
                                </Typography>
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
                                <DateField fullWidth label="Data de compra" value={form.openedAt} onChange={set('openedAt')} />
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
                                <DateField fullWidth label="À data de" value={form.mortgageBalanceDate} onChange={set('mortgageBalanceDate')} helperText="Conta como dia de pagamento da prestação" />
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
                            <DateField fullWidth label="Data de fecho (opcional)" value={form.closedAt} onChange={set('closedAt')} helperText="A partir desta data deixa de contar" />
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
