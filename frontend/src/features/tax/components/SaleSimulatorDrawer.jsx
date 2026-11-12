// frontend/src/features/tax/components/SaleSimulatorDrawer.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Drawer, Box, Typography, IconButton, TextField, Button, Grid, Alert, Chip, CircularProgress,
    Table, TableHead, TableBody, TableRow, TableCell, TableContainer, InputAdornment, Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';

import MetricCard from '../../analytics/components/MetricCard';
import { apiSimulateSale, simulationErrorMessage } from '../api/taxApi';
import { formatCurrency, formatQuantity } from '../../../lib/utils/formatUtils';

// Accepts "1.5", "1,5" and "1.000,50"; anything negative or unreadable counts as empty.
export const parseNumber = (text) => {
    let normalized = String(text).trim().replace(/\s/g, '');
    if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    const value = parseFloat(normalized);
    return Number.isFinite(value) && value > 0 ? value : 0;
};

// Outlined warning chips fail AA contrast on white; a tinted fill with dark text does not.
export const warningChipSx = (theme) => ({
    bgcolor: alpha(theme.palette.warning.main, 0.14),
    color: theme.palette.warning.dark,
    fontWeight: 500,
});

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
        <Chip size="small" sx={warningChipSx} label={`${lot.days_held} d · 365 a ${lot.long_term_date}`} />
    ) : (
        <Chip size="small" variant="outlined" label={`${lot.days_held} dias`} />
    )
);

/**
 * Side panel that simulates selling part of a position today: the FIFO lots used, the gain and the
 * extra IRS of this year.
 * @param {{isin: string, product_name: string, quantity: number, initialQuantity?: number} | null} position -
 *   null closes it. `quantity` is what's held; `initialQuantity`, when given, is the quantity it starts with.
 */
export default function SaleSimulatorDrawer({ portfolioId, position, onClose }) {
    const [quantityText, setQuantityText] = useState('');
    const [priceText, setPriceText] = useState('');
    const [commissionText, setCommissionText] = useState('');
    // Keeps the last position on screen while the drawer slides closed.
    const [shown, setShown] = useState(position);

    // Starts with the quantity given (or the whole position) each time another position is opened.
    useEffect(() => {
        if (position) {
            setShown(position);
            setQuantityText(String(position.initialQuantity ?? position.quantity ?? ''));
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

    const { data, error: queryError, isFetching } = useQuery({
        queryKey: ['taxSimulation', portfolioId, params],
        queryFn: () => apiSimulateSale(portfolioId, params).then(res => res.data),
        enabled: Boolean(position && portfolioId && params.isin && params.quantity > 0),
        // Keeps the last result while the user edits the same position, never another position's.
        placeholderData: (previous, previousQuery) => (previousQuery?.queryKey?.[2]?.isin === params.isin ? previous : undefined),
        retry: false,
        staleTime: 60 * 1000,
    });

    // Until the debounce catches up, the params still belong to the previously opened position.
    const isCurrent = Boolean(position) && params.isin === position.isin;
    const sim = isCurrent ? data : undefined;
    const error = isCurrent ? queryError : null;
    const waiting = Boolean(position) && !sim && !error && (isFetching || !isCurrent);

    const year = sim ? sim.sale_date.slice(-4) : new Date().getFullYear();
    const plainTax = sim ? Math.max(sim.gain, 0) * sim.tax_rate : 0;
    const lossesLowerTheTax = sim && sim.gain > 0 && sim.marginal_tax < plainTax - 0.005;

    return (
        <Drawer anchor="right" open={Boolean(position)} onClose={onClose}>
            <Box sx={{ width: { xs: '100vw', sm: 560 }, maxWidth: '100%', p: { xs: 2, sm: 3 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>Simular venda</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500, mt: 0.5 }}>{shown?.product_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {shown?.isin} · tens {formatQuantity(shown?.quantity)} unidades
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} aria-label="fechar"><CloseIcon /></IconButton>
                </Box>

                <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Quantidade"
                            value={quantityText}
                            onChange={(e) => setQuantityText(e.target.value)}
                            size="small"
                            fullWidth
                            inputProps={{ inputMode: 'decimal' }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <Button size="small" sx={{ minWidth: 0, px: 0.5 }} onClick={() => setQuantityText(String(shown?.quantity ?? ''))}>
                                            Tudo
                                        </Button>
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Preço"
                            value={priceText}
                            onChange={(e) => setPriceText(e.target.value)}
                            size="small"
                            fullWidth
                            placeholder={sim?.used_current_price ? sim.price_eur.toFixed(2).replace('.', ',') : ''}
                            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                            inputProps={{ inputMode: 'decimal' }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Comissão"
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
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, mb: 3 }}>
                    Deixa o preço vazio para usar o preço atual{sim?.used_current_price ? ` (${formatCurrency(sim.price_eur)})` : ''}.
                </Typography>

                {error && <Alert severity="warning" sx={{ mb: 2 }}>{simulationErrorMessage(error)}</Alert>}
                {waiting && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}

                {sim && !error && (
                    <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                        <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
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
                                    colorOverride={sim.marginal_tax > 0.005 ? 'error.main' : sim.marginal_tax < -0.005 ? 'success.main' : 'text.primary'}
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

                        <Box
                            sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1,
                                px: 2, py: 1.25, mb: 1.5, borderRadius: 2, bgcolor: 'action.hover',
                            }}
                        >
                            <Typography variant="body2" color="text.secondary">Saldo de mais-valias de {year}</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {formatCurrency(sim.year_before.balance)}
                                <Box component="span" sx={{ color: 'text.secondary', mx: 1 }}>→</Box>
                                {formatCurrency(sim.year_after.balance)}
                            </Typography>
                        </Box>
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
                                            <TableCell align="right" sx={{ color: lot.gain >= 0 ? 'success.main' : 'error.main', fontWeight: 500, whiteSpace: 'nowrap' }}>
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
