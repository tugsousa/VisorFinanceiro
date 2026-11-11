import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Select, MenuItem,
    Checkbox, Button, Alert, Chip, Tooltip, Link,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiSaveAllocationAssignments, allocationErrorMessage } from '../api/allocationApi';
import {
    ALLOCATION_QUERY_KEY, groupColor, initialAssignments, initialOtherChoices, otherAssetsPayload, otherChoicesChanged,
} from '../logic/allocationLogic';
import { formatISODate, typeLabel } from '../../netWorth/logic/assetTypes';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const Dot = ({ color }) => (
    <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: color, mr: 1 }} />
);

/** The select of the group of a holding or of an asset outside the brokers. */
const GroupSelect = ({ groups, value, onChange, disabled, label }) => (
    <Select
        size="small"
        value={value || ''}
        displayEmpty
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || '')}
        sx={{ minWidth: 180 }}
        inputProps={{ 'aria-label': label }}
        renderValue={(selected) => {
            if (!selected) return <Typography variant="body2" color="text.secondary">Sem grupo</Typography>;
            const g = groups.find(x => x.id === selected);
            return <Box sx={{ display: 'flex', alignItems: 'center' }}><Dot color={groupColor(groups, selected)} />{g?.name}</Box>;
        }}
    >
        <MenuItem value=""><em>Sem grupo</em></MenuItem>
        {groups.map(g => (
            <MenuItem key={g.id} value={g.id}><Dot color={groupColor(groups, g.id)} />{g.name}</MenuItem>
        ))}
    </Select>
);

/** The line under the name of an asset outside the brokers: its type and what its value is. */
const otherAssetCaption = (asset) => {
    const parts = [typeLabel(asset.type)];
    if (asset.type === 'real_estate') parts.push('capital próprio (valor menos o crédito)');
    if (asset.last_valuation_date) parts.push(`valor de ${formatISODate(asset.last_valuation_date)}`);
    return parts.join(' · ');
};

/**
 * Puts each holding in a group, and marks the asset to buy for each group. Holdings in no group yet
 * start in the group suggested for them (bond funds in the bonds group, the rest in the shares group).
 *
 * Under them, the assets the user keeps outside the brokers (Certificados de Aforro, deposits, property…) can
 * be counted in a group too. They belong to the user, not to the portfolio, so this is a choice: they start in
 * no group, get no suggestion, and are never something to buy.
 */
