import React, { useState, useMemo } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import DividendsSection from '../components/DividendsSection';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';

const DividendsPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const { dividendTransactionsData, isLoading } = useAnalyticsData(token, ['dividends']);

    const years = useMemo(() => {
        if (!dividendTransactionsData || dividendTransactionsData.length === 0) return [ALL_YEARS_OPTION];
        const rawYears = extractYearsFromData({ fees: dividendTransactionsData }, { fees: 'date' }); // reusing 'fees' accessor logic
        return [ALL_YEARS_OPTION, ...rawYears.filter(y => y !== 'all').sort((a,b) => b.localeCompare(a))];
    }, [dividendTransactionsData]);

    // FIX: Filter rows
    const filteredData = useMemo(() => {
        if (!dividendTransactionsData) return [];
        if (selectedYear === ALL_YEARS_OPTION) return dividendTransactionsData;
        return dividendTransactionsData.filter(d => getYearString(d.date) === selectedYear);
    }, [dividendTransactionsData, selectedYear]);

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Dividendos</Typography>
                <FormControl size="small" sx={{ width: 120 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={selectedYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === 'all' ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            <DividendsSection 
                dividendTransactionsData={filteredData} 
                selectedYear={selectedYear} 
                isLoading={isLoading} 
                NoRowsOverlay={() => <Box sx={{p:4, textAlign:'center'}}>Sem registo de dividendos.</Box>}
            />
        </Box>
    );
};
export default DividendsPage;