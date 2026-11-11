// frontend/src/features/tax/components/SaleSimulatorDrawer.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Drawer, Box, Typography, IconButton, TextField, Button, Grid, Alert, Chip, CircularProgress,
    Table, TableHead, TableBody, TableRow, TableCell, TableContainer, InputAdornment, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import { apiSimulateSale, simulationErrorMessage } from '../api/taxApi';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';

const parseNumber = (text) => {
    const value = parseFloat(String(text).replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
};

// Waits until the user stops typing before asking the backend again.
const useDebounced = (value, delay = 400) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};

const HoldingPeriodChip = ({ lot }) => (
    lot.short_term ? (
        <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`${lot.days_held} dias · 365 a ${lot.long_term_date}`}
        />
    ) : (
        <Chip size="small" color="success" variant="outlined" label={`${lot.days_held} dias`} />
    )
);

/**
 * Side panel that simulates selling part of a position today: the FIFO lots used, the gain and the
 * extra IRS of this year.
 * @param {{isin: string, product_name: string, quantity: number} | null} position - null closes it.
 */
export default function SaleSimulatorDrawer({ portfolioId, position, onClose }) {
    const [quantityText, setQuantityText] = useState('');
    const [priceText, setPriceText] = useState('');
    const [commissionText, setCommissionText] = useState('');

    // Starts with the whole position each time another position is opened.
    useEffect(() => {
        if (position) {
            setQuantityText(String(position.quantity ?? ''));
            setPriceText('');
            setCommissionText('');
        }
    }, [position]);

    // Debounced as text: a new object on every render would never settle.
    const paramsText = useDebounced(JSON.stringify({
        isin: position?.isin ?? null,
        quantity: parseNumber(quantityText),
        price: parseNumber(priceText),
        commission: parseNumber(commissionText),
    }));
    const params = useMemo(() => JSON.parse(paramsText), [paramsText]);

    const { data: sim, error, isFetching } = useQuery({
        queryKey: ['taxSimulation', portfolioId, params],
        queryFn: () => apiSimulateSale(portfolioId, params).then(res => res.data),
        enabled: Boolean(position && portfolioId && params.isin && params.quantity > 0),
        placeholderData: keepPreviousData,
        retry: false,
        staleTime: 60 * 1000,
    });

    const year = sim ? sim.sale_date.slice(-4) : new Date().getFullYear();
    const plainTax = sim ? Math.max(sim.gain, 0) * sim.tax_rate : 0;
    const lossesLowerTheTax = sim && sim.gain > 0 && sim.marginal_tax < plainTax - 0.005;

    return (
        <Drawer anchor="right" open={Boolean(position)} onClose={onClose}>
            <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h5">Simular venda</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {position?.product_name} · {position?.isin}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Tens {formatQuantity(position?.quantity)} unidades
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} aria-label="fechar"><CloseIcon /></IconButton>
                </Box>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Quantidade"
                            value={quantityText}
                            onChange={(e) => setQuantityText(e.target.value)}
                            size="small"
                            fullWidth
                            inputProps={{ inputMode: 'decimal' }}
                            helperText={
                                <Button size="small" sx={{ p: 0, minWidth: 0 }} onClick={() => setQuantityText(String(position?.quantity ?? ''))}>
                                    Tudo
                                </Button>
                            }
                        />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Preço por unidade"
                            value={priceText}
                            onChange={(e) => setPriceText(e.target.value)}
                            size="small"
                            fullWidth
                            placeholder={sim?.used_current_price ? String(sim.price_eur.toFixed(2)) : ''}
                            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                            inputProps={{ inputMode: 'decimal' }}
                            helperText="Vazio = preço atual"
                        />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Comissão da venda"
                            value={commissionText}
                            onChange={(e) => setCommissionText(e.target.value)}
                            size="small"
                            fullWidth
                            placeholder="0"
                            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                            inputProps={{ inputMode: 'decimal' }}
                        />
                    </Grid>
                </Grid>

                {error && <Alert severity="warning" sx={{ mb: 2 }}>{simulationErrorMessage(error)}</Alert>}
                {!sim && isFetching && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}

                {sim && !error && (
                    <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                        <Grid container spacing={1.5} sx={{ mb: 2 }}>
                            <Grid item xs={6}>
                                <MetricCard
                                    title="Valor da venda"
                                    value={sim.sale_amount_eur}
                                    colorOverride="text.primary"
                                    tooltipText={`${formatQuantity(sim.quantity)} × ${formatCurrency(sim.price_eur)}${sim.used_current_price ? ' (preço atual)' : ''}`}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <MetricCard
                                    title="Mais/menos-valia"
                                    value={sim.gain}
                                    tooltipText="Valor de venda menos o custo de compra (em euros, ao câmbio de cada data) e menos as comissões de compra e de venda."
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <MetricCard
                                    title={`IRS estimado (${year})`}
                                    value={sim.marginal_tax}
                                    colorOverride={sim.marginal_tax > 0 ? 'error.main' : 'success.main'}
                                    tooltipText="Quanto o imposto do ano aumenta (ou diminui, se for negativo) com esta venda, à taxa de 28% sobre o saldo anual."
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <MetricCard
                                    title="Fica líquido"
                                    value={sim.net_proceeds}
                                    colorOverride="text.primary"
                                    tooltipText="Valor da venda menos a comissão da venda e o IRS estimado."
                                />
                            </Grid>
                        </Grid>

                        <Typography variant="body2" sx={{ mb: 1 }}>
                            Saldo de mais-valias de {year}: <b>{formatCurrency(sim.year_before.balance)}</b> → <b>{formatCurrency(sim.year_after.balance)}</b>
                        </Typography>
                        {lossesLowerTheTax && (
                            <Alert severity="success" sx={{ mb: 1 }}>
                                As perdas que já realizaste em {year} reduzem o imposto desta venda (sem elas seria {formatCurrency(plainTax)}).
                            </Alert>
                        )}
                        {sim.gain < 0 && sim.marginal_tax < 0 && (
                            <Alert severity="success" sx={{ mb: 1 }}>
                                Esta perda abate aos ganhos de {year} e reduz o imposto em {formatCurrency(-sim.marginal_tax)}.
                            </Alert>
                        )}
                        {Math.abs(sim.short_term_gain) >= 0.01 && (
                            <Alert severity="info" sx={{ mb: 1 }}>
                                {formatCurrency(sim.short_term_gain)} deste resultado vêm de lotes detidos há menos de 365 dias.
                                Se o teu rendimento coletável chegar ao último escalão de IRS, essa parte é obrigatoriamente
                                englobada (taxas progressivas em vez de 28%).
                            </Alert>
                        )}

                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Lotes vendidos</Typography>
                        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                            As vendas usam sempre os lotes mais antigos primeiro (FIFO), por isso não escolhes que lotes vendes.
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Compra</TableCell>
                                        <TableCell align="right">Qtd</TableCell>
                                        <TableCell align="right">Custo</TableCell>
                                        <TableCell align="right">Resultado</TableCell>
                                        <TableCell>Detido</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sim.lots.map((lot, index) => (
                                        <TableRow key={`${lot.buy_date}-${index}`}>
                                            <TableCell>
                                                {lot.buy_date}
                                                <Typography variant="caption" color="text.secondary" component="div">{lot.buy_source?.toUpperCase()}</Typography>
                                            </TableCell>
                                            <TableCell align="right">{formatQuantity(lot.quantity)}</TableCell>
                                            <TableCell align="right">{formatCurrency(lot.cost_eur)}</TableCell>
                                            <TableCell align="right" sx={{ color: lot.gain >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                                                {formatCurrency(lot.gain)}
                                            </TableCell>
                                            <TableCell><HoldingPeriodChip lot={lot} /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3 }}>
                            Estimativa à taxa autónoma de 28% sobre o saldo anual de mais e menos-valias (ações e opções).
                            Não considera o englobamento nem perdas de anos anteriores, e não é aconselhamento fiscal.
                        </Typography>
                    </Box>
                )}
            </Box>
        </Drawer>
    );
}
