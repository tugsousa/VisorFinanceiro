import React, { useMemo } from 'react';
import { Grid, Box, Typography } from '@mui/material';
import HoldingsAllocationChart from './HoldingsAllocationChart';

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

        if (labelFormatter) {
            key = labelFormatter(key);
        }

        if (!groups[key]) {
            groups[key] = { name: key, marketValue: 0, costBasis: 0 };
        }
        groups[key].marketValue += marketVal;
        groups[key].costBasis += costVal;
    });

    // Return the array of objects
    return Object.values(groups);
};

// By sector, a fund (ETF) with a known sector breakdown is split across its sectors;
// the part of it outside those sectors (its cash) goes to 'Outros'.
const processSectorData = (holdings) => {
    if (!holdings) return [];
    const groups = {};
    const add = (key, marketVal, costVal) => {
        if (!groups[key]) groups[key] = { name: key, marketValue: 0, costBasis: 0 };
        groups[key].marketValue += marketVal;
        groups[key].costBasis += costVal;
    };

    holdings.forEach(h => {
        const marketVal = h.marketValueEUR || 0;
        const costVal = Math.abs(h.total_cost_basis_eur || 0);
        const weights = h.sector_weights;

        if (weights && Object.keys(weights).length > 0) {
            let covered = 0;
            Object.entries(weights).forEach(([sector, w]) => {
                add(sector, marketVal * w, costVal * w);
                covered += w;
            });
            if (covered < 0.9999) {
                add('Outros', marketVal * (1 - covered), costVal * (1 - covered));
            }
            return;
        }

        const key = h.sector && h.sector !== 'Unknown' ? h.sector : 'Outros';
        add(key, marketVal, costVal);
    });

    return Object.values(groups).filter(g => g.marketValue > 0.005 || g.costBasis > 0.005);
};

export default function AllocationSection({ holdings }) {
    const allocationData = useMemo(() => {
        if (!holdings || holdings.length === 0) return {};

        return {
            byCompany: processData(holdings, h => h.product_name),
            bySector: processSectorData(holdings),
            // Removed byCountry as requested
            byAsset: processData(holdings, h => h.asset_type, (type) => {
                if (!type) return 'Outros';
                
                // FIX: Normalize to uppercase to ensure mapping works even if API returns 'Equity'
                const normalizedType = type.toUpperCase();
                
                const map = { 
                    'EQUITY': 'Ações', 
                    'ETF': 'ETF', 
                    'MUTUALFUND': 'Fundos', 
                    'CASH': 'Liquidez',
                    'CRYPTOCURRENCY': 'Cripto'
                };
                return map[normalizedType] || type;
            })
        };
    }, [holdings]);

    return (
        <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
                Alocação de Ativos
            </Typography>
            <Grid container spacing={3}>
                {/* Adjusted grid to xs=12 md=4 for 3 columns instead of 4 */}
                <Grid item xs={12} md={4}>
                    <HoldingsAllocationChart title="Por Empresa" data={allocationData.byCompany} maxSlices={Infinity} />
                </Grid>
                <Grid item xs={12} md={4}>
                    {/* Every item gets its own slice; only a real Outros shares the grey slice */}
                    <HoldingsAllocationChart title="Por Setor" data={allocationData.bySector} maxSlices={Infinity} />
                </Grid>
                <Grid item xs={12} md={4}>
                    <HoldingsAllocationChart title="Por Tipo de Ativo" data={allocationData.byAsset} maxSlices={Infinity} />
                </Grid>
            </Grid>
        </Box>
    );
}