// frontend/src/pages/TaxPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  styled, CircularProgress, Alert, Grid
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { 
  apiFetchStockSales, 
  apiFetchOptionSales, 
  apiFetchDividendTaxSummary 
} from '../api/apiService';
import { useAuth } from '../context/AuthContext';
import { UI_TEXT, NO_YEAR_SELECTED } from '../constants';
import { getYear, getMonth, getDay, extractYearsFromData } from '../utils/dateUtils';
import './TaxPage.css'; 

const StyledTableCell = styled(TableCell)(/* ... as before ... */);
const StyledNestedTableCell = styled(TableCell)(/* ... as before ... */);
const StyledTableBodyCell = styled(TableCell)(/* ... as before ... */);


const fetchTaxReportData = async () => {
  const [stockRes, optionRes, dividendRes] = await Promise.all([
    apiFetchStockSales(),
    apiFetchOptionSales(),
    apiFetchDividendTaxSummary(),
  ]);
  // Note: Error handling within queryFn is tricky; React Query prefers errors to be thrown.
  // If any request fails, Promise.all will reject, and useQuery will catch it.
  return {
    stockSales: stockRes.data || [],
    optionSales: optionRes.data?.OptionSaleDetails || [], // Adjusted based on original hook
    dividendSummary: dividendRes.data || {},
  };
};


