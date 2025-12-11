import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  styled, CircularProgress, Alert
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  apiFetchStockSales,
  apiFetchOptionSales,
  apiFetchDividendTaxSummary
} from 'features/analytics/api/analyticsApi';
import { useAuth } from '../auth/AuthContext';
import { usePortfolio } from '../portfolio/PortfolioContext';
import { UI_TEXT, NO_YEAR_SELECTED, ALL_YEARS_OPTION } from '../../constants';
import { getYear, getMonth, getDay, extractYearsFromData } from '../../lib/utils/dateUtils';
import { 
    filterAndGroupStockSales, 
    transformDividendsForTable, 
    groupOptionsByCountry, 
    calculateStockTotals, 
    calculateOptionTotals, 
    calculateDividendTotals 
} from './logic/taxTransformers';
import './TaxPage.css';

// Styled Components
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

// Fetcher
const fetchTaxReportData = async (portfolioId) => {
  if (!portfolioId) return { stockSales: [], optionSales: [], dividendSummary: {} };
  
  const [stockRes, optionRes, dividendRes] = await Promise.all([
    apiFetchStockSales(portfolioId),
    apiFetchOptionSales(portfolioId),
    apiFetchDividendTaxSummary(portfolioId),
  ]);
  return {
    stockSales: stockRes.data || [],
    optionSales: optionRes.data?.OptionSaleDetails || [],
    dividendSummary: dividendRes.data || {},
  };
};

