import { formatCurrency } from '../../../lib/utils/formatUtils';

export const getCommonChartOptions = () => ({
    responsive: true, 
    plugins: { 
        legend: { position: 'right' }, 
        title: { display: false } 
    }
});

export const getTimeSeriesChartOptions = (title, theme) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        title: { display: false }
    },
    scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
    }
});

export const getHorizontalBarOptions = (title, tooltipLabel) => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
            callbacks: {
                label: (context) => `${tooltipLabel}: ${tooltipLabel.includes('€') ? formatCurrency(context.raw) : context.raw}`
            }
        }
    },
    scales: {
        x: { beginAtZero: true }
    }
});

export const prepareChartData = (statsData, theme) => {
    const emptyChartData = { labels: [], datasets: [] };
    if (!statsData) return {
        verification: emptyChartData,
        authProvider: emptyChartData,
        valueByBroker: emptyChartData,
        depositsByBroker: emptyChartData,
        topStocksByValue: emptyChartData,
        topStocksByTrades: emptyChartData,
        investmentDistribution: emptyChartData,
        activeUsersSeries: emptyChartData,
        newUsersSeries: emptyChartData
    };

    return {
        verification: {
            labels: ['Verificados', 'Não Verificados'],
            datasets: [{ 
                data: [statsData.verificationStats?.verified || 0, statsData.verificationStats?.unverified || 0], 
                backgroundColor: [theme.palette.success.main, theme.palette.error.main] 
            }]
        },
        authProvider: {
            labels: statsData.authProviderStats?.map(d => d.name) || [],
            datasets: [{ 
                data: statsData.authProviderStats?.map(d => d.value) || [], 
                backgroundColor: [theme.palette.info.main, theme.palette.warning.main] 
            }]
        },
        valueByBroker: {
            labels: statsData.valueByBroker?.map(d => d.name) || [],
            datasets: [{ 
                data: statsData.valueByBroker?.map(d => d.value) || [], 
                backgroundColor: [theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main, theme.palette.error.main, theme.palette.warning.main] 
            }]
        },
        depositsByBroker: {
            labels: statsData.depositsByBroker?.map(d => d.name) || [],
            datasets: [{ 
                data: statsData.depositsByBroker?.map(d => d.value) || [], 
                backgroundColor: [theme.palette.info.light, theme.palette.success.light, theme.palette.warning.light, theme.palette.error.light] 
            }]
        },
        topStocksByValue: {
            labels: statsData.topStocksByValue?.map(d => d.productName || d.isin) || [],
            datasets: [{ 
                label: 'Total Investido (€)', 
                data: statsData.topStocksByValue?.map(d => d.value) || [], 
                backgroundColor: theme.palette.primary.light, 
                borderColor: theme.palette.primary.main, 
                borderWidth: 1 
            }]
        },
        topStocksByTrades: {
            labels: statsData.topStocksByTrades?.map(d => d.productName || d.isin) || [],
            datasets: [{ 
                label: 'Nº de Transações', 
                data: statsData.topStocksByTrades?.map(d => d.value) || [], 
                backgroundColor: theme.palette.secondary.light, 
                borderColor: theme.palette.secondary.main, 
                borderWidth: 1 
            }]
        },
        investmentDistribution: {
            labels: statsData.investmentDistributionByCountry?.map(d => d.name.split(' - ')[1] || d.name) || [],
            datasets: [{ 
                data: statsData?.investmentDistributionByCountry?.map(d => d.value) || [], 
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#4D5360'] 
            }]
        },
        activeUsersSeries: {
            labels: statsData?.activeUsersPerDay?.map(d => d.date) || [],
            datasets: [{ 
                label: 'Utilizadores Ativos', 
                data: statsData?.activeUsersPerDay?.map(d => d.count) || [], 
                tension: 0.1, 
                borderColor: theme.palette.info.main, 
                backgroundColor: theme.palette.info.light, 
                fill: true 
            }]
        },
        newUsersSeries: {
            labels: statsData?.usersPerDay?.map(d => d.date) || [],
            datasets: [{ 
                label: 'Novos Utilizadores', 
                data: statsData?.usersPerDay?.map(d => d.count) || [], 
                tension: 0.1, 
                borderColor: theme.palette.info.main, 
                backgroundColor: theme.palette.info.light, 
                fill: true 
            }]
        }
    };
};