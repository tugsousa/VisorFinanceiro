import { useState, useEffect } from 'react';
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
  Grid
} from '@mui/material';

export default function HoldingsPage() {
  const [stockHoldings, setStockHoldings] = useState([]);
  const [optionHoldings, setOptionHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHoldings = async () => {
      setLoading(true);
      setError(null);
      try {
        const [stocksResponse, optionsResponse] = await Promise.all([
          fetch('http://localhost:8080/api/holdings/stocks'),
          fetch('http://localhost:8080/api/holdings/options')
        ]);

        if (!stocksResponse.ok || !optionsResponse.ok) {
          const errorText = await stocksResponse.text();
          throw new Error(`HTTP error! status: ${stocksResponse.status} - ${errorText || 'Failed to fetch holdings data'}`);
        }

        const [stocks, options] = await Promise.all([
          stocksResponse.json(),
          optionsResponse.json()
        ]);
        
        // Transform stock holdings data
        const transformedStocks = (stocks || []).map(stock => ({
          symbol: stock.isin, // Using ISIN as symbol for now
          quantity: stock.quantity,
          averageCost: stock.buyPrice.toFixed(2),
          currentValue: (stock.buyPrice * stock.quantity).toFixed(2)
        }));

        // Transform option holdings data
        const transformedOptions = (options || []).map(option => {
          // Parse option details from product_name (format: "COL P35.00 19DEC25")
          const parts = option.product_name.split(' ');
          return {
            symbol: parts[0],
            optionType: parts[1],
            strike: parts[2],
            expiration: parts[3],
            quantity: option.quantity
          };
        });
        
        setStockHoldings(transformedStocks);
        setOptionHoldings(transformedOptions);
      } catch (e) {
        console.error("Failed to fetch holdings:", e);
        setError(`Failed to load holdings data: ${e.message}`);
        setStockHoldings([]);
        setOptionHoldings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHoldings();
  }, []);

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">Error: {error}</Typography>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Holdings
      </Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Stock Holdings
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Symbol</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Average Cost</TableCell>
              <TableCell>Current Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockHoldings.map((holding) => (
              <TableRow key={`${holding.symbol}-${holding.purchaseDate}`}>
                <TableCell>{holding.symbol}</TableCell>
                <TableCell>{holding.quantity}</TableCell>
                <TableCell>{holding.averageCost}</TableCell>
                <TableCell>{holding.currentValue}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {optionHoldings.length > 0 && (
        <>
          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            Option Holdings
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Strike</TableCell>
                  <TableCell>Expiration</TableCell>
                  <TableCell>Quantity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {optionHoldings.map((holding) => (
                  <TableRow key={`${holding.symbol}-${holding.expiration}-${holding.strike}`}>
                    <TableCell>{holding.symbol}</TableCell>
                    <TableCell>{holding.optionType}</TableCell>
                    <TableCell>{holding.strike}</TableCell>
                    <TableCell>{holding.expiration}</TableCell>
                    <TableCell>{holding.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}