export default function TaxPage() {
  const { token } = useAuth();
  const { 
    data: taxApiData, 
    isLoading: loading, 
    error: queryError, 
    isError 
  } = useQuery({
    queryKey: ['taxReportData', token],
    queryFn: fetchTaxReportData,
    enabled: !!token,
    staleTime: 1000 * 60 * 10, // 10 minutes for tax data
  });
  
  const apiError = isError ? (queryError?.message || UI_TEXT.errorLoadingData) : null;

  const [selectedYear, setSelectedYear] = useState(NO_YEAR_SELECTED);

  const [allStockSaleDetails, setAllStockSaleDetails] = useState([]);
  const [allOptionSaleDetails, setAllOptionSaleDetails] = useState([]);
  const [allDividendTaxData, setAllDividendTaxData] = useState({});

  const [stockSaleDetails, setStockSaleDetails] = useState([]);
  const [optionSaleDetails, setOptionSaleDetails] = useState([]);
  const [dividendTaxReportRows, setDividendTaxReportRows] = useState([]);

  const [availableYears, setAvailableYears] = useState([]);
  
  useEffect(() => {
    if (taxApiData) {
        setAllStockSaleDetails(taxApiData.stockSales || []);
        setAllOptionSaleDetails(taxApiData.optionSales || []);
        setAllDividendTaxData(taxApiData.dividendSummary || {});

        const dateAccessors = { 
            stockSales: 'SaleDate',
            optionSales: 'close_date',
            dividendSummary: null, // Handled by keys of the object
        };
        // Prepare a structure similar to what extractYearsFromData expects
        const dataForYearExtraction = {
            stockSales: taxApiData.stockSales || [],
            optionSales: taxApiData.optionSales || [],
            DividendTaxResult: taxApiData.dividendSummary || {}, // Match expected key
        };

        const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);
        const actualDataYears = yearsFromUtil
            .filter(y => y !== NO_YEAR_SELECTED && y !== '')
            .map(y => String(y));

        setAvailableYears(actualDataYears);

        const currentSystemYear = new Date().getFullYear();
        const targetDefaultYearStr = String(currentSystemYear - 1);

        if (actualDataYears.includes(targetDefaultYearStr)) {
            setSelectedYear(targetDefaultYearStr);
        } else if (actualDataYears.length > 0) {
            setSelectedYear(actualDataYears[0]); 
        } else {
            setSelectedYear(NO_YEAR_SELECTED);
        }
    } else {
        setAllStockSaleDetails([]);
        setAllOptionSaleDetails([]);
        setAllDividendTaxData({});
        setAvailableYears([]);
        setSelectedYear(NO_YEAR_SELECTED);
    }
  }, [taxApiData]);


  const filterDataForYear = useCallback((yearToFilter) => {
    // ... (existing filtering logic is fine)
    if (yearToFilter === NO_YEAR_SELECTED || yearToFilter === '') {
        setStockSaleDetails([]);
        setOptionSaleDetails([]);
        setDividendTaxReportRows([]);
        return;
    }
    const numYear = Number(yearToFilter);

    setStockSaleDetails(allStockSaleDetails.filter(item => getYear(item.SaleDate) === numYear));
    setOptionSaleDetails(allOptionSaleDetails.filter(item => getYear(item.close_date) === numYear));
    
    const dividendYearData = allDividendTaxData[String(yearToFilter)] || {};
    const transformedDividends = Object.entries(dividendYearData).map(([country, details], index) => ({
      id: `${yearToFilter}-${country}-${index}`, linha: 801 + index, codigo: 'E11', paisFonte: country,
      rendimentoBruto: details.gross_amt || 0, impostoFonte: Math.abs(details.taxed_amt || 0),
      impostoRetido: 0, nifEntidade: '', retencaoFonte: 0,
    }));
    setDividendTaxReportRows(transformedDividends);
  }, [allStockSaleDetails, allOptionSaleDetails, allDividendTaxData]);

  useEffect(() => {
    if (!loading && selectedYear !== undefined) { 
        filterDataForYear(selectedYear);
    }
  }, [selectedYear, allStockSaleDetails, allOptionSaleDetails, allDividendTaxData, filterDataForYear, loading]);

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  // ... (stockTotals, groupedOptionData, optionTotals, dividendTotals memos remain the same)
  const stockTotals = useMemo(() => stockSaleDetails.reduce(
    (acc, row) => {
      acc.realizacao += row.SaleAmountEUR || 0;
      acc.aquisicao += Math.abs(row.BuyAmountEUR || 0);
      acc.despesas += row.Commission || 0;
      return acc;
    }, { realizacao: 0, aquisicao: 0, despesas: 0, imposto: 0 }
  ), [stockSaleDetails]);

  const groupedOptionData = useMemo(() => {
    const grouped = optionSaleDetails.reduce((acc, row) => {
      const country = row.country_code || 'Unknown';
      if (!acc[country]) {
        acc[country] = { country_code: country, rendimentoLiquido: 0, impostoPago: 0 };
      }
      acc[country].rendimentoLiquido += (row.delta || 0); 
      return acc;
    }, {});
    return Object.values(grouped);
  }, [optionSaleDetails]);

  const optionTotals = useMemo(() => groupedOptionData.reduce(
    (acc, group) => {
      acc.rendimentoLiquido += group.rendimentoLiquido || 0;
      acc.imposto += group.impostoPago || 0;
      return acc;
    }, { rendimentoLiquido: 0, imposto: 0 }
  ), [groupedOptionData]);

  const dividendTotals = useMemo(() => dividendTaxReportRows.reduce(
    (acc, row) => {
      acc.rendimentoBruto += row.rendimentoBruto || 0;
      acc.impostoFonte += row.impostoFonte || 0;
      acc.impostoRetido += row.impostoRetido || 0;
      acc.retencaoFonte += row.retencaoFonte || 0;
      return acc;
    }, { rendimentoBruto: 0, impostoFonte: 0, impostoRetido: 0, retencaoFonte: 0 }
  ), [dividendTaxReportRows]);

  // ... (loading, error, and no data rendering logic using 'loading', 'apiError', 'availableYears', 'selectedYear' etc.)
   if (loading && selectedYear === NO_YEAR_SELECTED) { 
      return <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />;
  }
  if (apiError && availableYears.length === 0 && selectedYear === NO_YEAR_SELECTED) {
      return <Alert severity="error" sx={{ m: 2 }}>{apiError}</Alert>;
  }


  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 2 }}>
        Tax Report Information
      </Typography>
      
      <Grid container spacing={2} sx={{ mb: 3, alignItems: 'center' }}>
        <Grid item>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <InputLabel id="year-select-taxpage-label">Year</InputLabel>
            <Select
              labelId="year-select-taxpage-label"
              value={selectedYear}
              label="Year"
              onChange={handleYearChange}
              disabled={loading || (availableYears.length === 0 && selectedYear === NO_YEAR_SELECTED)}
            >
              <MenuItem 
                value={NO_YEAR_SELECTED} 
                disabled={availableYears.length > 0}
              >
                {availableYears.length === 0 ? "No Data" : "Select Year"}
              </MenuItem>
              {availableYears.map(year => (
                <MenuItem key={year} value={String(year)}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      
      {apiError && (selectedYear !== NO_YEAR_SELECTED || (availableYears.length === 0 && loading)) && (
          <Alert severity="warning" sx={{ mb: 2 }}>{apiError}</Alert>
      )}
      
      {selectedYear === NO_YEAR_SELECTED && !loading && availableYears.length > 0 && (
        <Typography sx={{textAlign: 'center', my:2}}>Please select a year to view data.</Typography>
      )}
       {selectedYear === NO_YEAR_SELECTED && !loading && availableYears.length === 0 && !apiError && (
        <Typography sx={{textAlign: 'center', my:2}}>No data available. Please upload transactions.</Typography>
       )}

      {selectedYear && selectedYear !== NO_YEAR_SELECTED && !loading && (
        <>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 2, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.1rem' }}>
            Anexo J - Quadro 8: Rendimentos de Capitais (Categoria E) - Obtidos no Estrangeiro
          </Typography>
          <Box sx={{ pl: { xs: 0, sm: 2 } }}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ mt: 2, mb: 1, color: '#8d98a8', border: '1px solid grey', padding: '2px 8px', display: 'inline-block', fontSize: '0.7rem' }}>A - Rendimentos que não respeitam a depósitos ou seguros</Typography>
            <TableContainer component={Paper} sx={{ mb: 1, overflowX: 'auto' }}>
              <Table size="small" aria-label="dividend tax details table">
                <TableHead>
                  {/* ... table head rows ... */}
                </TableHead>
                <TableBody>
                  {dividendTaxReportRows.length > 0 ? (
                    dividendTaxReportRows.map((row) => (
                      <TableRow key={row.id}>
                        {/* ... table cells ... */}
                      </TableRow>
                    ))
                  ) : ( <TableRow><StyledTableBodyCell colSpan={9}>{loading ? "Loading..." : UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                </TableBody>
              </Table>
            </TableContainer>
            <div className="summary-container">
                {/* ... summary table ... */}
            </div>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 3, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.1rem' }}>
            Anexo J - Quadro 9: Rendimentos de Incrementos Patrimoniais (Categoria G) - Obtidos no Estrangeiro
          </Typography>
          <Box sx={{ pl: { xs: 0, sm: 2 } }}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ mt: 2, color: '#58839b', fontSize: '0.9rem' }}>
              9.2 Incrementos Patrimoniais de Opção de Englobamento
            </Typography>
            <Box sx={{ pl: { xs: 0, sm: 2 } }}>
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'baseline', mb: 1 }}>
                <Typography variant="subtitle1" component="span" sx={{ border: '0.5px solid grey', padding: '2px 8px', display: 'inline-block', mr: 1, color: '#8d98a8', fontSize: '0.7rem' }}>A</Typography>
                <Typography variant="subtitle2" component="span" sx={{ color: '#8d98a8', fontSize: '0.7rem' }}>Alienação Onerosa de Partes Sociais e Outros Valores Mobiliários</Typography>
              </Box>
              <TableContainer component={Paper} sx={{ mb: 1, overflowX: 'auto' }}>
                 <Table size="small" aria-label="stock sale details table">
                   <TableHead>{/* ... */}</TableHead>
                   <TableBody>
                    {stockSaleDetails.length > 0 ? (
                      stockSaleDetails.map((row, index) => (
                        <TableRow key={`${row.ISIN}-${row.SaleDate}-${index}`}>
                           {/* ... */}
                        </TableRow>
                      ))
                    ) : ( <TableRow><StyledTableBodyCell colSpan={14}>{loading ? "Loading..." : UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                   </TableBody>
                 </Table>
              </TableContainer>
              <div className="summary-container">{/* ... */}</div>

              <Box sx={{ mt: 2, display: 'flex', alignItems: 'baseline', mb: 1 }}>
                <Typography variant="subtitle1" component="span" sx={{ border: '0.5px solid grey', padding: '2px 8px', display: 'inline-block', mr: 1, color: '#8d98a8', fontSize: '0.7rem' }}>B</Typography>
                <Typography variant="subtitle2" component="span" sx={{ color: '#8d98a8', fontSize: '0.7rem' }}>Operações Relativas a Instrumentos Financeiros Derivados e Ganhos (Warrants Autónomos)</Typography>
              </Box>
              <TableContainer component={Paper} sx={{ mb: 1, overflowX: 'auto' }}>
                  <Table size="small" aria-label="option sale details table">
                    <TableHead>{/* ... */}</TableHead>
                    <TableBody>
                    {groupedOptionData.length > 0 ? (
                      groupedOptionData.map((group, index) => (
                        <TableRow key={`${group.country_code}-${index}`}>
                           {/* ... */}
                        </TableRow>
                      ))
                    ) : ( <TableRow><StyledTableBodyCell colSpan={6}>{loading ? "Loading..." : UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                    </TableBody>
                  </Table>
              </TableContainer>
              <div className="summary-container">{/* ... */}</div>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}