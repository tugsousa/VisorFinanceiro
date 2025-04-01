import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  styled,
  Button, // Import Button
  IconButton // Import IconButton for delete icon
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete'; // Import Delete Icon

// Styled components for the table to match the image
const StyledTableCell = styled(TableCell)(({ theme }) => ({
  backgroundColor: '#90caf9', // Darker blue header (Material UI blue[200])
  color: theme.palette.common.black,
  fontWeight: 'bold',
  border: '1px solid #b0bec5', // Light grey border
  textAlign: 'center',
  padding: '6px 8px', // Reduced padding
  fontSize: '0.8rem', // Smaller font size
  verticalAlign: 'top', // Align header text top
}));

const StyledNestedTableCell = styled(TableCell)(({ theme }) => ({
  backgroundColor: '#90caf9', // Darker blue header (Material UI blue[200])
  color: theme.palette.common.black,
  fontWeight: 'normal', // Normal weight for sub-headers
  border: '1px solid #b0bec5', // Light grey border
  textAlign: 'center',
  padding: '4px 6px', // Reduced padding
  fontSize: '0.75rem', // Smaller font size
}));

const StyledTableBodyCell = styled(TableCell)(({ theme, align = 'center' }) => ({ // Allow alignment override
  border: '1px solid #b0bec5', // Light grey border
  textAlign: align,
  padding: '4px 6px', // Reduced padding
  fontSize: '0.8rem', // Smaller font size
  verticalAlign: 'middle', // Center content vertically
}));

// Helper functions for date extraction, specifically handling DD-MM-YYYY format
const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.split('-');
  if (parts.length === 3) {
    // Parts are DD, MM, YYYY
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);
    // Basic validation
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
       // Note: This doesn't validate days per month perfectly (e.g., Feb 30th)
       // but is sufficient for getting year/month if format is correct.
      const date = new Date(Date.UTC(year, month, day)); // Use UTC to avoid timezone issues
      // Final check if the constructed date is valid
       if (!isNaN(date.getTime())) {
           return date;
       }
    }
  }
   console.error(`Failed to parse date string in DD-MM-YYYY format: ${dateString}`);
  return null; // Return null for invalid/unparseable dates
};


const getYear = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCFullYear() : '';
};

const getMonth = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  // Adding 1 because getUTCMonth() is 0-indexed (0 for January)
  return date ? String(date.getUTCMonth() + 1).padStart(2, '0') : '';
};

const getDay = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  // getUTCDate() returns day of the month (1-31)
  return date ? String(date.getUTCDate()).padStart(2, '0') : '';
};


