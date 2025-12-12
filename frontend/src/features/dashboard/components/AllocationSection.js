import React, { useMemo } from 'react';
import { Grid, Box, Typography } from '@mui/material';
import HoldingsAllocationChart from '../../analytics/components/HoldingsAllocationChart';

// --- DATA PROCESSING LOGIC ---
const processData = (holdings, keySelector, labelFormatter) => {
    if (!holdings) return [];
    
    const groups = {};

    holdings.forEach(h => {
        // We aggregate BOTH values
        const marketVal = h.marketValueEUR || 0;
        const costVal = Math.abs(h.total_cost_basis_eur || 0);
        
        let key = keySelector(h);
        if (!key || key === 'Unknown' || key === '') key = 'Outros';
        
        if (labelFormatter) key = labelFormatter(key);

        if (!groups[key]) {
            groups[key] = { name: key, marketValue: 0, costBasis: 0 };
        }

        groups[key].marketValue += marketVal;
        groups[key].costBasis += costVal;
    });

    // Return the array of objects (sorting will happen inside the chart component based on active view)
    return Object.values(groups);
};

export default function AllocationSection({ holdings }) {
    
    const allocationData = useMemo(() => {
        if (!holdings || holdings.length === 0) return {};

        return {
            byCompany: processData(holdings, h => h.product_name),
            
            bySector: processData(holdings, h => h.sector),
            
            byCountry: processData(holdings, h => h.country_code, (code) => {
                return code && code.includes(' - ') ? code.split(' - ')[1] : code;
            }),
            
            byAsset: processData(holdings, h => h.asset_type, (type) => {
                const map = { 'EQUITY': 'Ações', 'ETF': 'ETF', 'MUTUALFUND': 'Fundos', 'CASH': 'Liquidez' };
                return map[type] || type;
            })
        };
    }, [holdings]);

    return (
        <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
                Alocação de Ativos
            </Typography>
            
            <Grid container spacing={3}>
                <Grid item xs={12} md={6} lg={3}>
                    <HoldingsAllocationChart title="Por Empresa" data={allocationData.byCompany} />
                </Grid>
                <Grid item xs={12} md={6} lg={3}>
                    <HoldingsAllocationChart title="Por Setor" data={allocationData.bySector} />
                </Grid>
                <Grid item xs={12} md={6} lg={3}>
                    <HoldingsAllocationChart title="Por País" data={allocationData.byCountry} />
                </Grid>
                <Grid item xs={12} md={6} lg={3}>
                    <HoldingsAllocationChart title="Por Tipo de Ativo" data={allocationData.byAsset} />
                </Grid>
            </Grid>
        </Box>
    );
}