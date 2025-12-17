import React, { useState, useMemo } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import FeesSection from '../components/FeesSection';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';

const FeesPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const { feesData, isLoading } = useAnalyticsData(token, ['fees']);

    const years = useMemo(() => {
        if (!feesData || feesData.length === 0) return [ALL_YEARS_OPTION];
        const rawYears = extractYearsFromData({ fees: feesData }, { fees: 'date' });
        return [ALL_YEARS_OPTION, ...rawYears.filter(y => y !== 'all').sort((a,b) => b.localeCompare(a))];
    }, [feesData]);

    // FIX: Filter rows
    const filteredData = useMemo(() => {
        if (!feesData) return [];
        if (selectedYear === ALL_YEARS_OPTION) return feesData;
        return feesData.filter(f => getYearString(f.date) === selectedYear);
    }, [feesData, selectedYear]);

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Taxas e Comissões</Typography>
                <FormControl size="small" sx={{ width: 120 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={selectedYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === 'all' ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            <FeesSection 
                feeData={filteredData} 
                selectedYear={selectedYear} 
                isLoading={isLoading} 
                NoRowsOverlay={() => <Box sx={{p:4, textAlign:'center'}}>Sem registo de taxas.</Box>}
            />
        </Box>
    );
};
export default FeesPage;