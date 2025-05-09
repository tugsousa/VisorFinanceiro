import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  styled, CircularProgress, Alert
} from '@mui/material';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { API_ENDPOINTS, UI_TEXT, NO_YEAR_SELECTED } from '../constants';

const summaryTableStyles = `
  .summary-container { margin: 10px auto 20px auto; width: 60%; }
  .summary-table { width: 100%; border-collapse: collapse; background-color:rgb(255, 255, 255); color: #50809b; font-family: Arial, sans-serif; }
  .summary-table td { border: none; padding: 4px; font-size: 12px; line-height: 1.2; vertical-align: middle; }
  .summary-header { border-bottom: 1px solid #ccc !important; text-align: center; padding-bottom: 3px; font-weight: bold; border-bottom: 1px solid #50809b !important; }
  .summary-header .header-line { display: block; }
  .summary-header .header-separator { display: block; content: " - "; white-space: pre; font-weight: normal; line-height: 0.5; }
  .summary-value { text-align: right; }
  .control-sum { text-align: left; font-weight: bold; }
`;

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  backgroundColor: '#e5f5ff', color: '#50809b', fontWeight: 'normal',
  border: '1px solid #0084cc', textAlign: 'center', padding: '1px 2px',
  fontSize: '0.75rem', verticalAlign: 'center',
}));

const StyledNestedTableCell = styled(TableCell)(({ theme }) => ({
  backgroundColor: '#e5f5ff', color: '#50809b', fontWeight: 'normal',
  border: '1px solid #0084cc', textAlign: 'center', padding: '1px 2px',
  fontSize: '0.75rem', verticalAlign: 'middle',
}));

const StyledTableBodyCell = styled(TableCell)(({ theme, align = 'center' }) => ({
  border: '1px solid #0084cc', backgroundColor: '#ffffff', textAlign: align,
  padding: '4px 6px', fontSize: '0.8rem', verticalAlign: 'middle',
}));

// Improved Date Parsing (Handles DD-MM-YYYY and YYYY-MM-DD)
const parseDateRobust = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  // Try DD-MM-YYYY
  let parts = dateString.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const year = parseInt(parts[3], 10);
    if (year > 1900 && year < 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) return d;
    }
  }
  // Try YYYY-MM-DD
  parts = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const year = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const day = parseInt(parts[3], 10);
    if (year > 1900 && year < 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) return d;
    }
  }
  console.warn(`TaxPage: Failed to parse date string: ${dateString}`);
  return null;
};

const getYear = (dateString) => { const d = parseDateRobust(dateString); return d ? d.getUTCFullYear() : null; };
const getMonth = (dateString) => { const d = parseDateRobust(dateString); return d ? String(d.getUTCMonth() + 1).padStart(2, '0') : ''; };
const getDay = (dateString) => { const d = parseDateRobust(dateString); return d ? String(d.getUTCDate()).padStart(2, '0') : ''; };