export default function AssignmentsEditor({ portfolioId, status }) {
    const queryClient = useQueryClient();
    const initial = useMemo(() => initialAssignments(status.holdings), [status.holdings]);
    const initialOther = useMemo(() => initialOtherChoices(status.other_assets), [status.other_assets]);
    const [choices, setChoices] = useState(initial);
    const [otherChoices, setOtherChoices] = useState(initialOther);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => setChoices(initial), [initial]);
    useEffect(() => setOtherChoices(initialOther), [initialOther]);

    const groups = status.groups || [];
    const holdings = status.holdings || [];
    const otherAssets = status.other_assets || [];
    const pendingSuggestions = holdings.filter(h => choices[h.isin]?.suggested).length;
    const dirty = holdings.some(h => {
        const c = choices[h.isin] || {};
        return (c.groupId || null) !== (h.group_id || null) || Boolean(c.preferred) !== Boolean(h.preferred);
    }) || otherChoicesChanged(otherAssets, otherChoices);

    const save = useMutation({
        mutationFn: () => apiSaveAllocationAssignments(
            portfolioId,
            holdings
                .filter(h => choices[h.isin]?.groupId)
                .map(h => ({ isin: h.isin, group_id: choices[h.isin].groupId, preferred: Boolean(choices[h.isin].preferred) })),
            otherAssetsPayload(otherAssets, otherChoices),
        ),
        onSuccess: () => {
            setError('');
            setSaved(true);
            queryClient.invalidateQueries({ queryKey: [ALLOCATION_QUERY_KEY] });
        },
        onError: (err) => setError(allocationErrorMessage(err, 'Não foi possível guardar as atribuições.')),
    });

    const setGroup = (isin, groupId) => {
        setSaved(false);
        setChoices(current => ({ ...current, [isin]: { groupId, preferred: false, suggested: false } }));
    };

    const setOtherGroup = (assetId, groupId) => {
        setSaved(false);
        setOtherChoices(current => ({ ...current, [assetId]: groupId }));
    };

    // Only one preferred asset per group.
    const setPreferred = (isin, preferred) => {
        setSaved(false);
        setChoices(current => {
            const groupId = current[isin]?.groupId;
            const next = {};
            Object.entries(current).forEach(([key, c]) => {
                if (key === isin) next[key] = { ...c, preferred, suggested: false };
                else if (preferred && c.groupId === groupId) next[key] = { ...c, preferred: false };
                else next[key] = c;
            });
            return next;
        });
    };

    return (
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Ativos de cada grupo</Typography>
            {holdings.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Este portfólio não tem posições abertas.</Typography>
            ) : (
                <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Escolhe o grupo de cada ativo. Marca em «Comprar» o ativo a comprar para o grupo; se nenhum estiver
                        marcado, a calculadora usa o maior ativo do grupo.
                    </Typography>
                    {pendingSuggestions > 0 && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {pendingSuggestions === 1 ? '1 ativo tem' : `${pendingSuggestions} ativos têm`} um grupo sugerido
                            (fundos sobretudo de obrigações em «Obrigações», o resto em «Ações»). Confirma e guarda.
                        </Alert>
                    )}

                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Ativo</TableCell>
                                    <TableCell align="right">Valor</TableCell>
                                    <TableCell sx={{ minWidth: 200 }}>Grupo</TableCell>
                                    <TableCell align="center">Comprar</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {holdings.map(h => {
                                    const choice = choices[h.isin] || { groupId: '' };
                                    return (
                                        <TableRow key={h.isin} hover>
                                            <TableCell>
                                                <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>{h.product_name}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {h.isin}{h.bond_share_pct > 0 ? ` · ${h.bond_share_pct.toLocaleString('pt-PT')}% obrigações` : ''}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatCurrency(h.value_eur)}
                                                {h.valued_at_cost && (
                                                    <Tooltip title="Sem preço de mercado: conta pelo custo.">
                                                        <Typography variant="caption" color="warning.main" display="block">ao custo</Typography>
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <GroupSelect groups={groups} value={choice.groupId} onChange={(groupId) => setGroup(h.isin, groupId)}
                                                        label={`Grupo de ${h.product_name}`} />
                                                    {choice.suggested && <Chip size="small" label="sugerido" variant="outlined" color="info" />}
                                                </Box>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Checkbox
                                                    size="small"
                                                    checked={Boolean(choice.preferred)}
                                                    disabled={!choice.groupId}
                                                    onChange={(e) => setPreferred(h.isin, e.target.checked)}
                                                    inputProps={{ 'aria-label': `Comprar ${h.product_name}` }}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            <Typography variant="subtitle1" fontWeight="bold" sx={{ mt: 3 }}>Fora da corretora</Typography>
            {otherAssets.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Tens poupanças fora da corretora (Certificados de Aforro, depósitos, PPR…)? Regista-as em{' '}
                    <Link component={RouterLink} to="/net-worth">Património</Link> para as poderes contar num grupo.
                </Typography>
            ) : (
                <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Os ativos que registaste em <Link component={RouterLink} to="/net-worth">Património</Link> podem contar num
                        grupo, por exemplo os Certificados de Aforro em «Obrigações». Entram nas percentagens pelo valor que contam
                        no património, mas não são comprados nem vendidos aqui. Deixa «Sem grupo» os que não fazem parte desta
                        alocação.
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Ativo</TableCell>
                                    <TableCell align="right">Valor</TableCell>
                                    <TableCell sx={{ minWidth: 200 }}>Grupo</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {otherAssets.map(a => (
                                    <TableRow key={a.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>{a.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{otherAssetCaption(a)}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            {formatCurrency(a.value_eur)}
                                            {a.not_counted && (
                                                <Typography variant="caption" color="warning.main" display="block">
                                                    {a.not_counted === 'closed' ? 'fechado: não conta' : 'sem valor: não conta'}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <GroupSelect groups={groups} value={otherChoices[a.id]} onChange={(groupId) => setOtherGroup(a.id, groupId)}
                                                label={`Grupo de ${a.name}`} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            {(holdings.length > 0 || otherAssets.length > 0) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                    <Button
                        variant="contained"
                        onClick={() => save.mutate()}
                        disabled={save.isPending || !dirty}
                        sx={{ textTransform: 'none' }}
                    >
                        {save.isPending ? 'A guardar…' : 'Guardar atribuições'}
                    </Button>
                    {saved && !dirty && <Typography variant="body2" color="success.main">Guardado.</Typography>}
                </Box>
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </Paper>
    );
}