export default function TaxPage() {
  const { token } = useAuth();
  const { activePortfolio } = usePortfolio();
  const portfolioId = activePortfolio?.id;

  const { data: taxApiData, isLoading: queryLoading, isError: isQueryError, error: queryError } = useQuery({
    queryKey: ['taxReportData', token, portfolioId],
    queryFn: () => fetchTaxReportData(portfolioId),
    enabled: !!token && !!portfolioId,
    staleTime: 1000 * 60 * 10,
  });

  const apiError = isQueryError ? (queryError?.message || UI_TEXT.errorLoadingData) : null;
  const [selectedYear, setSelectedYear] = useState(NO_YEAR_SELECTED);

  const availableYears = useMemo(() => {
    if (!taxApiData) return [];
    const dateAccessors = { stockSales: 'SaleDate', optionSales: 'close_date', DividendTaxResult: null };
    const dataForYearExtraction = { stockSales: taxApiData.stockSales, optionSales: taxApiData.optionSales, DividendTaxResult: taxApiData.dividendSummary };
    
    const yearsFromUtil = extractYearsFromData(dataForYearExtraction, dateAccessors);
    return yearsFromUtil
      .filter(y => y && y !== NO_YEAR_SELECTED && y !== ALL_YEARS_OPTION)
      .map(String)
      .sort((a, b) => b.localeCompare(a));
  }, [taxApiData]);

  useEffect(() => {
    if (availableYears.length > 0) {
      const currentSystemYear = new Date().getFullYear();
      const targetDefaultYearStr = String(currentSystemYear - 1);
      setSelectedYear(availableYears.includes(targetDefaultYearStr) ? targetDefaultYearStr : availableYears[0]);
    } else if (!queryLoading) {
      setSelectedYear(NO_YEAR_SELECTED);
    }
  }, [availableYears, queryLoading]);

  const { stockSaleDetails, optionSaleDetails, dividendTaxReportRows, groupedOptionData } = useMemo(() => {
    if (selectedYear === NO_YEAR_SELECTED || !taxApiData) {
      return { stockSaleDetails: [], optionSaleDetails: [], dividendTaxReportRows: [], groupedOptionData: [] };
    }

    const groupedStockSales = filterAndGroupStockSales(taxApiData.stockSales, selectedYear);
    const transformedDividends = transformDividendsForTable(taxApiData.dividendSummary, selectedYear);
    const { filteredOptionSales, groupedOptionData } = groupOptionsByCountry(taxApiData.optionSales, selectedYear);

    return {
      stockSaleDetails: groupedStockSales,
      optionSaleDetails: filteredOptionSales,
      dividendTaxReportRows: transformedDividends,
      groupedOptionData: groupedOptionData,
    };
  }, [selectedYear, taxApiData]);

  const stockTotals = useMemo(() => calculateStockTotals(stockSaleDetails), [stockSaleDetails]);
  const optionTotals = useMemo(() => calculateOptionTotals(groupedOptionData), [groupedOptionData]);
  const dividendTotals = useMemo(() => calculateDividendTotals(dividendTaxReportRows), [dividendTaxReportRows]);

  const loading = queryLoading || (token && !taxApiData && !apiError);

  if (!portfolioId) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6">Selecione ou crie um portfólio para ver o relatório fiscal.</Typography></Box>;
  if (loading) return <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />;
  if (apiError && availableYears.length === 0) return <Alert severity="error" sx={{ m: 2 }}>{apiError}</Alert>;
  if (availableYears.length === 0 && !loading) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h4" gutterBottom>Preencher Declaração IRS</Typography><Typography variant="body1">Sem dados disponíveis. Por favor, carregue primeiro um ficheiro de transações.</Typography></Box>;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ mb: { xs: 2, sm: 0 } }}>Preencher Declaração IRS ({activePortfolio?.name})</Typography>
        <FormControl sx={{ minWidth: 150, width: { xs: '100%', sm: 'auto' } }} size="small">
          <InputLabel id="year-select-taxpage-label">Ano</InputLabel>
          <Select labelId="year-select-taxpage-label" value={selectedYear} label="Year" onChange={(e) => setSelectedYear(e.target.value)}>
            <MenuItem value={NO_YEAR_SELECTED} disabled>Selecione o Ano</MenuItem>
            {availableYears.map(year => (<MenuItem key={year} value={String(year)}>{year}</MenuItem>))}
          </Select>
        </FormControl>
      </Box>
      
      {selectedYear === NO_YEAR_SELECTED ? (
        <Typography sx={{textAlign: 'center', my:2}}>Por favor, selecione um ano para visualizar os dados.</Typography>
      ) : (
        <>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 2, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.1rem' }}>
            Anexo J - Quadro 8: Rendimentos de Capitais (Categoria E) - Obtidos no Estrangeiro
          </Typography>
          <Box sx={{ pl: { xs: 0, sm: 2 } }}>
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
                    <StyledNestedTableCell>País Agente Pagador</StyledNestedTableCell>
                    <StyledNestedTableCell>Imposto retido</StyledNestedTableCell>
                    <StyledNestedTableCell>NIF Ent. Retentora</StyledNestedTableCell>
                    <StyledNestedTableCell>Retenção Fonte</StyledNestedTableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dividendTaxReportRows.length > 0 ? (
                    dividendTaxReportRows.map((row) => (
                      <TableRow hover key={row.id}>
                        <StyledTableBodyCell>{row.linha}</StyledTableBodyCell>
                        <StyledTableBodyCell align="left">{row.codigo}</StyledTableBodyCell>
                        <StyledTableBodyCell align="left">{row.paisFonte}</StyledTableBodyCell>
                        <StyledTableBodyCell>{row.rendimentoBruto.toFixed(2)}</StyledTableBodyCell>
                        <StyledTableBodyCell>{row.impostoFonte.toFixed(2)}</StyledTableBodyCell>
                        <StyledTableBodyCell></StyledTableBodyCell>
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
                    <thead>
                        <tr>
                            <th className="summary-header"></th>
                            <th className="summary-header"><span className="header-line">Rendimento Bruto</span></th>
                            <th className="summary-header"><span className="header-line">Imposto Pago no Estrangeiro</span></th>
                            <th className="summary-header"><span className="header-line">Imposto Retido</span></th>
                            <th className="summary-header"><span className="header-line">Retenção na Fonte</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="control-sum">Soma de Controlo</td>
                            <td className="summary-value">{dividendTotals.rendimentoBruto.toFixed(2)} €</td>
                            <td className="summary-value">{dividendTotals.impostoFonte.toFixed(2)} €</td>
                            <td className="summary-value">{dividendTotals.impostoRetido.toFixed(2)} €</td>
                            <td className="summary-value">{dividendTotals.retencaoFonte.toFixed(2)} €</td>
                        </tr>
                    </tbody>
                </table>
            </div>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 3, color: '#0183cb', borderBottom: '1px solid #0183cb', pb: 1, fontSize: '1.1rem' }}>
            Anexo J - Quadro 9: Rendimentos de Incrementos Patrimoniais (Categoria G)
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
                      <StyledTableCell rowSpan={2}>Nº Linha</StyledTableCell>
                      <StyledTableCell rowSpan={2}>País Fonte</StyledTableCell>
                      <StyledTableCell rowSpan={2}>Código</StyledTableCell>
                      <StyledTableCell colSpan={4}>Realização (€)</StyledTableCell>
                      <StyledTableCell colSpan={4}>Aquisição (€)</StyledTableCell>
                      <StyledTableCell rowSpan={2}>Despesas (€)</StyledTableCell>
                    </TableRow>
                    <TableRow>
                      <StyledNestedTableCell>Ano</StyledNestedTableCell>
                      <StyledNestedTableCell>Mês</StyledNestedTableCell>
                      <StyledNestedTableCell>Dia</StyledNestedTableCell>
                      <StyledNestedTableCell>Valor</StyledNestedTableCell>
                      <StyledNestedTableCell>Ano</StyledNestedTableCell>
                      <StyledNestedTableCell>Mês</StyledNestedTableCell>
                      <StyledNestedTableCell>Dia</StyledNestedTableCell>
                      <StyledNestedTableCell>Valor</StyledNestedTableCell>
                    </TableRow>
                   </TableHead>
                   <TableBody>
                    {stockSaleDetails.length > 0 ? (
                      stockSaleDetails.map((row, index) => (
                        <TableRow hover key={`${row.ISIN}-${row.SaleDate}-${index}`}>
                            <StyledTableBodyCell>{951 + index}</StyledTableBodyCell>
                            <StyledTableBodyCell>{row.country_code || ''}</StyledTableBodyCell>
                            <StyledTableBodyCell>G01</StyledTableBodyCell>
                            <StyledTableBodyCell>{getYear(row.SaleDate)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{getMonth(row.SaleDate)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{getDay(row.SaleDate)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{row.SaleAmountEUR?.toFixed(2)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{getYear(row.BuyDate)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{getMonth(row.BuyDate)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{getDay(row.BuyDate)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{Math.abs(row.BuyAmountEUR || 0).toFixed(2)}</StyledTableBodyCell>
                            <StyledTableBodyCell>{row.Commission?.toFixed(2)}</StyledTableBodyCell>
                        </TableRow>
                      ))
                    ) : ( <TableRow><StyledTableBodyCell colSpan={12}>{UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                   </TableBody>
                 </Table>
              </TableContainer>
              <div className="summary-container">
                <table className="summary-table">
                  <thead>
                    <tr>
                        <th className="summary-header"></th>
                        <th className="summary-header"><span className="header-line">Valor Realização</span></th>
                        <th className="summary-header"><span className="header-line">Valor Aquisição</span></th>
                        <th className="summary-header"><span className="header-line">Despesas e Encargos</span></th>
                        <th className="summary-header"><span className="header-line">Imposto pago no Estrangeiro</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                        <td className="control-sum">Soma de Controlo</td>
                        <td className="summary-value">{stockTotals.realizacao.toFixed(2)} €</td>
                        <td className="summary-value">{stockTotals.aquisicao.toFixed(2)} €</td>
                        <td className="summary-value">{stockTotals.despesas.toFixed(2)} €</td>
                        <td className="summary-value">{stockTotals.imposto.toFixed(2)} €</td>
                    </tr>
                  </tbody>
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
                            <StyledTableCell>Nº Linha<br />(991 a ...)</StyledTableCell>
                            <StyledTableCell>Código Rend.</StyledTableCell>
                            <StyledTableCell>País Fonte</StyledTableCell>
                            <StyledTableCell>Rendimento Líquido (€)</StyledTableCell>
                            <StyledTableCell>Imposto Pago<br />Estrang. (€)</StyledTableCell>
                            <StyledTableCell>País<br />Contraparte</StyledTableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                    {groupedOptionData.length > 0 ? (
                      groupedOptionData.map((group, index) => (
                        <TableRow hover key={`${group.country_code}-${index}`}>
                           <StyledTableBodyCell>{991 + index}</StyledTableBodyCell>
                           <StyledTableBodyCell align="left">G30</StyledTableBodyCell>
                           <StyledTableBodyCell align="left">{group.country_code}</StyledTableBodyCell>
                           <StyledTableBodyCell>{(group.rendimentoLiquido || 0).toFixed(2)}</StyledTableBodyCell>
                           <StyledTableBodyCell>{(group.impostoPago || 0).toFixed(2)}</StyledTableBodyCell>
                           <StyledTableBodyCell align="left">{/* País Contraparte */}</StyledTableBodyCell>
                        </TableRow>
                      ))
                    ) : ( <TableRow><StyledTableBodyCell colSpan={6}>{UI_TEXT.noDataAvailable}</StyledTableBodyCell></TableRow> )}
                    </TableBody>
                  </Table>
              </TableContainer>
              <div className="summary-container">
                <table className="summary-table">
                    <thead>
                        <tr><th className="summary-header">Rendimento Líquido (Opções)</th></tr>
                    </thead>
                    <tbody>
                        <tr><td className="summary-value">{optionTotals.rendimentoLiquido.toFixed(2)} €</td></tr>
                    </tbody>
                </table>
              </div>
            </Box>
        </>
      )}
    </Box>
  );
}