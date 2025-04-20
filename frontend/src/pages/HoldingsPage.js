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
        
        // Transform and group stock holdings data by product_name
        const stockGroups = (stocks || []).reduce((acc, stock) => {
          if (!acc[stock.product_name]) {
            acc[stock.product_name] = {
              product_name: stock.product_name,
              quantity: 0,
              totalCost: 0,
              totalValue: 0
            };
          }
          acc[stock.product_name].quantity += stock.quantity;
          acc[stock.product_name].totalCost += stock.buyPrice * stock.quantity;
          acc[stock.product_name].totalValue += stock.buyPrice * stock.quantity;
          return acc;
        }, {});

        const transformedStocks = Object.values(stockGroups).map(group => ({
          product_name: group.product_name,
          quantity: group.quantity,
          averageCost: (group.totalCost / group.quantity).toFixed(2),
          currentValue: group.totalValue.toFixed(2)
        }));

        // Transform option holdings data
        const transformedOptions = (options || []).map(option => {
          let daysRemaining = 'N/A';
          
          try {
            // Parse expiration date from product_name (format: "COL P35.00 19DEC25")
            const parts = option.product_name.split(' ');
            if (parts.length >= 3) {
              // Find the part that matches the date format (DDMMMYY)
              const datePart = parts.find(part => /^\d{2}[A-Z]{3}\d{2}$/.test(part));
              if (datePart) {
                // Convert expiration date to Date object (format: DDMMMYY)
                const day = datePart.substring(0, 2);
                const month = datePart.substring(2, 5);
                const year = '20' + datePart.substring(5);
                const expirationDate = new Date(`${day} ${month} ${year}`);
                
                // Calculate days remaining
                const today = new Date();
                const timeDiff = expirationDate.getTime() - today.getTime();
                daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
              } else {
                console.warn(`No valid date found in product_name: ${option.product_name}`);
              }
            } else {
              console.warn(`Unexpected product_name format: ${option.product_name}`);
            }
          } catch (e) {
            console.warn(`Failed to parse expiration date from: ${option.product_name}`, e);
          }
          
          return {
            product_name: option.product_name,
            expiration: typeof daysRemaining === 'number' 
              ? (daysRemaining > 0 ? `${daysRemaining} days` : 'Expired')
              : 'N/A',
            quantity: option.quantity,
            open_amount_eur: option.open_amount_eur
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
              <TableCell>Product Name</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Average Cost</TableCell>
              <TableCell>Current Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockHoldings.map((holding) => (
              <TableRow key={`${holding.symbol}-${holding.purchaseDate}`}>
                <TableCell>{holding.product_name}</TableCell>
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
                  <TableCell>Product</TableCell>
                  <TableCell>Expiration</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Amount (EUR)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {optionHoldings.map((holding) => (
                  <TableRow key={`${holding.symbol}-${holding.expiration}-${holding.strike}`}>
                    <TableCell>{holding.product_name}</TableCell>
                    <TableCell>{holding.expiration}</TableCell>
                    <TableCell>{holding.quantity}</TableCell>
                    <TableCell>{holding.open_amount_eur}</TableCell>
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
