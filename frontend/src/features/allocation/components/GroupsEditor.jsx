import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Typography, Paper, TextField, IconButton, Button, Checkbox, FormControlLabel, Chip, Alert, Tooltip,
    InputAdornment, Stack,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiSaveAllocationGroups, apiSaveAllocationSettings, allocationErrorMessage } from '../api/allocationApi';
import {
    ALLOCATION_QUERY_KEY, GROUP_COLORS, newRowKey, parseUserNumber, rowsFromGroups, suggestInitialGroups, sumTargets,
    targetsAddUp,
} from '../logic/allocationLogic';

/**
 * Creates and edits the groups (name, target %, colour, whether it holds the cash) and the tolerance.
 * The first time, it starts from the groups suggested for the holdings.
 */
export default function GroupsEditor({ portfolioId, status, onSaved }) {
    const queryClient = useQueryClient();
    const initialRows = useMemo(
        () => (status.configured ? rowsFromGroups(status.groups) : suggestInitialGroups(status.holdings)),
        [status],
    );
    const [rows, setRows] = useState(initialRows);
    const [tolerance, setTolerance] = useState(String(status.tolerance_pp));
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setRows(initialRows);
        setTolerance(String(status.tolerance_pp));
    }, [initialRows, status.tolerance_pp]);

    const total = sumTargets(rows);
    const totalOk = targetsAddUp(rows);
    const namesOk = rows.length > 0 && rows.every(r => r.name.trim() !== '');
    const toleranceValue = parseUserNumber(tolerance);
    const toleranceOk = toleranceValue > 0 && toleranceValue <= 50;

    const save = useMutation({
        mutationFn: async () => {
            const groups = rows.map(r => ({
                id: r.id || 0,
                name: r.name.trim(),
                target_pct: parseUserNumber(r.target_pct) || 0,
                color: r.color,
                includes_cash: r.includes_cash,
            }));
            await apiSaveAllocationGroups(portfolioId, groups);
            if (toleranceValue !== status.tolerance_pp) {
                await apiSaveAllocationSettings(portfolioId, toleranceValue);
            }
        },
        onSuccess: () => {
            setError('');
            setSaved(true);
            queryClient.invalidateQueries({ queryKey: [ALLOCATION_QUERY_KEY] });
            onSaved?.();
        },
        onError: (err) => setError(allocationErrorMessage(err, 'Não foi possível guardar os grupos.')),
    });

    const update = (key, changes) => {
        setSaved(false);
        setRows(current => current.map(r => {
            if (r.key === key) return { ...r, ...changes };
            // Only one group can hold the cash.
            if (changes.includes_cash) return { ...r, includes_cash: false };
            return r;
        }));
    };

    const addRow = () => {
        setSaved(false);
        setRows(current => [...current, {
            key: newRowKey(),
            name: '',
            target_pct: String(Math.max(0, Math.round((100 - sumTargets(current)) * 100) / 100)),
            color: GROUP_COLORS[current.length % GROUP_COLORS.length],
            includes_cash: false,
        }]);
    };

    const removeRow = (key) => {
        setSaved(false);
        setRows(current => current.filter(r => r.key !== key));
    };

    const removesGroupsWithHoldings = (status.groups || []).some(g =>
        !rows.some(r => r.id === g.id) && (status.drift || []).some(d => d.group_id === g.id && (d.holdings_count > 0 || d.other_assets_count > 0)));

    return (
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Grupos e alvos</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Cria os grupos em que queres dividir a carteira (por exemplo «Ações Mundo», «Emergentes», «Obrigações»,
                «Ouro») e a percentagem que cada um deve ter. Uma meta para um só ativo é um grupo com esse ativo.
            </Typography>

            <Stack spacing={1.5}>
                {rows.map(row => (
                    <Box key={row.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tooltip title="Cor do grupo">
                            <Box
                                component="input"
                                type="color"
                                value={row.color}
                                onChange={(e) => update(row.key, { color: e.target.value })}
                                sx={{ width: 36, height: 36, p: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                            />
                        </Tooltip>
                        <TextField
                            size="small"
                            label="Nome"
                            value={row.name}
                            onChange={(e) => update(row.key, { name: e.target.value })}
                            sx={{ flex: '1 1 180px' }}
                            inputProps={{ maxLength: 60 }}
                        />
                        <TextField
                            size="small"
                            label="Alvo"
                            value={row.target_pct}
                            onChange={(e) => update(row.key, { target_pct: e.target.value })}
                            sx={{ width: 110 }}
                            inputProps={{ inputMode: 'decimal' }}
                            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                            error={Number.isNaN(parseUserNumber(row.target_pct))}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={row.includes_cash}
                                    onChange={(e) => update(row.key, { includes_cash: e.target.checked })}
                                />
                            }
                            label={<Typography variant="body2">Inclui a liquidez</Typography>}
                        />
                        <IconButton aria-label="Remover grupo" onClick={() => removeRow(row.key)} size="small">
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ))}
            </Stack>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                <Button startIcon={<AddIcon />} onClick={addRow} sx={{ textTransform: 'none' }}>Adicionar grupo</Button>
                <Chip
                    label={`Total: ${total.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`}
                    color={totalOk ? 'success' : 'error'}
                    variant={totalOk ? 'filled' : 'outlined'}
                />
                {!totalOk && (
                    <Typography variant="body2" color="error">
                        {total < 100 ? `Faltam ${(100 - total).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%` : `Sobram ${(total - 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`} para chegar a 100%.
                    </Typography>
                )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    label="Tolerância"
                    value={tolerance}
                    onChange={(e) => { setSaved(false); setTolerance(e.target.value); }}
                    sx={{ width: 140 }}
                    inputProps={{ inputMode: 'decimal' }}
                    InputProps={{ endAdornment: <InputAdornment position="end">p.p.</InputAdornment> }}
                    error={!toleranceOk}
                    helperText={toleranceOk ? 'Desvio aceitável' : 'Entre 0 e 50'}
                />
                <Button
                    variant="contained"
                    onClick={() => save.mutate()}
                    disabled={!totalOk || !namesOk || !toleranceOk || save.isPending}
                    sx={{ textTransform: 'none' }}
                >
                    {save.isPending ? 'A guardar…' : 'Guardar grupos'}
                </Button>
                {saved && !save.isPending && <Typography variant="body2" color="success.main">Guardado.</Typography>}
            </Box>

            {removesGroupsWithHoldings && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                    Os ativos dos grupos que removeste ficam sem grupo.
                </Alert>
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </Paper>
    );
}
