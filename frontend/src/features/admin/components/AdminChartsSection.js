import React from 'react';
import { Paper, Box, Grid } from '@mui/material';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { DataGrid } from '@mui/x-data-grid';
import { Typography } from '@mui/material';
import { getTopUsersTableColumns } from '../config/adminGridConfig';

const ChartCard = ({ type, data, options, title }) => {
    const ChartComponent = type === 'doughnut' ? Doughnut : (type === 'bar' ? Bar : Line);
    const hasData = data && data.datasets.some(ds => ds && ds.data && ds.data.length > 0 && ds.data.some(d => d > 0 || d < 0));

    const finalOptions = {
        ...options,
        maintainAspectRatio: false,
        plugins: {
            ...options?.plugins,
            title: {
                ...options?.plugins?.title,
                display: true,
                text: title,
                font: { size: 16 }
            }
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasData ? (
                    <ChartComponent data={data} options={finalOptions} />
                ) : (
                    <Typography sx={{ color: 'text.secondary' }}>
                        Sem dados disponíveis.
                    </Typography>
                )}
            </Box>
        </Paper>
    );
};

const TopUsersTable = ({ users, title, valueHeader }) => {
    const columns = getTopUsersTableColumns(valueHeader);
    const rows = users ? users.map((user, index) => ({ id: index, ...user })) : [];
    return (
        <Paper variant="outlined" sx={{ p: 2, height: 400, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>{title}</Typography>
            <Box sx={{ flexGrow: 1 }}><DataGrid rows={rows} columns={columns} density="compact" hideFooter /></Box>
        </Paper>
    );
};

const AdminChartsSection = ({ statsData, chartData, chartOptions, timeSeriesOptions, barOptions }) => {
    return (
        <Paper component={Box} variant="outlined" sx={{ p: 3, mt: 4, borderColor: 'divider' }}>
            <Grid container spacing={3}>
                <Grid item xs={12} lg={6}>
                    <TopUsersTable users={statsData?.topUsersByLogins} title="Top Utilizadores por Nº de Logins" valueHeader="Logins" />
                </Grid>
                <Grid item xs={12} lg={6}>
                    <TopUsersTable users={statsData?.topUsersByUploads} title="Top Utilizadores por Nº de Uploads" valueHeader="Uploads" />
                </Grid>
                <Grid item xs={12} md={6}>
                    <ChartCard type="doughnut" data={chartData.verification} options={chartOptions} title="Verificação de Email" />
                </Grid>
                <Grid item xs={12} md={6}>
                    <ChartCard type="doughnut" data={chartData.authProvider} options={chartOptions} title="Método de Autenticação" />
                </Grid>
            </Grid>
            <Grid container spacing={3} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                    <ChartCard type="line" data={chartData.activeUsersSeries} options={timeSeriesOptions} title="Atividade Diária" />
                </Grid>
                <Grid item xs={12} md={6}>
                    <ChartCard type="line" data={chartData.newUsersSeries} options={timeSeriesOptions} title="Novos Registos Diários" />
                </Grid>
            </Grid>
        </Paper>
    );
};

export default AdminChartsSection;