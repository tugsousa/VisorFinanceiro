import React, { useState, useMemo } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import OptionSalesSection from '../components/OptionSalesSection';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';

const OptionSalesPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const { optionSalesData, isLoading } = useAnalyticsData(token, ['options']);

    const years = useMemo(() => {
        if (!optionSalesData || optionSalesData.length === 0) return [ALL_YEARS_OPTION];
        const rawYears = extractYearsFromData({ optionSales: optionSalesData }, { optionSales: 'close_date' });
        return [ALL_YEARS_OPTION, ...rawYears.filter(y => y !== 'all').sort((a,b) => b.localeCompare(a))];
    }, [optionSalesData]);

    // FIX: Filter rows
    const filteredData = useMemo(() => {
        if (!optionSalesData) return [];
        if (selectedYear === ALL_YEARS_OPTION) return optionSalesData;
        return optionSalesData.filter(o => getYearString(o.close_date) === selectedYear);
    }, [optionSalesData, selectedYear]);

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Vendas de Opções</Typography>
                <FormControl size="small" sx={{ width: 120 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={selectedYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === 'all' ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            <OptionSalesSection 
                optionSalesData={filteredData} 
                selectedYear={selectedYear} 
                isLoading={isLoading} 
                NoRowsOverlay={() => <Box sx={{p:4, textAlign:'center'}}>Sem registo de opções para este período.</Box>}
            />
        </Box>
    );
};
export default OptionSalesPage;