import React, { useState, useMemo } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import StockSalesSection from '../components/StockSalesSection';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';

const StockSalesPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const { stockSalesData, isLoading } = useAnalyticsData(token, ['stocks']);

    // 1. Calculate Years (from FULL data)
    const years = useMemo(() => {
        if (!stockSalesData || stockSalesData.length === 0) return [ALL_YEARS_OPTION];
        const rawYears = extractYearsFromData({ stockSales: stockSalesData }, { stockSales: 'SaleDate' });
        return [ALL_YEARS_OPTION, ...rawYears.filter(y => y !== 'all').sort((a,b) => b.localeCompare(a))];
    }, [stockSalesData]);

    // 2. Filter Data (FIX: Only pass relevant rows to child)
    const filteredData = useMemo(() => {
        if (!stockSalesData) return [];
        if (selectedYear === ALL_YEARS_OPTION) return stockSalesData;
        return stockSalesData.filter(s => getYearString(s.SaleDate) === selectedYear);
    }, [stockSalesData, selectedYear]);

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Vendas de Ações</Typography>
                <FormControl size="small" sx={{ width: 120 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={selectedYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === 'all' ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            <StockSalesSection 
                stockSalesData={filteredData} 
                selectedYear={selectedYear} 
                isLoading={isLoading} 
                NoRowsOverlay={() => <Box sx={{p:4, textAlign:'center'}}>Sem registo de vendas para este período.</Box>}
            />
        </Box>
    );
};
export default StockSalesPage;