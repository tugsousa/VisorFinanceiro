import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Select, MenuItem,
    Checkbox, Button, Alert, Chip, Tooltip,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiSaveAllocationAssignments, allocationErrorMessage } from '../api/allocationApi';
import { ALLOCATION_QUERY_KEY, groupColor, initialAssignments } from '../logic/allocationLogic';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const Dot = ({ color }) => (
    <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: color, mr: 1 }} />
);

/**
 * Puts each holding in a group, and marks the asset to buy for each group. Holdings in no group yet
 * start in the group suggested for them (bond funds in the bonds group, the rest in the shares group).
 */
export default function AssignmentsEditor({ portfolioId, status }) {
    const queryClient = useQueryClient();
    const initial = useMemo(() => initialAssignments(status.holdings), [status.holdings]);
    const [choices, setChoices] = useState(initial);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => setChoices(initial), [initial]);

    const groups = status.groups || [];
    const holdings = status.holdings || [];
    const pendingSuggestions = holdings.filter(h => choices[h.isin]?.suggested).length;
    const dirty = holdings.some(h => {
        const c = choices[h.isin] || {};
        return (c.groupId || null) !== (h.group_id || null) || Boolean(c.preferred) !== Boolean(h.preferred);
    });

    const save = useMutation({
        mutationFn: () => apiSaveAllocationAssignments(portfolioId, holdings
            .filter(h => choices[h.isin]?.groupId)
            .map(h => ({ isin: h.isin, group_id: choices[h.isin].groupId, preferred: Boolean(choices[h.isin].preferred) }))),
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

    if (holdings.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 3, border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>Ativos</Typography>
                <Typography variant="body2" color="text.secondary">Este portfólio não tem posições abertas.</Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Ativos de cada grupo</Typography>
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
                                            <Select
                                                size="small"
                                                value={choice.groupId || ''}
                                                displayEmpty
                                                onChange={(e) => setGroup(h.isin, e.target.value || '')}
                                                sx={{ minWidth: 180 }}
                                                renderValue={(value) => {
                                                    if (!value) return <Typography variant="body2" color="text.secondary">Sem grupo</Typography>;
                                                    const g = groups.find(x => x.id === value);
                                                    return <Box sx={{ display: 'flex', alignItems: 'center' }}><Dot color={groupColor(groups, value)} />{g?.name}</Box>;
                                                }}
                                            >
                                                <MenuItem value=""><em>Sem grupo</em></MenuItem>
                                                {groups.map(g => (
                                                    <MenuItem key={g.id} value={g.id}><Dot color={groupColor(groups, g.id)} />{g.name}</MenuItem>
                                                ))}
                                            </Select>
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
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </Paper>
    );
}
