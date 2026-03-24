import React from 'react';
import { Paper, Box, Grid, Typography } from '@mui/material';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { DataGrid } from '@mui/x-data-grid';
import { getTopUsersTableColumns } from '../config/adminGridConfig';

// Shared height constants — single source of truth for the charts section.
// FIX: Unified all card heights. Previously ChartCard was 400px and TopUsersTable 450px,
// which produced a ragged two-row layout. Both are now CHART_CARD_HEIGHT so the grid rows
// align regardless of column count.
const CHART_CARD_HEIGHT = 420;
const TOP_USERS_TABLE_HEIGHT = 420;

const ChartCard = ({ type, data, options, title }) => {
    const ChartComponent = type === 'doughnut' ? Doughnut : (type === 'bar' ? Bar : Line);
    
    const hasData = data && data.datasets.some(ds => 
        ds && ds.data && ds.data.length > 0 && ds.data.some(d => d > 0 || d < 0)
    );

    const finalOptions = {
        ...options,
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
            ...options?.plugins,
            title: {
                ...options?.plugins?.title,
                display: true,
                text: title,
                font: { size: 16, weight: 'bold' },
                color: '#1f2937'
            },
            legend: {
                position: 'bottom',
                labels: {
                    color: '#6b7280',
                    font: { size: 12 }
                }
            }
        }
    };

    return (
        <Paper 
            variant="outlined" 
            sx={{ 
                p: 3, 
                height: CHART_CARD_HEIGHT,
                display: 'flex', 
                flexDirection: 'column',
                borderRadius: 3,
                borderColor: 'divider',
                transition: 'all 0.3s ease',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    borderColor: 'primary.light',
                },
                background: 'white'
            }}
        >
            <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasData ? (
                    <ChartComponent data={data} options={finalOptions} />
                ) : (
                    <Typography sx={{ color: 'text.secondary', textAlign: 'center' }}>
                        Sem dados disponíveis.
                    </Typography>
                )}
            </Box>
        </Paper>
    );
};

const TopUsersTable = ({ users, title, valueHeader, metricKey }) => {
    const columns = getTopUsersTableColumns(valueHeader);
    
    const rows = users ? users.map((user, index) => ({ 
        id: index, 
        ...user,
        value: user[metricKey]
    })) : [];

    return (
        <Paper 
            variant="outlined" 
            sx={{ 
                p: 3, 
                height: TOP_USERS_TABLE_HEIGHT,
                display: 'flex', 
                flexDirection: 'column',
                borderRadius: 3,
                borderColor: 'divider',
                transition: 'all 0.3s ease',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    borderColor: 'primary.light',
                },
                background: 'white'
            }}
        >
            <Typography variant="h6" sx={{ 
                mb: 2,
                textAlign: 'center',
                fontWeight: 700,
                color: '#1f2937',
                letterSpacing: '-0.02em',
                flexShrink: 0,
            }}>
                {title}
            </Typography>
            {/* FIX: flexGrow:1 + height:'100%' ensures DataGrid fills remaining space
                without overflowing the fixed-height Paper container. */}
            <Box sx={{ flexGrow: 1 }}>
                <DataGrid 
                    rows={rows} 
                    columns={columns} 
                    density="compact" 
                    hideFooter
                    sx={{
                        height: '100%',
                        '& .MuiDataGrid-cell': {
                            fontSize: '0.875rem',
                        },
                        '& .MuiDataGrid-columnHeaders': {
                            backgroundColor: '#f3f4f6',
                            fontWeight: 'bold',
                        }
                    }}
                />
            </Box>
        </Paper>
    );
};

const AdminChartsSection = ({ statsData, chartData, chartOptions, timeSeriesOptions }) => {
    return (
        <Paper 
            component={Box} 
            variant="outlined" 
            sx={{ 
                p: 4, 
                mt: 4, 
                borderColor: 'divider',
                borderRadius: 4,
                background: 'white'
            }}
        >
            {/* Secção Superior: Tabelas de Top Users */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="h5" component="h3" sx={{ 
                    fontWeight: 800, 
                    color: 'text.primary',
                    mb: 3
                }}>
                    Análise de Usuários
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} lg={6}>
                        <TopUsersTable 
                            users={statsData?.topUsersByLogins} 
                            title="Top Utilizadores (Logins)" 
                            valueHeader="Logins"
                            metricKey="login_count"
                        />
                    </Grid>
                    <Grid item xs={12} lg={6}>
                        <TopUsersTable 
                            users={statsData?.topUsersByUploads} 
                            title="Top Utilizadores (Uploads)" 
                            valueHeader="Uploads"
                            metricKey="total_upload_count"
                        />
                    </Grid>
                </Grid>
            </Box>

            {/* Secção Intermédia: Gráficos de Distribuição */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="h5" component="h3" sx={{ 
                    fontWeight: 800, 
                    color: 'text.primary',
                    mb: 3
                }}>
                    Distribuição de Métricas
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} md={4}>
                        <ChartCard 
                            type="doughnut" 
                            data={chartData.verification} 
                            options={chartOptions} 
                            title="Verificação de Email" 
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <ChartCard 
                            type="doughnut" 
                            data={chartData.authProvider} 
                            options={chartOptions} 
                            title="Método de Autenticação" 
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <ChartCard 
                            type="doughnut" 
                            data={chartData.valueByBroker} 
                            options={chartOptions} 
                            title="Transações por Corretora" 
                        />
                    </Grid>
                </Grid>
            </Box>

            {/* Secção Inferior: Gráficos de Linha (Timeline) */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="h5" component="h3" sx={{ 
                    fontWeight: 800, 
                    color: 'text.primary',
                    mb: 3
                }}>
                    Tendências Temporais
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <ChartCard 
                            type="line" 
                            data={chartData.activeUsersSeries} 
                            options={timeSeriesOptions} 
                            title="Atividade Diária (30 dias)" 
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ChartCard 
                            type="line" 
                            data={chartData.newUsersSeries} 
                            options={timeSeriesOptions} 
                            title="Novos Registos (30 dias)" 
                        />
                    </Grid>
                </Grid>
            </Box>
        </Paper>
    );
};

export default AdminChartsSection;
