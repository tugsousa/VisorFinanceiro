// frontend/src/pages/TaxPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  styled, CircularProgress, Alert
} from '@mui/material';
import { useTaxReportData } from '../hooks/useTaxReportData'; // Custom hook
import { UI_TEXT, NO_YEAR_SELECTED } from '../constants';
import { getYear, getMonth, getDay, extractYearsFromData } from '../utils/dateUtils';
import './TaxPage.css'; // Import the external CSS file

// Styled components remain the same
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


export default function TaxPage() {
  const { data: taxApiData, loading, error: apiError } = useTaxReportData();
  const [selectedYear, setSelectedYear] = useState(NO_YEAR_SELECTED);

  const [allStockSaleDetails, setAllStockSaleDetails] = useState([]);
  const [allOptionSaleDetails, setAllOptionSaleDetails] = useState([]);
  const [allDividendTaxData, setAllDividendTaxData] = useState({});

  const [stockSaleDetails, setStockSaleDetails] = useState([]);
  const [optionSaleDetails, setOptionSaleDetails] = useState([]);
  const [dividendTaxReportRows, setDividendTaxReportRows] = useState([]); // Renamed for clarity

  const [availableYears, setAvailableYears] = useState([]);
  
  useEffect(() => {
    if (taxApiData) {
        setAllStockSaleDetails(taxApiData.stockSales || []);
        setAllOptionSaleDetails(taxApiData.optionSales || []);
        setAllDividendTaxData(taxApiData.dividendSummary || {});

        const dateAccessors = { // Used by extractYearsFromData
            stockSales: 'SaleDate',
            optionSales: 'close_date',
            dividendSummary: null, // Special handling in extractYearsFromData
        };
        const years = extractYearsFromData(taxApiData, dateAccessors);
        // extractYearsFromData already returns NO_YEAR_SELECTED as the first element if needed
        // but here we want actual years for the dropdown, then prepend NO_YEAR_SELECTED
        const actualYears = years.filter(y => y !== NO_YEAR_SELECTED);
        setAvailableYears(actualYears);
        setSelectedYear(actualYears.length > 0 ? String(actualYears[0]) : NO_YEAR_SELECTED);
    } else {
        setAllStockSaleDetails([]);
        setAllOptionSaleDetails([]);
        setAllDividendTaxData({});
        setAvailableYears([]);
        setSelectedYear(NO_YEAR_SELECTED);
    }
  }, [taxApiData]);


  const filterDataForYear = useCallback((yearToFilter) => {
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
    if (!loading) { 
        filterDataForYear(selectedYear);
    }
  }, [selectedYear, allStockSaleDetails, allOptionSaleDetails, allDividendTaxData, filterDataForYear, loading]);


  const handleYearChange = (event) => {
    const yearValue = event.target.value;
    setSelectedYear(yearValue);
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

  if (loading) return <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />;
  if (apiError && (selectedYear !== NO_YEAR_SELECTED || availableYears.length === 0)) return <Alert severity="error" sx={{ m: 2 }}>{apiError}</Alert>;

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      {/* <style dangerouslySetInnerHTML={{ __html: summaryTableStyles }} /> REMOVED - CSS is now in TaxPage.css */}
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
            disabled={availableYears.length === 0 && selectedYear === NO_YEAR_SELECTED}
          >
            <MenuItem value={NO_YEAR_SELECTED} disabled={availableYears.length > 0}>
                {availableYears.length === 0 ? "No Data" : "Select Year"}
            </MenuItem>
            {availableYears.map(year => (
              <MenuItem key={year} value={String(year)}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      {apiError && <Alert severity="warning" sx={{ mb: 2 }}>{apiError}</Alert>}
      {selectedYear === NO_YEAR_SELECTED && !loading && availableYears.length > 0 && (
        <Typography sx={{textAlign: 'center', my:2}}>Please select a year to view data.</Typography>
      )}
       {selectedYear === NO_YEAR_SELECTED && !loading && availableYears.length === 0 && !apiError && (
        <Typography sx={{textAlign: 'center', my:2}}>No data available. Please upload transactions.</Typography>
      )}


      {selectedYear && selectedYear !== NO_YEAR_SELECTED && (
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
                  {dividendTaxReportRows.length > 0 ? (
                    dividendTaxReportRows.map((row) => (
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
              <table className="summary-table"> {/* This table uses TaxPage.css */}
                <thead><tr><th className="summary-header"></th><th className="summary-header"><span className="header-line">Rendimento Bruto</span></th><th className="summary-header"><span className="header-line">Imposto Pago no Estrangeiro</span><span className="header-separator">-</span><span className="header-line">No país da fonte</span></th><th className="summary-header"><span className="header-line">Imposto Pago no Estrangeiro</span><span className="header-separator">-</span><span className="header-line">Imposto Retido</span></th><th className="summary-header"><span className="header-line">Imposto Retido em Portugal</span><span className="header-separator">-</span><span className="header-line">Retenção na Fonte</span></th></tr></thead>
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
                <table className="summary-table"> {/* This table uses TaxPage.css */}
                  <thead><tr><th className="summary-header"></th><th className="summary-header"><span className="header-line">Valor Realização</span></th><th className="summary-header"><span className="header-line">Valor Aquisição</span></th><th className="summary-header"><span className="header-line">Despesas e Encargos</span></th><th className="summary-header"><span className="header-line">Imposto pago no Estrangeiro</span></th></tr></thead>
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
                <table className="summary-table"> {/* This table uses TaxPage.css */}
                  <thead><tr><th className="summary-header"></th><th className="summary-header"><span className="header-line">Rendimento Líquido</span></th><th className="summary-header"><span className="header-line">Imposto pago no Estrangeiro</span></th></tr></thead>
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