import React, { useMemo } from 'react';
import { Typography, Paper, Box, Grid, CircularProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { Bar } from 'react-chartjs-2';
import { stockSalesColumns } from '../config/salesGridConfig';
import { prepareSalesCharts, getChartOptions } from '../logic/salesChartTransformers';

export default function StockSalesSection({ stockSalesData, selectedYear, isLoading, NoRowsOverlay }) {
    const { productChartData, timeSeriesChartData } = useMemo(() => 
        prepareSalesCharts(stockSalesData, selectedYear, { productName: 'ProductName', pl: 'Delta', date: 'SaleDate' }), 
    [stockSalesData, selectedYear]);

    const { timeSeriesOptions, productOptions } = useMemo(() => getChartOptions(selectedYear), [selectedYear]);

    const rows = (stockSalesData || []).map((sale, index) => ({
        id: `${sale.ISIN}-${sale.SaleDate}-${index}`,
        ...sale
    }));
    
    const hasData = rows.length > 0;

    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
             {isLoading && !hasData ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
                <>
                    {hasData ? (
                        <Grid container spacing={3} sx={{ mb: 3 }}>
                            <Grid item xs={12} lg={6}>
                                <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                                    <Bar data={timeSeriesChartData} options={timeSeriesOptions} />
                                </Paper>
                            </Grid>
                            <Grid item xs={12} lg={6}>
                                <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                                    <Bar data={productChartData} options={productOptions} />
                                </Paper>
                            </Grid>
                        </Grid>
                    ) : (
                         <Typography align="center" sx={{ my: 4, color: 'text.secondary' }}>Não existe informação de vendas de ações para este período.</Typography>
                    )}

                    <Box sx={{ width: '100%' }}>
                        <DataGrid
                            rows={rows}
                            columns={stockSalesColumns}
                            loading={isLoading}
                            autoHeight
                            initialState={{
                                pagination: { paginationModel: { pageSize: 10 } },
                                sorting: { sortModel: [{ field: 'BuyDate', sort: 'desc' }] },
                            }}
                            pageSizeOptions={[10, 25, 50]}
                            disableRowSelectionOnClick
                            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                            slots={{ noRowsOverlay: NoRowsOverlay }}
                        />
                    </Box>
                </>
            )}
        </Paper>
    );
}