import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../../constants';
import { getYearString, getMonthIndex } from '../../../lib/utils/dateUtils';
import { getBaseProductName } from '../../../lib/utils/chartUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';

export const prepareSalesCharts = (salesData, selectedYear, dataKeys) => {
    // dataKeys mapping: { productName: 'ProductName', pl: 'Delta', date: 'SaleDate' }
    const emptyResult = { productChartData: { labels: [], datasets: [] }, timeSeriesChartData: { labels: [], datasets: [] } };
    if (!salesData || salesData.length === 0) return emptyResult;

    const maxThickness = 60;
    const smallDataSetThreshold = 5;

    // 1. By Product
    const productPLMap = {};
    salesData.forEach(sale => {
        const pl = sale[dataKeys.pl];
        if (pl != null) {
            const baseProduct = getBaseProductName(sale[dataKeys.productName]);
            productPLMap[baseProduct] = (productPLMap[baseProduct] || 0) + pl;
        }
    });

    const sortedByAbsolutePL = Object.entries(productPLMap).sort(([, plA], [, plB]) => Math.abs(plB) - Math.abs(plA));
    const topItems = sortedByAbsolutePL.slice(0, 9).map(([name, pl]) => ({ name, pl }));
    const otherItems = sortedByAbsolutePL.slice(9);
    
    if (otherItems.length > 0) {
        topItems.push({ name: 'Outros', pl: otherItems.reduce((sum, [, pl]) => sum + pl, 0) });
    }
    topItems.sort((a, b) => a.pl - b.pl);

    const productChartData = {
        labels: topItems.map(item => item.name),
        datasets: [{
            data: topItems.map(item => item.pl),
            backgroundColor: topItems.map(item => item.pl >= 0 ? 'rgba(88, 151, 92, 1)' : 'rgba(210, 91, 91, 1)'),
            borderColor: topItems.map(item => item.pl >= 0 ? 'rgba(37, 98, 40, 1)' : 'rgba(210, 42, 42, 1)'),
            borderWidth: 1,
            borderRadius: 4,
            hoverBorderWidth: 2,
        }]
    };
    if (productChartData.labels.length <= smallDataSetThreshold) productChartData.datasets[0].maxBarThickness = maxThickness;

    // 2. Time Series
    let timeSeriesChartData;
    if (selectedYear === ALL_YEARS_OPTION) {
        const yearlyMap = {};
        salesData.forEach(sale => {
            const year = getYearString(sale[dataKeys.date]);
            if (year && sale[dataKeys.pl] != null) {
                yearlyMap[year] = (yearlyMap[year] || 0) + sale[dataKeys.pl];
            }
        });
        const sortedYears = Object.keys(yearlyMap).sort((a, b) => a.localeCompare(b));
        timeSeriesChartData = {
            labels: sortedYears,
            datasets: [{
                data: sortedYears.map(year => yearlyMap[year]),
                backgroundColor: sortedYears.map(year => (yearlyMap[year] >= 0 ? 'rgba(88, 151, 92, 1)' : 'rgba(210, 91, 91, 1)')),
                borderColor: sortedYears.map(year => (yearlyMap[year] >= 0 ? 'rgba(37, 98, 40, 1)' : 'rgba(210, 42, 42, 1)')),
                borderWidth: 1,
                borderRadius: 4,
                hoverBorderWidth: 2,
            }]
        };
    } else {
        const monthlyData = new Array(12).fill(0);
        salesData.forEach(sale => {
            const monthIndex = getMonthIndex(sale[dataKeys.date]);
            if (monthIndex !== null && sale[dataKeys.pl] != null) {
                monthlyData[monthIndex] += sale[dataKeys.pl];
            }
        });
        timeSeriesChartData = {
            labels: MONTH_NAMES_CHART,
            datasets: [{
                data: monthlyData,
                backgroundColor: monthlyData.map(pl => (pl >= 0 ? 'rgba(88, 151, 92, 1)' : 'rgba(210, 91, 91, 1)')),
                borderColor: monthlyData.map(pl => (pl >= 0 ? 'rgba(37, 98, 40, 1)' : 'rgba(210, 42, 42, 1)')),
                borderWidth: 1,
                borderRadius: 4,
                hoverBorderWidth: 2,
            }]
        };
    }
    if (timeSeriesChartData.labels.length <= smallDataSetThreshold) timeSeriesChartData.datasets[0].maxBarThickness = maxThickness;

    return { productChartData, timeSeriesChartData };
};

export const getChartOptions = (selectedYear) => {
    const commonOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false, grid: { color: '#e0e0e0', borderDash: [2, 4] } }, x: { grid: { display: false } } }
    };

    const timeSeriesOptions = {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, 
            title: { display: true, text: `L/P por ${selectedYear === ALL_YEARS_OPTION ? 'ano' : 'mês'}`, font: { size: 16, weight: '600' } },
            tooltip: { callbacks: { label: (ctx) => `L/P: ${formatCurrency(ctx.raw || 0)}` } }
        }
    };

    const productOptions = {
        ...commonOptions,
        plugins: { ...commonOptions.plugins,
            title: { display: true, text: `L/P por Produto`, font: { size: 16, weight: '600' } },
            tooltip: { callbacks: { label: (ctx) => `L/P: ${formatCurrency(ctx.raw || 0)}` } }
        }
    };

    return { timeSeriesOptions, productOptions };
};