// frontend/src/pages/HoldingsPage.js
import { useState, useEffect, useContext } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

export default function HoldingsPage() {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext);
  const [stockHoldings, setStockHoldings] = useState([]);
  const [optionHoldings, setOptionHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHoldings = async () => {
      if (!token) {
        setLoading(false);
        setError("User not authenticated. Please sign in.");
        setStockHoldings([]); // Clear data if not authenticated
        setOptionHoldings([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();

        const [stocksResponse, optionsResponse] = await Promise.all([
          axios.get('http://localhost:8080/api/holdings/stocks', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-CSRF-Token': currentCsrfToken,
            },
            withCredentials: true,
          }),
          axios.get('http://localhost:8080/api/holdings/options', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-CSRF-Token': currentCsrfToken,
            },
            withCredentials: true,
          })
        ]);

        const stocksData = stocksResponse.data || [];
        const optionsData = optionsResponse.data || [];

        // Transform stock holdings (PurchaseLot model)
        const transformedStocks = stocksData.map(stock => ({
          product_name: stock.product_name,
          isin: stock.isin,
          quantity: stock.quantity,
          averageCostEUR: stock.quantity > 0 && stock.buy_amount_eur !== undefined ? (stock.buy_amount_eur / stock.quantity).toFixed(2) : '0.00',
          totalCostEUR: stock.buy_amount_eur !== undefined ? stock.buy_amount_eur.toFixed(2) : '0.00',
          buyDate: stock.buy_date,
          buyCurrency: stock.buy_currency,
        }));

        // Transform option holdings (OptionHolding model)
        const transformedOptions = optionsData.map(option => {
          let daysRemaining = 'N/A';
          try {
            const parts = option.product_name.split(' ');
            if (parts.length >= 3) {
              const datePart = parts.find(part => /^\d{2}[A-Z]{3}\d{2}$/.test(part));
              if (datePart) {
                const day = datePart.substring(0, 2);
                const month = datePart.substring(2, 5);
                const year = '20' + datePart.substring(5);
                const expirationDate = new Date(`${day} ${month} ${year} UTC`); // Ensure UTC
                const today = new Date();
                const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
                const timeDiff = expirationDate.getTime() - todayUTC.getTime();
                daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
              }
            }
          } catch (e) { console.warn(`Failed to parse expiration date from: ${option.product_name}`, e); }

          return {
            product_name: option.product_name,
            expiration: typeof daysRemaining === 'number'
              ? (daysRemaining > 0 ? `${daysRemaining} days` : 'Expired')
              : 'N/A',
            quantity: option.quantity, // Positive for long, negative for short
            open_amount_eur: option.open_amount_eur !== undefined ? option.open_amount_eur.toFixed(2) : '0.00',
            openDate: option.open_date,
          };
        });

        setStockHoldings(transformedStocks);
        setOptionHoldings(transformedOptions);

      } catch (e) {
        console.error("Failed to fetch holdings:", e);
        setError(`Failed to load holdings data: ${e.response?.data?.error || e.message}`);
        setStockHoldings([]);
        setOptionHoldings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHoldings();
  }, [token, csrfToken, fetchCsrfToken]);

  if (loading) return <CircularProgress />;
  if (error) return <Typography color="error" sx={{ textAlign: 'center', mt: 2 }}>Error: {error}</Typography>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Current Holdings
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Stock Holdings
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product Name</TableCell>
              <TableCell>ISIN</TableCell>
              <TableCell>Buy Date</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Avg. Cost (EUR)</TableCell>
              <TableCell align="right">Total Cost (EUR)</TableCell>
              <TableCell>Currency</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockHoldings.length > 0 ? stockHoldings.map((holding, index) => (
              <TableRow hover key={holding.isin || `${holding.product_name}-${index}`}>
                <TableCell>{holding.product_name}</TableCell>
                <TableCell>{holding.isin}</TableCell>
                <TableCell>{holding.buyDate}</TableCell>
                <TableCell align="right">{holding.quantity}</TableCell>
                <TableCell align="right">{holding.averageCostEUR}</TableCell>
                <TableCell align="right">{holding.totalCostEUR}</TableCell>
                <TableCell>{holding.buyCurrency}</TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={7} align="center">No stock holdings found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Option Holdings
      </Typography>
      <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Open Date</TableCell>
                <TableCell>Expiration</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Open Value (EUR)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {optionHoldings.length > 0 ? optionHoldings.map((holding, index) => (
                <TableRow hover key={`${holding.product_name}-${holding.openDate}-${index}`}>
                  <TableCell>{holding.product_name}</TableCell>
                  <TableCell>{holding.openDate}</TableCell>
                  <TableCell>{holding.expiration}</TableCell>
                  <TableCell align="right">{holding.quantity}</TableCell>
                  <TableCell align="right">{holding.open_amount_eur}</TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={5} align="center">No option holdings found.</TableCell>
                 </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
    </Box>
  );
}