import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';

// Generate distinct colors for products
const generateColors = (count) => {
  const colors = [];
  const hueStep = 360 / count;
  for (let i = 0; i < count; i++) {
    const hue = i * hueStep;
    colors.push(`hsla(${hue}, 70%, 50%, 0.6)`);
  }
  return colors;
};

export default function YearlySalesChart({ stockSales }) {
  if (!stockSales || stockSales.length === 0) {
    return <div>No stock sales data available</div>;
  }

  // Get unique product names
  const productNames = [...new Set(stockSales.map(sale => sale.ProductName))];
  const colors = generateColors(productNames.length);

  // Group data by year and product
  const yearlyData = {};
  stockSales.forEach(sale => {
    const year = new Date(sale.SaleDate).getFullYear();
    if (!yearlyData[year]) {
      yearlyData[year] = {};
    }
    if (!yearlyData[year][sale.ProductName]) {
      yearlyData[year][sale.ProductName] = 0;
    }
    yearlyData[year][sale.ProductName] += sale.Delta || 0;
  });

  // Sort years in descending order
  const years = Object.keys(yearlyData).sort((a, b) => b - a);

  // Create dataset for each product
  const datasets = productNames.map((product, i) => {
    const data = years.map(year => yearlyData[year][product] || 0);
    return {
      label: product,
      data: data,
      backgroundColor: colors[i],
      borderColor: colors[i].replace('0.6', '1'),
      borderWidth: 1
    };
  });

  const chartData = {
    labels: years,
    datasets: datasets
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const product = context.dataset.label;
            const value = context.raw;
            return `${product}: €${value.toFixed(2)}`;
          },
          title: () => '' // Remove title (year/NaN) completely
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: (value) => `€${value}`
        }
      }
    }
  };

  return <Bar data={chartData} options={options} />;
}
