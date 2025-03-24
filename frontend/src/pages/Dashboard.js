// src/pages/Dashboard.js
import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Box, Typography, Grid, Card, CardContent, Button } from '@mui/material';
import DividendSummary from '../components/DividendSummary';
import SalesSummary from '../components/SalesSummary';
import PurchasesSummary from '../components/PurchasesSummary';

export default function Dashboard() {
  const location = useLocation();
  const [data, setData] = useState(location.state?.data || null);

  useEffect(() => {
    if (!data) {
      // Optionally load data from localStorage or API if page refreshed
      const savedData = localStorage.getItem('taxfolioData');
      if (savedData) {
        setData(JSON.parse(savedData));
      }
    } else {
      localStorage.setItem('taxfolioData', JSON.stringify(data));
    }
  }, [data]);

  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          No data available
        </Typography>
        <Button component={Link} to="/" variant="contained">
          Go to Upload Page
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        Tax Summary
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <DividendSummary data={data.dividendResult} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <SalesSummary data={data.saleDetails} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <PurchasesSummary data={data.remainingPurchases} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Button
          component={Link}
          to="/yearly"
          state={{ data }}
          variant="contained"
          size="large"
        >
          View Yearly Breakdown
        </Button>
        <Button
          component={Link}
          to="/detailed"
          state={{ data }}
          variant="outlined"
          size="large"
        >
          View Detailed Data
        </Button>
      </Box>
    </Box>
  );
}