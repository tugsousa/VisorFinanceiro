import React from 'react';
import {
    Box, Typography, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Tooltip,
} from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { formatPct, formatPP, groupColor } from '../logic/allocationLogic';

/**
 * A bar centred on zero: to the right when the group is over its target, to the left when under.
 * Red when outside the tolerance.
 */
function DriftBar({ diff, scale, outside, tolerance }) {
    const width = Math.min(50, (Math.abs(diff) / scale) * 50);
    const toleranceWidth = Math.min(50, (tolerance / scale) * 50);
    return (
        <Box sx={{ position: 'relative', width: 140, height: 14, bgcolor: 'grey.100', borderRadius: 1, overflow: 'hidden' }}>
            {/* The tolerance band */}
            <Box sx={{
                position: 'absolute', top: 0, bottom: 0, left: `${50 - toleranceWidth}%`, width: `${toleranceWidth * 2}%`,
                bgcolor: 'grey.200',
            }} />
            <Box sx={{
                position: 'absolute', top: 2, bottom: 2,
                left: diff >= 0 ? '50%' : `${50 - width}%`,
                width: `${width}%`,
                bgcolor: outside ? 'error.main' : 'success.main',
                borderRadius: 0.5,
            }} />
            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', bgcolor: 'text.secondary' }} />
        </Box>
    );
}

/** One row per group: target, current, the difference with a bar centred on zero, and in EUR. */
export default function DriftTable({ status }) {
    const drift = status.drift || [];
    const tolerance = status.tolerance_pp;
    // The bar's full width is the larger of the biggest difference and twice the tolerance.
    const scale = Math.max(tolerance * 2, ...drift.map(d => Math.abs(d.diff_pp)), 1);

    return (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Grupo</TableCell>
                        <TableCell align="right">Alvo</TableCell>
                        <TableCell align="right">Atual</TableCell>
                        <TableCell align="center">Diferença</TableCell>
                        <TableCell align="right">Em euros</TableCell>
                        <TableCell align="right">Valor</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {drift.map(d => (
                        <TableRow key={d.group_id}>
                            <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: groupColor(status.groups, d.group_id), flexShrink: 0 }} />
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>{d.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {d.holdings_count === 1 ? '1 ativo' : `${d.holdings_count} ativos`}
                                            {d.includes_cash ? ` + liquidez (${formatCurrency(d.cash_eur)})` : ''}
                                        </Typography>
                                    </Box>
                                </Box>
                            </TableCell>
                            <TableCell align="right">{formatPct(d.target_pct)}</TableCell>
                            <TableCell align="right">{formatPct(d.current_pct)}</TableCell>
                            <TableCell align="center">
                                <Tooltip title={d.outside_tolerance
                                    ? `Fora da tolerância de ${tolerance.toLocaleString('pt-PT')} p.p.`
                                    : `Dentro da tolerância de ${tolerance.toLocaleString('pt-PT')} p.p.`}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                                        <DriftBar diff={d.diff_pp} scale={scale} outside={d.outside_tolerance} tolerance={tolerance} />
                                        <Typography
                                            variant="body2"
                                            sx={{ minWidth: 72, textAlign: 'right', fontWeight: 600, color: d.outside_tolerance ? 'error.main' : 'text.primary' }}
                                        >
                                            {formatPP(d.diff_pp)}
                                        </Typography>
                                    </Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="right" sx={{ color: d.outside_tolerance ? 'error.main' : 'text.primary' }}>
                                {d.diff_eur > 0 ? '+' : ''}{formatCurrency(d.diff_eur)}
                            </TableCell>
                            <TableCell align="right">{formatCurrency(d.value_eur)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
