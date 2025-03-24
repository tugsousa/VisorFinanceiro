import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';

export default function YearlySalesChart({ data }) {
  // Transform your sales data for the chart
  const chartData = {
    labels: ['2022', '2023'],
    datasets: [{
      label: 'Sales',
      data: [1200, 1900],
      backgroundColor: 'rgba(75,192,192,0.6)'
    }]
  };

  return <Bar data={chartData} />;
}