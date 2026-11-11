import React from 'react';
import { Alert, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAllocation } from '../hooks/useAllocation';
import { ALLOCATION_TAB, formatPP } from '../logic/allocationLogic';

/** A small warning on the dashboard when a group is outside the tolerance of its target. */
export default function AllocationDriftAlert({ portfolioId }) {
    const { data: status } = useAllocation(portfolioId);
    if (!status?.configured || !status.outside_tolerance) return null;

    const outside = status.drift.filter(d => d.outside_tolerance);
    return (
        <Alert
            severity="warning"
            sx={{ mb: 3 }}
            action={
                <Button component={RouterLink} to={`/portfolio?tab=${ALLOCATION_TAB}`} color="inherit" size="small" sx={{ textTransform: 'none' }}>
                    Ver alocação
                </Button>
            }
        >
            A carteira está fora da alocação-alvo: {outside.map(d => `${d.name} ${formatPP(d.diff_pp)}`).join(', ')}.
        </Alert>
    );
}
