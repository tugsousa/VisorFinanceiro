// src/features/analytics/components/StockHoldingsSection.js
import React, { useState, useMemo } from 'react';
import { 
    Paper, Box, ToggleButtonGroup, ToggleButton, IconButton, 
    Popover, FormControlLabel, Checkbox, Typography 
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import SettingsIcon from '@mui/icons-material/Settings';

// IMPORTING CONFIG AND LOGIC
import { getGroupedColumns, getDetailedColumns } from '../config/stockGridConfig';
import { transformGroupedHoldings, transformDetailedHoldings } from '../logic/holdingsCalculations';

export default function StockHoldingsSection({ groupedData, detailedData, isGroupedFetching, isDetailedFetching, selectedYear, NoRowsOverlay }) {
    const [viewMode, setViewMode] = useState('grouped');
    
    // Default state: Original Cost and Exchange Rate are hidden (true)
    const [hiddenColumns, setHiddenColumns] = useState({
        dividends: true,
        commissions: true,
        salesRealized: true,
        originalCost: true,
        exchangeRate: true
    });
    const [anchorEl, setAnchorEl] = useState(null);

    // --- HANDLERS ---
    const handleSettingsClick = (event) => setAnchorEl(event.currentTarget);
    const handleSettingsClose = () => setAnchorEl(null);
    const handleToggleColumn = (key) => setHiddenColumns(prev => ({ ...prev, [key]: !prev[key] }));
    const isSettingsOpen = Boolean(anchorEl);

    // --- LOGIC: COLUMNS & ROWS ---
    const isGroupedDataHistorical = groupedData?.[0]?.isHistorical === true;

    const columns = useMemo(() => {
        return viewMode === 'grouped' 
            ? getGroupedColumns(hiddenColumns, isGroupedDataHistorical)
            : getDetailedColumns(hiddenColumns, selectedYear);
    }, [viewMode, hiddenColumns, isGroupedDataHistorical, selectedYear]);

    const rows = useMemo(() => {
        if (viewMode === 'grouped') {
            return transformGroupedHoldings(groupedData, isGroupedFetching, isGroupedDataHistorical);
        }
        return transformDetailedHoldings(detailedData);
    }, [viewMode, groupedData, detailedData, isGroupedFetching, isGroupedDataHistorical]);

    // --- LOADING/EMPTY STATES ---
    const noData = !rows || rows.length === 0;
    if (noData && !isGroupedFetching && !isDetailedFetching) {
        return (
            <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                <Typography>Não existe informação disponível.</Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Posições em Ações</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    
                    <IconButton 
                        aria-label="configurar colunas" 
                        onClick={handleSettingsClick} 
                        sx={{ mr: 1.5, color: 'text.secondary' }}
                    >
                        <SettingsIcon />
                    </IconButton>

                    <ToggleButtonGroup value={viewMode} exclusive onChange={(e, newMode) => newMode && setViewMode(newMode)} size="small">
                        <ToggleButton value="grouped">Agrupado</ToggleButton>
                        <ToggleButton value="detailed">Detalhado</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            </Box>
            
            <Popover
                open={isSettingsOpen}
                anchorEl={anchorEl}
                onClose={handleSettingsClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Colunas Opcionais</Typography>
                    
                    {viewMode === 'grouped' ? (
                        <>
                            <FormControlLabel control={<Checkbox checked={!hiddenColumns.dividends} onChange={() => handleToggleColumn('dividends')} />} label="Dividendos Recebidos" />
                            <FormControlLabel control={<Checkbox checked={!hiddenColumns.commissions} onChange={() => handleToggleColumn('commissions')} />} label="Comissões Pagas" />
                            <FormControlLabel control={<Checkbox checked={!hiddenColumns.salesRealized} onChange={() => handleToggleColumn('salesRealized')} />} label="L/P Realizados (Vendas)" />
                        </>
                    ) : (
                        <>
                            <FormControlLabel control={<Checkbox checked={!hiddenColumns.originalCost} onChange={() => handleToggleColumn('originalCost')} />} label="Custo Original" />
                            <FormControlLabel control={<Checkbox checked={!hiddenColumns.exchangeRate} onChange={() => handleToggleColumn('exchangeRate')} />} label="Exchange Rate" />
                        </>
                    )}
                </Box>
            </Popover>

            <Box sx={{ width: '100%' }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    loading={viewMode === 'grouped' ? isGroupedFetching : isDetailedFetching}
                    autoHeight
                    pageSizeOptions={[10, 25, 50]}
                    initialState={{ 
                        pagination: { paginationModel: { pageSize: 25 } }, 
                        sorting: { sortModel: viewMode === 'grouped' ? [{ field: 'marketValueEUR_combined', sort: 'desc' }] : [{ field: 'buy_date', sort: 'desc' }] } 
                    }}
                    disableRowSelectionOnClick
                    localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                    slots={{ noRowsOverlay: NoRowsOverlay }}
                    getRowClassName={(params) => params.row.isTotalRow ? 'total-summary-row' : ''}
                    sx={{
                        '& .total-summary-row': {
                            bgcolor: '#f5f5f5',
                            fontWeight: 'bold',
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 1,
                            borderTop: '2px solid #e0e0e0',
                            '&:hover': {
                                bgcolor: '#eeeeee',
                            }
                        },
                        '& .total-summary-row .MuiDataGrid-cell': {
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                        }
                    }}
                />
            </Box>
        </Paper>
    );
}