// src/pages/YearlyView.js
import { useLocation } from 'react-router-dom';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import { useState } from 'react';
import YearlyDividendsChart from '../components/YearlyDividendsChart';
import YearlySalesChart from '../components/YearlySalesChart';

export default function YearlyView() {
  const location = useLocation();
  const data = location.state?.data;
  const [activeTab, setActiveTab] = useState(0);

  if (!data) {
    return <div>No data available</div>;
  }

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        Yearly Breakdown
      </Typography>
      
      <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab label="Dividends" />
        <Tab label="Sales" />
      </Tabs>
      
      {activeTab === 0 && (
        <YearlyDividendsChart data={data.dividendResult} />
      )}
      
      {activeTab === 1 && (
        <YearlySalesChart data={data.saleDetails} />
      )}
    </Box>
  );
}