export default function TaxPage() {
  // Initialize selectedYear to empty string to avoid MUI warning if availableYears is initially empty
  const [selectedYear, setSelectedYear] = useState('');
  const [stockSaleDetails, setStockSaleDetails] = useState([]);
  const [allStockSaleDetails, setAllStockSaleDetails] = useState([]); // Store all fetched stock data
  const [optionSaleDetails, setOptionSaleDetails] = useState([]);
  const [allOptionSaleDetails, setAllOptionSaleDetails] = useState([]); // Store all fetched option data
  const [availableYears, setAvailableYears] = useState([]);
  const [error, setError] = useState(null); // For stock error handling
  const [optionError, setOptionError] = useState(null); // Separate error state for options

  // Fetch actual data (stock and option sales) and available years from backend
  useEffect(() => {
    const fetchData = async () => {
      setError(null); // Reset stock error state
      setOptionError(null); // Reset option error state
      let allYears = new Set(); // Use a Set to collect unique years from both sources
      let currentStockSales = [];
      let currentOptionSales = [];
      let latestYearOverall = ''; // Initialize as empty string

      // Fetch Stock Sales
      try {
        const stockResponse = await fetch('http://localhost:8080/api/stock-sales');
        if (!stockResponse.ok) {
          // Try to get error message from response body
          const errorText = await stockResponse.text();
          throw new Error(`HTTP error! status: ${stockResponse.status} - ${errorText || 'No error details'}`);
        }
        // Assume valid JSON if response.ok
        const stockData = await stockResponse.json();
        currentStockSales = stockData || [];
        setAllStockSaleDetails(currentStockSales);
        currentStockSales.forEach(item => {
          const year = getYear(item.SaleDate);
          if (year) allYears.add(year);
        });
      } catch (e) {
        console.error("Failed to fetch stock sales data:", e);
        setError(`Failed to load stock sales data: ${e.message}`);
      }

      // Fetch Option Sales
      try {
        const optionResponse = await fetch('http://localhost:8080/api/option-sales'); // Assuming this endpoint
        if (!optionResponse.ok) {
           // Try to get error message from response body
           const errorText = await optionResponse.text();
           throw new Error(`HTTP error! status: ${optionResponse.status} - ${errorText || 'No error details'}`);
        }
        // Handle potential non-JSON responses by reading as text first
        const optionResponseText = await optionResponse.text();
        const trimmedResponseText = optionResponseText.trim();

        // Check if the response is the specific "backend running" message (case-insensitive) or empty
        if (trimmedResponseText.toLowerCase() === 'taxfolio backend is running' || trimmedResponseText === '') {
            // Treat this as no data available
            currentOptionSales = [];
            setAllOptionSaleDetails([]);
            if (trimmedResponseText.toLowerCase() === 'taxfolio backend is running') { // Use lowercase for comparison
              console.log("Option sales endpoint returned 'TAXFOLIO Backend is running', treating as no data.");
              // Optionally set a specific non-error message or just leave optionError null
              // setOptionError("Option sales data not yet available.");
            } else {
              console.log("Option sales response was empty.");
            }
        } else {
          // If not the specific message or empty, try to parse as JSON
          try {
            const optionData = JSON.parse(trimmedResponseText); // Use trimmed text
            // Access the nested array based on the sample data structure
            currentOptionSales = optionData.OptionSaleDetails || [];
            setAllOptionSaleDetails(currentOptionSales);
            currentOptionSales.forEach(item => {
              // Use the correct key 'close_date' from the sample data
              const year = getYear(item.close_date); // getYear returns a number or ''
              if (year) allYears.add(year);
            });
          }
          catch (parseError) {
            // If JSON parsing fails after checking the specific message, it's likely an actual error response
            console.error("Failed to parse option sales JSON:", parseError);
            console.error("Option sales response text:", trimmedResponseText); // Log the problematic text
            setOptionError(`Failed to parse option sales data. Server response: ${trimmedResponseText || 'Invalid format'}`);
            currentOptionSales = []; // Ensure data state is empty on error
            setAllOptionSaleDetails([]);
          }
        }
      } catch (e) {
        // Catch fetch errors (network issues, initial HTTP error check before reading text)
        console.error("Failed to fetch option sales data:", e);
        setOptionError(`Failed to load option sales data: ${e.message}`);
      }

      // Combine years and set state
      const sortedYears = [...allYears].sort((a, b) => b - a);
      // Use empty array if no years found
      const finalAvailableYears = sortedYears.length > 0 ? sortedYears : [];
      setAvailableYears(finalAvailableYears);

      // Determine the latest year from available data or default to empty string
      latestYearOverall = finalAvailableYears[0] || '';
      setSelectedYear(latestYearOverall); // Set state AFTER availableYears is set

      // Filter initial data based on the determined latest year (only if latestYearOverall is not empty)
      // Ensure comparison is between numbers
      if (latestYearOverall) {
        const numLatestYear = Number(latestYearOverall); // Convert to number
        setStockSaleDetails(currentStockSales.filter(item => getYear(item.SaleDate) === numLatestYear));
        // Use the correct key 'close_date' for filtering and compare numbers
        setOptionSaleDetails(currentOptionSales.filter(item => getYear(item.close_date) === numLatestYear));
      } else {
        // If no year could be determined, ensure details are empty
        setStockSaleDetails([]);
        setOptionSaleDetails([]);
      }

    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const handleYearChange = (event) => {
    const selectedYearValue = event.target.value; // This is usually a string from Select
    setSelectedYear(selectedYearValue);

    // Filter both datasets when year changes (only if year is not empty)
    // Ensure comparison is between numbers
    if (selectedYearValue) {
      const numSelectedYear = Number(selectedYearValue); // Convert to number

      // Filter Stocks
      const filteredStocks = allStockSaleDetails.filter(item => getYear(item.SaleDate) === numSelectedYear);
      setStockSaleDetails(filteredStocks);

      // Filter Options
      const filteredOptions = allOptionSaleDetails.filter(item => {
        const itemYear = getYear(item.close_date);
        return itemYear === numSelectedYear;
      });
      setOptionSaleDetails(filteredOptions);

    } else {
      // If year is cleared or invalid, show no data
      setStockSaleDetails([]);
      setOptionSaleDetails([]);
    }
  };

  // Calculate totals for the currently filtered stock data
  const stockTotals = useMemo(() => stockSaleDetails.reduce(
    (acc, row) => {
      acc.realizacao += row.SaleAmountEUR || 0;
      acc.aquisicao += Math.abs(row.BuyAmountEUR || 0); // Use absolute value
      acc.despesas += row.Commission || 0;
      // acc.imposto += row.ImpostoPago || 0; // Add when data is available
      return acc;
    },
    { realizacao: 0, aquisicao: 0, despesas: 0, imposto: 0 } // Initial values
  ), [stockSaleDetails]); // Recalculate only when stockSaleDetails changes

  // Group and aggregate option data by country
  const groupedOptionData = useMemo(() => {
    const grouped = optionSaleDetails.reduce((acc, row) => {
      const country = row.country_code || 'Unknown'; // Handle missing country code
      if (!acc[country]) {
        acc[country] = {
          country_code: country,
          rendimentoLiquido: 0,
          impostoPago: 0, // Initialize impostoPago to 0
        };
      }
      // Calculate net income: delta - commission
      const netIncome = (row.delta || 0) - (row.commission || 0);
      acc[country].rendimentoLiquido += netIncome;
      // Imposto Pago is always 0 as per requirement
      // acc[country].impostoPago += 0; // No need to add 0 explicitly

      return acc;
    }, {});

    // Convert the grouped object back to an array
    return Object.values(grouped);
  }, [optionSaleDetails]); // Recalculate when optionSaleDetails changes

  // Calculate totals for the grouped option data
  const optionTotals = useMemo(() => groupedOptionData.reduce(
    (acc, group) => {
      acc.rendimentoLiquido += group.rendimentoLiquido || 0;
      acc.imposto += group.impostoPago || 0; // Sum the impostoPago (which is 0)
      return acc;
    },
    { rendimentoLiquido: 0, imposto: 0 } // Initial values
  ), [groupedOptionData]); // Recalculate only when groupedOptionData changes

  // Use filtered data directly
  // const filteredData = stockSaleDetails; // No longer needed

  // --- Helper Function for Placeholder Table ---
  // Updated to accept optional headers and add button
  const renderPlaceholderTable = (title, ariaLabel, colSpan, headers = null, message = "Data not available or feature not yet implemented.", showAddButton = true) => (
    <>
      <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 4 }}>
        {title}
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 1 }}> {/* Reduced bottom margin */}
        <Table size="small" aria-label={ariaLabel}>
          {headers && (
            <TableHead>
              <TableRow>
                {headers.map((header, index) => (
                  // Use dangerouslySetInnerHTML to render line breaks in headers
                  <StyledTableCell key={index} dangerouslySetInnerHTML={{ __html: header.replace(/\n/g, '<br />') }} />
                ))}
              </TableRow>
            </TableHead>
          )}
          <TableBody>
            <TableRow>
              <StyledTableBodyCell colSpan={colSpan || (headers ? headers.length : 1)}>{message}</StyledTableBodyCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      {showAddButton && (
        <Button variant="contained" size="small" sx={{ mb: 4 }} disabled>+ Adicionar Linha</Button>
      )}
      {/* Optional: Add placeholder Soma de Controlo */}
       <Typography variant="body2" sx={{ mb: 4, fontStyle: 'italic' }}>
         Soma de Controlo for {title} - Placeholder
       </Typography>
    </>
  );


  return (
    <Box>
      {/* Year Filter - Moved to top */}
      <Typography variant="subtitle1" gutterBottom> {/* Removed sx={{ mt: 2 }} */}
        Select Year
      </Typography>
      <Box sx={{ mb: 3, maxWidth: 150 }}> {/* Kept mb: 3 */}
        <FormControl fullWidth size="small">
          <InputLabel id="year-select-label">Year</InputLabel>
          <Select
            labelId="year-select-label"
            id="year-select"
            value={selectedYear} // Should now correctly handle '' initial value
            label="Year"
            onChange={handleYearChange}
            // Display empty if no years available to avoid MUI warning
            displayEmpty={availableYears.length === 0}
          >
            {/* Add a placeholder if no years */}
            {availableYears.length === 0 && <MenuItem value="" disabled>No Data</MenuItem>}
            {availableYears.map(year => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Main Title */}
      <Typography variant="h4" component="h1" gutterBottom sx={{ mt: 2 }}> {/* Added margin top */}
        Anexo J - 9 Rendimentos de Incrementos Patrimoniais (Categoria G)
       </Typography>

      {/* Section 9.2 Title - Moved up as 9.1 is removed */}
      <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}> {/* Kept original margin top */}
        9.2 Incrementos Patrimoniais de Opção de Englobamento
      </Typography>

      {/* Stock Error Display - Corrected: Only one block */}
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          Stock Sales Error: {error}
        </Typography>
      )}

      {/* Table 9.2 A: Stock Sale Details */}
      <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 4 }}>
         A - Alienação Onerosa de Partes Sociais e Outros Valores Mobiliários [art.º 10.º, n.º 1, al. b), do CIRS]
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 1 }}> {/* Reduced bottom margin */}
        <Table size="small" aria-label="stock sale details table">
          <TableHead>
            <TableRow>
              <StyledTableCell rowSpan={2}>Nº Linha<br />(951 a ...)</StyledTableCell>
              <StyledTableCell rowSpan={2}>País da Fonte</StyledTableCell>
              <StyledTableCell rowSpan={2}>Código</StyledTableCell>
              <StyledTableCell colSpan={4}>Realização</StyledTableCell> {/* Increased colSpan */}
              <StyledTableCell colSpan={4}>Aquisição</StyledTableCell> {/* Increased colSpan */}
              <StyledTableCell rowSpan={2}>Despesas e Encargos</StyledTableCell>
              <StyledTableCell rowSpan={2}>Imposto pago<br />no Estrangeiro</StyledTableCell>
              <StyledTableCell rowSpan={2}>País da<br />Contraparte</StyledTableCell>
            </TableRow>
            <TableRow>
              <StyledNestedTableCell>Ano</StyledNestedTableCell>
              <StyledNestedTableCell>Mês</StyledNestedTableCell>
              <StyledNestedTableCell>Dia</StyledNestedTableCell> {/* Added Dia */}
              <StyledNestedTableCell>Valor</StyledNestedTableCell>
              <StyledNestedTableCell>Ano</StyledNestedTableCell>
              <StyledNestedTableCell>Mês</StyledNestedTableCell>
              <StyledNestedTableCell>Dia</StyledNestedTableCell> {/* Added Dia */}
              <StyledNestedTableCell>Valor</StyledNestedTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stockSaleDetails.map((row, index) => (
              // Use a more stable key if available, like a unique ID from the backend if SaleDetail gets one
              <TableRow key={`${row.ISIN}-${row.SaleDate}-${index}`}>
                <StyledTableBodyCell>{951 + index}</StyledTableBodyCell>
                {/* Display the full country_code string */}
                <StyledTableBodyCell>{row.country_code || ''}</StyledTableBodyCell>
                <StyledTableBodyCell>G01</StyledTableBodyCell>
                <StyledTableBodyCell>{getYear(row.SaleDate)}</StyledTableBodyCell>
                <StyledTableBodyCell>{getMonth(row.SaleDate)}</StyledTableBodyCell>
                <StyledTableBodyCell>{getDay(row.SaleDate)}</StyledTableBodyCell> {/* Added Dia */}
                <StyledTableBodyCell>{row.SaleAmountEUR.toFixed(2)}</StyledTableBodyCell>
                <StyledTableBodyCell>{getYear(row.BuyDate)}</StyledTableBodyCell>
                <StyledTableBodyCell>{getMonth(row.BuyDate)}</StyledTableBodyCell>
                <StyledTableBodyCell>{getDay(row.BuyDate)}</StyledTableBodyCell> {/* Added Dia */}
                {/* Apply Math.abs() here */}
                <StyledTableBodyCell>{Math.abs(row.BuyAmountEUR).toFixed(2)}</StyledTableBodyCell>
                <StyledTableBodyCell>{row.Commission.toFixed(2)}</StyledTableBodyCell>
                {/* Placeholder cells for new columns */}
                <StyledTableBodyCell></StyledTableBodyCell>
                <StyledTableBodyCell></StyledTableBodyCell>
              </TableRow>
            ))}
            {stockSaleDetails.length === 0 && !error && ( // Show only if no error
              <TableRow>
                 {/* Adjusted colSpan for new columns */}
                <StyledTableBodyCell colSpan={14}>No stock sale data available for the selected year.</StyledTableBodyCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Stock Totals Section (9.2A) */}
      <Typography variant="body1" component="h3" gutterBottom sx={{ mt: 2, fontWeight: 'bold' }}> {/* Reverted margin top */}
        Soma de Controlo (9.2A)
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 4, maxWidth: '80%' }}>
        <Table size="small" aria-label="stock control sum table">
          <TableHead>
            <TableRow>
              {/* Use StyledTableCell for consistency or create specific styles */}
              <StyledTableCell>Valor Realização</StyledTableCell>
              <StyledTableCell>Valor Aquisição</StyledTableCell>
              <StyledTableCell>Despesas e Encargos</StyledTableCell>
              <StyledTableCell>Imposto pago no Estrangeiro</StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <StyledTableBodyCell>{stockTotals.realizacao.toFixed(2)} €</StyledTableBodyCell>
              <StyledTableBodyCell>{stockTotals.aquisicao.toFixed(2)} €</StyledTableBodyCell>
              <StyledTableBodyCell>{stockTotals.despesas.toFixed(2)} €</StyledTableBodyCell>
              <StyledTableBodyCell>{stockTotals.imposto.toFixed(2)} €</StyledTableBodyCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {/* Option Error Display */}
      {optionError && (
        <Typography color="error" sx={{ mb: 2, mt: 4 }}>
          Option Sales Error: {optionError}
        </Typography>
      )}

      {/* Table 9.2 B: Option Sale Details */}
      <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 4 }}>
         B - Outros Incrementos Patrimoniais de Opção de Englobamento [art.º 10.º, n.º 1, als. c), e) e h), do CIRS]
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 1 }}> {/* Reduced bottom margin */}
        <Table size="small" aria-label="option sale details table">
          <TableHead>
            <TableRow>
              <StyledTableCell>Nº Linha<br />(991 a ...)</StyledTableCell>
              <StyledTableCell>Código Rendimento</StyledTableCell>
              <StyledTableCell>País da Fonte</StyledTableCell>
              <StyledTableCell>Rendimento Líquido</StyledTableCell>
              <StyledTableCell>Imposto Pago<br />no Estrangeiro</StyledTableCell>
              <StyledTableCell>País da<br />Contraparte</StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Render grouped and aggregated option data */}
            {groupedOptionData.length > 0 ? (
              groupedOptionData.map((group, index) => (
                // Use country_code in the key for stability
                <TableRow key={`${group.country_code}-${index}`}>
                   <StyledTableBodyCell>{991 + index}</StyledTableBodyCell>
                   <StyledTableBodyCell align="left">G30</StyledTableBodyCell>
                   {/* Display the country code */}
                   <StyledTableBodyCell align="left">{group.country_code}</StyledTableBodyCell>
                   {/* Display the aggregated Rendimento Líquido */}
                   <StyledTableBodyCell>{(group.rendimentoLiquido || 0).toFixed(2)}</StyledTableBodyCell>
                   {/* Display the Imposto Pago (always 0) */}
                   <StyledTableBodyCell>{(group.impostoPago || 0).toFixed(2)}</StyledTableBodyCell>
                   {/* Placeholder for País da Contraparte */}
                   <StyledTableBodyCell align="left"></StyledTableBodyCell>
                 </TableRow>
              ))
            ) : !optionError ? (
              <TableRow>
                 {/* Adjusted colSpan */}
                <StyledTableBodyCell colSpan={6}>No option sale data available for the selected year.</StyledTableBodyCell>
              </TableRow>
            ) : (
              <TableRow>
                 {/* Show error message if fetch failed */}
                <StyledTableBodyCell colSpan={6}>Error loading option data.</StyledTableBodyCell>
              </TableRow>
            )}
             {/* Static example row from image if needed for layout testing */}
             {/* <TableRow>
               <StyledTableBodyCell sx={{ fontWeight: 'bold' }}>1</StyledTableBodyCell>
               <StyledTableBodyCell>991</StyledTableBodyCell>
               <StyledTableBodyCell align="left">G30 - Operações relativas a instrum...</StyledTableBodyCell>
               <StyledTableBodyCell align="left">276 - Alemanha</StyledTableBodyCell>
               <StyledTableBodyCell>250,00 €</StyledTableBodyCell>
               <StyledTableBodyCell>5,55 €</StyledTableBodyCell>
               <StyledTableBodyCell align="left"></StyledTableBodyCell>
               <StyledTableBodyCell>
                 <IconButton size="small" disabled>
                   <DeleteIcon fontSize="small" color="error"/>
                 </IconButton>
               </StyledTableBodyCell>
             </TableRow> */}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Option Totals Section (9.2B) */}
      <Typography variant="body1" component="h3" gutterBottom sx={{ mt: 2, fontWeight: 'bold' }}> {/* Reverted margin top */}
        Soma de Controlo (9.2B)
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 4, maxWidth: '50%' }}> {/* Adjust width as needed */}
        <Table size="small" aria-label="option control sum table">
          <TableHead>
            <TableRow>
              <StyledTableCell>Rendimento Líquido</StyledTableCell>
              <StyledTableCell>Imposto pago no Estrangeiro</StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <StyledTableBodyCell>{optionTotals.rendimentoLiquido.toFixed(2)} €</StyledTableBodyCell>
              {/* Use calculated total for imposto */}
              <StyledTableBodyCell>{optionTotals.imposto.toFixed(2)} €</StyledTableBodyCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

    </Box>
  );
}
