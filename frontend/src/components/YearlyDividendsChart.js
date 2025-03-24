// src/components/YearlyDividendsChart.js
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { groupBy, sumBy } from 'lodash';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function YearlyDividendsChart({ data }) {
  // Group dividends by year
  const groupedData = groupBy(data, item => new Date(item.Date).getFullYear());
  
  const years = Object.keys(groupedData).sort();
  const amounts = years.map(year => sumBy(groupedData[year], 'Amount'));

  const chartData = {
    labels: years,
    datasets: [
      {
        label: 'Dividend Amount',
        data: amounts,
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'Dividends by Year',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Amount (€)',
        },
      },
    },
  };

  return <Bar data={chartData} options={options} />;
}