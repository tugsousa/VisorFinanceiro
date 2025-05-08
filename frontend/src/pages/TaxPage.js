// frontend/src/pages/TaxPage.js
import React, { useState, useEffect, useMemo, useContext } from 'react'; // Added useContext
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  styled, CircularProgress // Added CircularProgress
} from '@mui/material';
import axios from 'axios'; // Import axios
import { AuthContext } from '../context/AuthContext'; // Import AuthContext

// (Keep your styled components and summaryTableStyles as they are)
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


const parseDateDDMMYYYY = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const year = parseInt(parts[3], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date;
      }
    }
  }
   try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) return date;
  } catch (e) {}
  console.warn(`TaxPage: Failed to parse date string: ${dateString}`);
  return null;
};

const getYear = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? date.getUTCFullYear() : ''; // Return empty string if not parsable
};
const getMonth = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? String(date.getUTCMonth() + 1).padStart(2, '0') : '';
};
const getDay = (dateString) => {
  const date = parseDateDDMMYYYY(dateString);
  return date ? String(date.getUTCDate()).padStart(2, '0') : '';
};

export default function TaxPage() {
  const { token, csrfToken, fetchCsrfToken } = useContext(AuthContext); // Get auth context
  const [selectedYear, setSelectedYear] = useState('');
  const [stockSaleDetails, setStockSaleDetails] = useState([]);
  const [allStockSaleDetails, setAllStockSaleDetails] = useState([]);
  const [optionSaleDetails, setOptionSaleDetails] = useState([]);
  const [allOptionSaleDetails, setAllOptionSaleDetails] = useState([]);
  const [dividendTaxData, setDividendTaxData] = useState([]);
  const [allDividendTaxData, setAllDividendTaxData] = useState({});
  const [availableYears, setAvailableYears] = useState([]);
  const [loading, setLoading] = useState(true); // Single loading state for all initial fetches
  const [error, setError] = useState(null); // Consolidated error state

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoading(false);
        setError("User not authenticated. Please sign in.");
        return;
      }
      setLoading(true);
      setError(null);
      let allYearsSet = new Set();
      let fetchedStockSales = [];
      let fetchedOptionSales = [];
      let fetchedDividendData = {};

      try {
        const currentCsrfToken = csrfToken || await fetchCsrfToken();
        
        // Fetch all data concurrently
        const [stockResponse, optionResponse, dividendResponse] = await Promise.all([
          axios.get('http://localhost:8080/api/stock-sales', {
            headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken },
            withCredentials: true,
          }).catch(e => ({ error: e, source: 'stock' })), // Catch individual errors
          axios.get('http://localhost:8080/api/option-sales', {
            headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken },
            withCredentials: true,
          }).catch(e => ({ error: e, source: 'option' })),
          axios.get('http://localhost:8080/api/dividend-tax-summary', {
            headers: { 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': currentCsrfToken },
            withCredentials: true,
          }).catch(e => ({ error: e, source: 'dividend' }))
        ]);

        let errors = [];

        // Process Stock Sales
        if (stockResponse.error) {
          errors.push(`Stock Sales: ${stockResponse.error.response?.data?.error || stockResponse.error.message}`);
        } else {
          fetchedStockSales = stockResponse.data || [];
          setAllStockSaleDetails(fetchedStockSales);
          fetchedStockSales.forEach(item => {
            const year = getYear(item.SaleDate);
            if (year) allYearsSet.add(year);
          });
        }

        // Process Option Sales
        if (optionResponse.error) {
           errors.push(`Option Sales: ${optionResponse.error.response?.data?.error || optionResponse.error.message}`);
        } else {
          fetchedOptionSales = optionResponse.data.OptionSaleDetails || []; // Expects { OptionSaleDetails: [] }
          setAllOptionSaleDetails(fetchedOptionSales);
          fetchedOptionSales.forEach(item => {
            const year = getYear(item.close_date);
            if (year) allYearsSet.add(year);
          });
        }
        
        // Process Dividend Tax Summary
        if (dividendResponse.error) {
           errors.push(`Dividend Summary: ${dividendResponse.error.response?.data?.error || dividendResponse.error.message}`);
        } else {
          fetchedDividendData = dividendResponse.data || {};
          setAllDividendTaxData(fetchedDividendData);
          Object.keys(fetchedDividendData).forEach(yearStr => {
            const yearNum = parseInt(yearStr, 10);
            if (!isNaN(yearNum)) allYearsSet.add(yearNum);
          });
        }

        if (errors.length > 0) {
            setError(errors.join('; '));
        }

        const sortedYears = [...allYearsSet].sort((a, b) => b - a);
        const finalAvailableYears = sortedYears.length > 0 ? sortedYears : [];
        setAvailableYears(finalAvailableYears);
        
        const latestYearOverall = finalAvailableYears[0] ? String(finalAvailableYears[0]) : '';
        setSelectedYear(latestYearOverall);

        // Initial filter based on latestYearOverall
        if (latestYearOverall) {
          const numLatestYear = Number(latestYearOverall);
          setStockSaleDetails(fetchedStockSales.filter(item => getYear(item.SaleDate) === numLatestYear));
          setOptionSaleDetails(fetchedOptionSales.filter(item => getYear(item.close_date) === numLatestYear));
          
          const initialDividendYearData = fetchedDividendData[latestYearOverall] || {};
          const transformedInitialDividends = Object.entries(initialDividendYearData).map(([country, details], index) => ({
            id: `${latestYearOverall}-${country}-${index}`, linha: 801 + index, codigo: 'E11', paisFonte: country,
            rendimentoBruto: details.gross_amt || 0, impostoFonte: Math.abs(details.taxed_amt || 0),
            impostoRetido: 0, nifEntidade: '', retencaoFonte: 0,
          }));
          setDividendTaxData(transformedInitialDividends);
        } else {
          setStockSaleDetails([]);
          setOptionSaleDetails([]);
          setDividendTaxData([]);
        }

      } catch (e) { // Catch errors from await fetchCsrfToken or other general errors
        console.error("Failed to fetch tax page data:", e);
        setError(`Failed to load page data: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, csrfToken, fetchCsrfToken]); // Dependencies

  const handleYearChange = (event) => {
    const selectedYearValue = event.target.value;
    setSelectedYear(selectedYearValue);

    if (selectedYearValue) {
      const numSelectedYear = Number(selectedYearValue);
      setStockSaleDetails(allStockSaleDetails.filter(item => getYear(item.SaleDate) === numSelectedYear));
      setOptionSaleDetails(allOptionSaleDetails.filter(item => getYear(item.close_date) === numSelectedYear));
      
      const dividendYearData = allDividendTaxData[String(selectedYearValue)] || {};
      const transformedDividends = Object.entries(dividendYearData).map(([country, details], index) => ({
        id: `${selectedYearValue}-${country}-${index}`, linha: 801 + index, codigo: 'E11', paisFonte: country,
        rendimentoBruto: details.gross_amt || 0, impostoFonte: Math.abs(details.taxed_amt || 0),
        impostoRetido: 0, nifEntidade: '', retencaoFonte: 0,
      }));
      setDividendTaxData(transformedDividends);
    } else {
      setStockSaleDetails([]);
      setOptionSaleDetails([]);
      setDividendTaxData([]);
    }
  };

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
      const netIncome = (row.delta || 0) - (row.commission || 0);
      acc[country].rendimentoLiquido += netIncome;
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

  const dividendTotals = useMemo(() => dividendTaxData.reduce(
    (acc, row) => {
      acc.rendimentoBruto += row.rendimentoBruto || 0;
      acc.impostoFonte += row.impostoFonte || 0;
      acc.impostoRetido += row.impostoRetido || 0;
      acc.retencaoFonte += row.retencaoFonte || 0;
      return acc;
    }, { rendimentoBruto: 0, impostoFonte: 0, impostoRetido: 0, retencaoFonte: 0 }
  ), [dividendTaxData]);

  if (loading) return <CircularProgress />;
  // Display general error if any fetch failed. Specific errors can be shown per section.
  if (error && !stockSaleDetails.length && !optionSaleDetails.length && !dividendTaxData.length) {
      return <Typography color="error" sx={{ textAlign: 'center', mt: 2 }}>Error loading page data: {error}</Typography>;
  }


  return (
    <Box>
      <style dangerouslySetInnerHTML={{ __html: summaryTableStyles }} />
      <Typography variant="subtitle1" gutterBottom>Select Year</Typography>
      <Box sx={{ mb: 3, maxWidth: 150 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="year-select-label">Year</InputLabel>
          <Select
            labelId="year-select-label"
            id="year-select"
            value={selectedYear}
            label="Year"
            onChange={handleYearChange}
            displayEmpty={availableYears.length === 0}
          >
            {availableYears.length === 0 && <MenuItem value="" disabled>No Data</MenuItem>}
            {availableYears.map(year => (
              <MenuItem key={year} value={String(year)}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

      {/* Anexo J - 8 */}
      <Typography variant="h4" component="h1" gutterBottom sx={{ mt: 2, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.25rem' }}>
        Anexo J - 8 Rendimentos Capitais (Categoria E)
      </Typography>
      <Box sx={{ pl: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, mb: 1, color: '#8d98a8', border: '1px solid grey', padding: '2px 8px', display: 'inline-block', fontSize: '0.75rem' }}>A</Typography>
        {/* Dividend Tax Table */}
        <TableContainer component={Paper} sx={{ mb: 1 }}>
          <Table size="small" aria-label="dividend tax details table">
            <TableHead>
              <TableRow>
                <StyledTableCell rowSpan={2}>Nº Linha<br />(801 a ...)</StyledTableCell>
                <StyledTableCell rowSpan={2}>Código Rend.</StyledTableCell>
                <StyledTableCell rowSpan={2}>País da Fonte</StyledTableCell>
                <StyledTableCell rowSpan={2}>Rendimento Bruto</StyledTableCell>
                <StyledTableCell colSpan={3}>Imposto Pago no Estrangeiro</StyledTableCell>
                <StyledTableCell colSpan={2}>Imposto Retido em Portugal</StyledTableCell>
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
                    <StyledTableBodyCell>{row.rendimentoBruto.toFixed(2)} €</StyledTableBodyCell>
                    <StyledTableBodyCell>{row.impostoFonte.toFixed(2)} €</StyledTableBodyCell>
                    <StyledTableBodyCell></StyledTableBodyCell>
                    <StyledTableBodyCell>{row.impostoRetido.toFixed(2)} €</StyledTableBodyCell>
                    <StyledTableBodyCell align="left">{row.nifEntidade}</StyledTableBodyCell>
                    <StyledTableBodyCell>{row.retencaoFonte.toFixed(2)} €</StyledTableBodyCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><StyledTableBodyCell colSpan={9}>No dividend data for selected year.</StyledTableBodyCell></TableRow>
              )}
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

      {/* Anexo J - 9 */}
      <Typography variant="h4" component="h1" gutterBottom sx={{ mt: 2, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.25rem' }}>
        Anexo J - 9 Rendimentos de Incrementos Patrimoniais (Categoria G)
      </Typography>
      <Box sx={{ pl: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, color: '#58839b', fontSize: '1rem' }}>
          9.2 Incrementos Patrimoniais de Opção de Englobamento
        </Typography>
        <Box sx={{ pl: 2 }}>
          {/* 9.2 A Stock Sales */}
          <Box sx={{ mt: 4, display: 'flex', alignItems: 'baseline', mb: 1 }}>
            <Typography variant="h5" component="span" sx={{ border: '0.5px solid grey', padding: '2px 8px', display: 'inline-block', mr: 1, color: '#8d98a8', fontSize: '0.75rem' }}>A</Typography>
            <Typography variant="h6" component="span" sx={{ color: '#8d98a8', fontSize: '0.75rem' }}>Alienação Onerosa de Partes Sociais e Outros Valores Mobiliários</Typography>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 1 }}>
            <Table size="small" aria-label="stock sale details table">
              <TableHead>
                <TableRow>
                  <StyledTableCell rowSpan={2}>Nº Linha<br />(951 a ...)</StyledTableCell><StyledTableCell rowSpan={2}>País Fonte</StyledTableCell><StyledTableCell rowSpan={2}>Código</StyledTableCell>
                  <StyledTableCell colSpan={4}>Realização</StyledTableCell><StyledTableCell colSpan={4}>Aquisição</StyledTableCell>
                  <StyledTableCell rowSpan={2}>Despesas e Encargos</StyledTableCell><StyledTableCell rowSpan={2}>Imposto pago<br />Estrang.</StyledTableCell><StyledTableCell rowSpan={2}>País<br />Contraparte</StyledTableCell>
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
                      <StyledTableBodyCell>{row.SaleAmountEUR?.toFixed(2)} €</StyledTableBodyCell>
                      <StyledTableBodyCell>{getYear(row.BuyDate)}</StyledTableBodyCell><StyledTableBodyCell>{getMonth(row.BuyDate)}</StyledTableBodyCell><StyledTableBodyCell>{getDay(row.BuyDate)}</StyledTableBodyCell>
                      <StyledTableBodyCell>{Math.abs(row.BuyAmountEUR || 0).toFixed(2)} €</StyledTableBodyCell>
                      <StyledTableBodyCell>{row.Commission?.toFixed(2)} €</StyledTableBodyCell>
                      <StyledTableBodyCell></StyledTableBodyCell><StyledTableBodyCell></StyledTableBodyCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><StyledTableBodyCell colSpan={14}>No stock sale data for selected year.</StyledTableBodyCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <div className="summary-container">
            <table className="summary-table">
              <thead><tr><td className="summary-header"></td><td className="summary-header"><span className="header-line">Valor Realização</span></td><td className="summary-header"><span className="header-line">Valor Aquisição</span></td><td className="summary-header"><span className="header-line">Despesas e Encargos</span></td><td className="summary-header"><span className="header-line">Imposto pago no Estrangeiro</span></td></tr></thead>
              <tbody><tr><td className="control-sum">Soma de Controlo</td><td className="summary-value">{stockTotals.realizacao.toFixed(2)} €</td><td className="summary-value">{stockTotals.aquisicao.toFixed(2)} €</td><td className="summary-value">{stockTotals.despesas.toFixed(2)} €</td><td className="summary-value">{stockTotals.imposto.toFixed(2)} €</td></tr></tbody>
            </table>
          </div>

          {/* 9.2 B Option Sales */}
          <Box sx={{ mt: 4, display: 'flex', alignItems: 'baseline', mb: 1 }}>
            <Typography variant="h5" component="span" sx={{ border: '1px solid grey', padding: '2px 8px', display: 'inline-block', mr: 1, color: '#8d98a8', fontSize: '0.75rem' }}>B</Typography>
            <Typography variant="h6" component="span" sx={{ color: '#8d98a8', fontSize: '0.75rem' }}>Outros Incrementos Patrimoniais de Opção de Englobamento</Typography>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 1 }}>
            <Table size="small" aria-label="option sale details table">
              <TableHead>
                <TableRow>
                  <StyledTableCell>Nº Linha<br />(991 a ...)</StyledTableCell><StyledTableCell>Código Rend.</StyledTableCell><StyledTableCell>País Fonte</StyledTableCell>
                  <StyledTableCell>Rendimento Líquido</StyledTableCell><StyledTableCell>Imposto Pago<br />Estrang.</StyledTableCell><StyledTableCell>País<br />Contraparte</StyledTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupedOptionData.length > 0 ? (
                  groupedOptionData.map((group, index) => (
                    <TableRow key={`${group.country_code}-${index}`}>
                      <StyledTableBodyCell>{991 + index}</StyledTableBodyCell>
                      <StyledTableBodyCell align="left">G30</StyledTableBodyCell>
                      <StyledTableBodyCell align="left">{group.country_code}</StyledTableBodyCell>
                      <StyledTableBodyCell>{(group.rendimentoLiquido || 0).toFixed(2)} €</StyledTableBodyCell>
                      <StyledTableBodyCell>{(group.impostoPago || 0).toFixed(2)} €</StyledTableBodyCell>
                      <StyledTableBodyCell align="left"></StyledTableBodyCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><StyledTableBodyCell colSpan={6}>No option sale data for selected year.</StyledTableBodyCell></TableRow>
                )}
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
    </Box>
  );
}