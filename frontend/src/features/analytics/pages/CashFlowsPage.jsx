import React, { useState, useMemo } from 'react';
import { Alert, Box, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import CashFlowsSection from '../components/CashFlowsSection';
import { getCashMovements } from '../logic/cashFlowCalculations';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';

const CashFlowsPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const { allTransactionsData, isLoading, isError } = useAnalyticsData(token, ['transactions']);

    const movements = useMemo(() => getCashMovements(allTransactionsData), [allTransactionsData]);

    const years = useMemo(() => {
        const rawYears = extractYearsFromData({ movements }, { movements: 'date' });
        return [ALL_YEARS_OPTION, ...rawYears];
    }, [movements]);

    // The selected year may not exist after switching to another portfolio.
    const activeYear = years.includes(selectedYear) ? selectedYear : ALL_YEARS_OPTION;

    const filteredMovements = useMemo(() => {
        if (activeYear === ALL_YEARS_OPTION) return movements;
        return movements.filter(tx => getYearString(tx.date) === activeYear);
    }, [movements, activeYear]);

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Depósitos e Levantamentos</Typography>
                <FormControl size="small" sx={{ width: 120 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={activeYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === ALL_YEARS_OPTION ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            {isError ? (
                <Alert severity="error">Não foi possível carregar os depósitos e levantamentos.</Alert>
            ) : (
                <CashFlowsSection
                    movements={filteredMovements}
                    allMovements={movements}
                    selectedYear={activeYear}
                    isLoading={isLoading}
                    NoRowsOverlay={() => <Box sx={{p:4, textAlign:'center'}}>Sem registo de movimentos.</Box>}
                />
            )}
        </Box>
    );
};
export default CashFlowsPage;