export default function TaxPage() {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext);
  const [selectedYear, setSelectedYear] = useState(NO_YEAR_SELECTED);
  const [stockSaleDetails, setStockSaleDetails] = useState([]);
  const [allStockSaleDetails, setAllStockSaleDetails] = useState([]);
  const [optionSaleDetails, setOptionSaleDetails] = useState([]);
  const [allOptionSaleDetails, setAllOptionSaleDetails] = useState([]);
  const [dividendTaxData, setDividendTaxData] = useState([]); // This will be the transformed array for the table
  const [allDividendTaxData, setAllDividendTaxData] = useState({}); // This stores the raw {year: {country: {}}} structure
  const [availableYears, setAvailableYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoading(false);
        setError(UI_TEXT.userNotAuthenticated);
        return;
      }
      setLoading(true);
      setError(null);
      let allYearsSet = new Set();
      let fetchedStockSales = [];
      let fetchedOptionSales = [];
      let fetchedDividendSummary = {};

      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();
        if (!currentCsrfToken) throw new Error("CSRF token not available for tax data.");

        const results = await Promise.allSettled([
          axios.get(API_ENDPOINTS.STOCK_SALES, { headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken }, withCredentials: true }),
          axios.get(API_ENDPOINTS.OPTION_SALES, { headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken }, withCredentials: true }),
          axios.get(API_ENDPOINTS.DIVIDEND_TAX_SUMMARY, { headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken }, withCredentials: true })
        ]);
        
        const errors = [];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const source = ['Stock Sales', 'Option Sales', 'Dividend Summary'][index];
                errors.push(`${source}: ${result.reason?.response?.data?.error || result.reason?.message || 'Failed to fetch'}`);
            }
        });

        if (results[0].status === 'fulfilled') {
            fetchedStockSales = results[0].value.data || [];
            setAllStockSaleDetails(fetchedStockSales);
            fetchedStockSales.forEach(item => { const y = getYear(item.SaleDate); if (y) allYearsSet.add(y); });
        }
        if (results[1].status === 'fulfilled') {
            fetchedOptionSales = results[1].value.data?.OptionSaleDetails || [];
            setAllOptionSaleDetails(fetchedOptionSales);
            fetchedOptionSales.forEach(item => { const y = getYear(item.close_date); if (y) allYearsSet.add(y); });
        }
        if (results[2].status === 'fulfilled') {
            fetchedDividendSummary = results[2].value.data || {};
            setAllDividendTaxData(fetchedDividendSummary);
            Object.keys(fetchedDividendSummary).forEach(yearStr => { const yN = parseInt(yearStr, 10); if (!isNaN(yN)) allYearsSet.add(yN); });
        }
        
        if (errors.length > 0) setError(errors.join('; '));

        const sortedYears = [...allYearsSet].map(Number).sort((a, b) => b - a); // Ensure numbers and sort desc
        setAvailableYears(sortedYears);
        
        const latestYear = sortedYears.length > 0 ? String(sortedYears[0]) : NO_YEAR_SELECTED;
        setSelectedYear(latestYear);
        filterDataForYear(latestYear, fetchedStockSales, fetchedOptionSales, fetchedDividendSummary);

      } catch (e) {
        console.error("Failed to fetch tax page data:", e);
        setError(`Failed to load page data: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, csrfToken, fetchCsrfToken]);

  const filterDataForYear = (yearToFilter, currentAllStock, currentAllOptions, currentAllDividends) => {
    if (yearToFilter === NO_YEAR_SELECTED || yearToFilter === '') {
        setStockSaleDetails([]);
        setOptionSaleDetails([]);
        setDividendTaxData([]);
        return;
    }
    const numYear = Number(yearToFilter);
    setStockSaleDetails((currentAllStock || allStockSaleDetails).filter(item => getYear(item.SaleDate) === numYear));
    setOptionSaleDetails((currentAllOptions || allOptionSaleDetails).filter(item => getYear(item.close_date) === numYear));
    
    const dividendYearData = (currentAllDividends || allDividendTaxData)[String(yearToFilter)] || {};
    const transformedDividends = Object.entries(dividendYearData).map(([country, details], index) => ({
      id: `${yearToFilter}-${country}-${index}`, linha: 801 + index, codigo: 'E11', paisFonte: country,
      rendimentoBruto: details.gross_amt || 0, impostoFonte: Math.abs(details.taxed_amt || 0), // Tax is often negative
      impostoRetido: 0, nifEntidade: '', retencaoFonte: 0, // Placeholder values for these fields
    }));
    setDividendTaxData(transformedDividends);
  };

  const handleYearChange = (event) => {
    const yearValue = event.target.value;
    setSelectedYear(yearValue);
    filterDataForYear(yearValue, allStockSaleDetails, allOptionSaleDetails, allDividendTaxData);
  };

  const stockTotals = useMemo(() => stockSaleDetails.reduce(
    (acc, row) => {
      acc.realizacao += row.SaleAmountEUR || 0;
      acc.aquisicao += Math.abs(row.BuyAmountEUR || 0); // Cost is positive
      acc.despesas += row.Commission || 0;
      // Imposto pago no estrangeiro for stocks usually isn't directly here, it's part of capital gains tax calc
      return acc;
    }, { realizacao: 0, aquisicao: 0, despesas: 0, imposto: 0 } // imposto field for consistency if needed later
  ), [stockSaleDetails]);

  const groupedOptionData = useMemo(() => {
    const grouped = optionSaleDetails.reduce((acc, row) => {
      const country = row.country_code || 'Unknown'; // Ensure country_code exists
      if (!acc[country]) {
        acc[country] = { country_code: country, rendimentoLiquido: 0, impostoPago: 0 };
      }
      // Delta is usually Net P/L for options. Commission is part of delta usually.
      acc[country].rendimentoLiquido += (row.delta || 0); 
      // Imposto pago no estrangeiro for options is not typically itemized this way from brokers.
      return acc;
    }, {});
    return Object.values(grouped);
  }, [optionSaleDetails]);

  const optionTotals = useMemo(() => groupedOptionData.reduce(
    (acc, group) => {
      acc.rendimentoLiquido += group.rendimentoLiquido || 0;
      acc.imposto += group.impostoPago || 0; // Assuming impostoPago is 0 for now from options
      return acc;
    }, { rendimentoLiquido: 0, imposto: 0 }
  ), [groupedOptionData]);

  const dividendTotals = useMemo(() => dividendTaxData.reduce(
    (acc, row) => {
      acc.rendimentoBruto += row.rendimentoBruto || 0;
      acc.impostoFonte += row.impostoFonte || 0;
      acc.impostoRetido += row.impostoRetido || 0; // This is usually 0 for foreign dividends unless specific agreement
      acc.retencaoFonte += row.retencaoFonte || 0; // NIF Entidade Retentora PT related
      return acc;
    }, { rendimentoBruto: 0, impostoFonte: 0, impostoRetido: 0, retencaoFonte: 0 }
  ), [dividendTaxData]);

  if (loading) return <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />;
  if (error && !selectedYear) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;


  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}> {/* Responsive padding */}
      <style dangerouslySetInnerHTML={{ __html: summaryTableStyles }} />
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 2 }}>
        Tax Report Information
      </Typography>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Select Year</Typography>
        <FormControl sx={{ minWidth: 120 }} size="small">
          <InputLabel id="year-select-label">Year</InputLabel>
          <Select
            labelId="year-select-label"
            value={selectedYear}
            label="Year"
            onChange={handleYearChange}
            disabled={availableYears.length === 0}
          >
            {availableYears.length === 0 && <MenuItem value={NO_YEAR_SELECTED} disabled>No Data</MenuItem>}
            {availableYears.map(year => (
              <MenuItem key={year} value={String(year)}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {!selectedYear && !loading && <Typography sx={{textAlign: 'center', my:2}}>Please select a year to view data.</Typography>}

      {selectedYear && (
        <>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 2, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.1rem' }}>
            Anexo J - Quadro 8: Rendimentos de Capitais (Categoria E) - Obtidos no Estrangeiro
          </Typography>
          <Box sx={{ pl: { xs: 0, sm: 2 } }}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ mt: 2, mb: 1, color: '#8d98a8', border: '1px solid grey', padding: '2px 8px', display: 'inline-block', fontSize: '0.7rem' }}>A - Rendimentos que não respeitam a depósitos ou seguros</Typography>
            <TableContainer component={Paper} sx={{ mb: 1, overflowX: 'auto' }}>
              <Table size="small" aria-label="dividend tax details table">
                <TableHead>
                  <TableRow>
                    <StyledTableCell rowSpan={2}>Nº Linha<br />(801 a ...)</StyledTableCell>
                    <StyledTableCell rowSpan={2}>Código Rend.</StyledTableCell>
                    <StyledTableCell rowSpan={2}>País da Fonte</StyledTableCell>
                    <StyledTableCell rowSpan={2}>Rendimento Bruto (€)</StyledTableCell>
                    <StyledTableCell colSpan={3}>Imposto Pago no Estrangeiro (€)</StyledTableCell>
                    <StyledTableCell colSpan={2}>Imposto Retido em Portugal (€)</StyledTableCell>
                  </TableRow>
                  <TableRow>
                    <StyledNestedTableCell>No país da fonte</StyledNestedTableCell>
                    <StyledNestedTableCell>País Agente Pagador<br />(Dir. Poupança)</StyledNestedTableCell>
                    <StyledNestedTableCell>Imposto retido</StyledNestedTableCell>
                    <StyledNestedTableCell>NIF Ent. Retentora</StyledNestedTableCell>
                    <StyledNestedTableCell>Retenção Fonte</StyledNestedTableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dividendTaxData.length > 0 ? (
                    dividendTaxData.map((row) => (
                      <TableRow key={row.id}>
                        <StyledTableBodyCell>{row.linha}</StyledTableBodyCell>
                        <StyledTableBodyCell align="left">{row.codigo}</StyledTableBodyCell>
                        <StyledTableBodyCell align="left">{row.paisFonte}</StyledTableBodyCell>
                        <StyledTableBodyCell>{row.rendimentoBruto.toFixed(2)}</StyledTableBodyCell>
                        <StyledTableBodyCell>{row.impostoFonte.toFixed(2)}</StyledTableBodyCell>
                        <StyledTableBodyCell>{/* Dir. Poupança - usually empty */}</StyledTableBodyCell>
                        <StyledTableBodyCell>{row.impostoRetido.toFixed(2)}</StyledTableBodyCell>
                        <StyledTableBodyCell align="left">{row.nifEntidade}</StyledTableBodyCell>
                        <StyledTableBodyCell>{row.retencaoFonte.toFixed(2)}</StyledTableBodyCell>
                      </TableRow>
                    ))
                  ) : ( <TableRow><StyledTableBodyCell colSpan={9}>{UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                </TableBody>
              </Table>
            </TableContainer>
            <div className="summary-container">
              <table className="summary-table">
                <thead><tr><td className="summary-header"></td><td className="summary-header"><span className="header-line">Rendimento Bruto</span></td><td className="summary-header"><span className="header-line">Imposto Pago no Estrangeiro</span><span className="header-separator">-</span><span className="header-line">No país da fonte</span></td><td className="summary-header"><span className="header-line">Imposto Pago no Estrangeiro</span><span className="header-separator">-</span><span className="header-line">Imposto Retido</span></td><td className="summary-header"><span className="header-line">Imposto Retido em Portugal</span><span className="header-separator">-</span><span className="header-line">Retenção na Fonte</span></td></tr></thead>
                <tbody><tr><td className="control-sum">Soma de Controlo</td><td className="summary-value">{dividendTotals.rendimentoBruto.toFixed(2)} €</td><td className="summary-value">{dividendTotals.impostoFonte.toFixed(2)} €</td><td className="summary-value">{dividendTotals.impostoRetido.toFixed(2)} €</td><td className="summary-value">{dividendTotals.retencaoFonte.toFixed(2)} €</td></tr></tbody>
              </table>
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
                  <TableHead>
                    <TableRow>
                      <StyledTableCell rowSpan={2}>Nº Linha<br />(951 a ...)</StyledTableCell><StyledTableCell rowSpan={2}>País Fonte</StyledTableCell><StyledTableCell rowSpan={2}>Código</StyledTableCell>
                      <StyledTableCell colSpan={4}>Realização (€)</StyledTableCell><StyledTableCell colSpan={4}>Aquisição (€)</StyledTableCell>
                      <StyledTableCell rowSpan={2}>Despesas e Encargos (€)</StyledTableCell><StyledTableCell rowSpan={2}>Imposto pago<br />Estrang. (€)</StyledTableCell><StyledTableCell rowSpan={2}>País<br />Contraparte</StyledTableCell>
                    </TableRow>
                    <TableRow>
                      <StyledNestedTableCell>Ano</StyledNestedTableCell><StyledNestedTableCell>Mês</StyledNestedTableCell><StyledNestedTableCell>Dia</StyledNestedTableCell><StyledNestedTableCell>Valor</StyledNestedTableCell>
                      <StyledNestedTableCell>Ano</StyledNestedTableCell><StyledNestedTableCell>Mês</StyledNestedTableCell><StyledNestedTableCell>Dia</StyledNestedTableCell><StyledNestedTableCell>Valor</StyledNestedTableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stockSaleDetails.length > 0 ? (
                      stockSaleDetails.map((row, index) => (
                        <TableRow key={`${row.ISIN}-${row.SaleDate}-${index}`}>
                          <StyledTableBodyCell>{951 + index}</StyledTableBodyCell>
                          <StyledTableBodyCell>{row.country_code || ''}</StyledTableBodyCell>
                          <StyledTableBodyCell>G01</StyledTableBodyCell>
                          <StyledTableBodyCell>{getYear(row.SaleDate)}</StyledTableBodyCell><StyledTableBodyCell>{getMonth(row.SaleDate)}</StyledTableBodyCell><StyledTableBodyCell>{getDay(row.SaleDate)}</StyledTableBodyCell>
                          <StyledTableBodyCell>{row.SaleAmountEUR?.toFixed(2)}</StyledTableBodyCell>
                          <StyledTableBodyCell>{getYear(row.BuyDate)}</StyledTableBodyCell><StyledTableBodyCell>{getMonth(row.BuyDate)}</StyledTableBodyCell><StyledTableBodyCell>{getDay(row.BuyDate)}</StyledTableBodyCell>
                          <StyledTableBodyCell>{Math.abs(row.BuyAmountEUR || 0).toFixed(2)}</StyledTableBodyCell>
                          <StyledTableBodyCell>{row.Commission?.toFixed(2)}</StyledTableBodyCell>
                          <StyledTableBodyCell>{/* Imposto Estrang. */}</StyledTableBodyCell><StyledTableBodyCell>{/* País Contraparte */}</StyledTableBodyCell>
                        </TableRow>
                      ))
                    ) : ( <TableRow><StyledTableBodyCell colSpan={14}>{UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                  </TableBody>
                </Table>
              </TableContainer>
              <div className="summary-container">
                <table className="summary-table">
                  <thead><tr><td className="summary-header"></td><td className="summary-header"><span className="header-line">Valor Realização</span></td><td className="summary-header"><span className="header-line">Valor Aquisição</span></td><td className="summary-header"><span className="header-line">Despesas e Encargos</span></td><td className="summary-header"><span className="header-line">Imposto pago no Estrangeiro</span></td></tr></thead>
                  <tbody><tr><td className="control-sum">Soma de Controlo</td><td className="summary-value">{stockTotals.realizacao.toFixed(2)} €</td><td className="summary-value">{stockTotals.aquisicao.toFixed(2)} €</td><td className="summary-value">{stockTotals.despesas.toFixed(2)} €</td><td className="summary-value">{stockTotals.imposto.toFixed(2)} €</td></tr></tbody>
                </table>
              </div>

              <Box sx={{ mt: 2, display: 'flex', alignItems: 'baseline', mb: 1 }}>
                <Typography variant="subtitle1" component="span" sx={{ border: '0.5px solid grey', padding: '2px 8px', display: 'inline-block', mr: 1, color: '#8d98a8', fontSize: '0.7rem' }}>B</Typography>
                <Typography variant="subtitle2" component="span" sx={{ color: '#8d98a8', fontSize: '0.7rem' }}>Operações Relativas a Instrumentos Financeiros Derivados e Ganhos (Warrants Autónomos)</Typography>
              </Box>
              <TableContainer component={Paper} sx={{ mb: 1, overflowX: 'auto' }}>
                <Table size="small" aria-label="option sale details table">
                  <TableHead>
                    <TableRow>
                      <StyledTableCell>Nº Linha<br />(991 a ...)</StyledTableCell><StyledTableCell>Código Rend.</StyledTableCell><StyledTableCell>País Fonte</StyledTableCell>
                      <StyledTableCell>Rendimento Líquido (€)</StyledTableCell><StyledTableCell>Imposto Pago<br />Estrang. (€)</StyledTableCell><StyledTableCell>País<br />Contraparte</StyledTableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupedOptionData.length > 0 ? (
                      groupedOptionData.map((group, index) => (
                        <TableRow key={`${group.country_code}-${index}`}>
                          <StyledTableBodyCell>{991 + index}</StyledTableBodyCell>
                          <StyledTableBodyCell align="left">G30</StyledTableBodyCell> {/* G30 for financial derivatives */}
                          <StyledTableBodyCell align="left">{group.country_code}</StyledTableBodyCell>
                          <StyledTableBodyCell>{(group.rendimentoLiquido || 0).toFixed(2)}</StyledTableBodyCell>
                          <StyledTableBodyCell>{(group.impostoPago || 0).toFixed(2)}</StyledTableBodyCell>
                          <StyledTableBodyCell align="left">{/* País Contraparte - usually empty or same as fonte */}</StyledTableBodyCell>
                        </TableRow>
                      ))
                    ) : ( <TableRow><StyledTableBodyCell colSpan={6}>{UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                  </TableBody>
                </Table>
              </TableContainer>
              <div className="summary-container">
                <table className="summary-table">
                  <thead><tr><td className="summary-header"></td><td className="summary-header"><span className="header-line">Rendimento Líquido</span></td><td className="summary-header"><span className="header-line">Imposto pago no Estrangeiro</span></td></tr></thead>
                  <tbody><tr><td className="control-sum">Soma de Controlo</td><td className="summary-value">{optionTotals.rendimentoLiquido.toFixed(2)} €</td><td className="summary-value">{optionTotals.imposto.toFixed(2)} €</td></tr></tbody>
                </table>
              </div>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}