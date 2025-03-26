// src/pages/DividendsPage.js
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Grid, 
  Card, 
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button
} from '@mui/material';
import DividendSummary from '../components/DividendSummary';

export default function DividendsPage() {
  const location = useLocation();
  const [data, setData] = useState(null);

  useEffect(() => {
    // First try to get data from location state
    if (location.state?.data) {
      setData(location.state.data);
    } 
    // If not available, try to get from localStorage
    else {
      const savedData = localStorage.getItem('taxfolioData');
      if (savedData) {
        setData(JSON.parse(savedData));
      }
    }
  }, [location.state]);

  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          No data available
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          href="/"
          sx={{ mt: 2 }}
        >
          Upload Data
        </Button>
      </Box>
    );
  }

  // Ensure dividendResult exists and is an array
  const dividendData = data.dividendResult || [];

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        Dividend Overview
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <DividendSummary data={dividendData} />
            </CardContent>
          </Card>
        </Grid>
        
        {dividendData.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Dividend Transactions
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Symbol</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Amount (€)</TableCell>
                        <TableCell align="right">Tax (€)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dividendData.map((row, index) => (
                        <TableRow key={index}>
                          <TableCell>{row.Date || '-'}</TableCell>
                          <TableCell>{row.Symbol || '-'}</TableCell>
                          <TableCell>{row.Description || '-'}</TableCell>
                          <TableCell align="right">
                            {parseFloat(row.Amount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell align="right">
                            {parseFloat(row.Tax || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}