import { getYear } from '../../../lib/utils/dateUtils';

export const filterAndGroupStockSales = (allStockSales, selectedYear) => {
    const numYear = Number(selectedYear);
    const filteredStockSales = (allStockSales || []).filter(item => getYear(item.SaleDate) === numYear);
    
    const groupedSalesMap = filteredStockSales.reduce((acc, sale) => {
      const groupingKey = `${sale.country_code}|${sale.SaleDate}|${sale.BuyDate}`;

      if (!acc[groupingKey]) {
        acc[groupingKey] = {
          ...sale,
          SaleAmountEUR: sale.SaleAmountEUR || 0,
          BuyAmountEUR: Math.abs(sale.BuyAmountEUR || 0),
          Commission: sale.Commission || 0,
        };
      } else {
        acc[groupingKey].SaleAmountEUR += sale.SaleAmountEUR || 0;
        acc[groupingKey].BuyAmountEUR += Math.abs(sale.BuyAmountEUR || 0);
        acc[groupingKey].Commission += sale.Commission || 0;
      }

      return acc;
    }, {});

    return Object.values(groupedSalesMap);
};

export const transformDividendsForTable = (dividendSummary, selectedYear) => {
    const dividendYearData = dividendSummary?.[selectedYear] || {};
    return Object.entries(dividendYearData).map(([country, details], index) => ({
      id: `${selectedYear}-${country}-${index}`,
      linha: 801 + index,
      codigo: 'E11',
      paisFonte: country,
      rendimentoBruto: details.gross_amt || 0,
      impostoFonte: Math.abs(details.taxed_amt || 0),
      impostoRetido: 0,
      nifEntidade: '',
      retencaoFonte: 0,
    }));
};

export const groupOptionsByCountry = (allOptionSales, selectedYear) => {
    const numYear = Number(selectedYear);
    const filteredOptionSales = (allOptionSales || []).filter(item => getYear(item.close_date) === numYear);
    
    const groupedOptions = filteredOptionSales.reduce((acc, row) => {
      const country = row.country_code || 'Unknown';
      if (!acc[country]) {
        acc[country] = { country_code: country, rendimentoLiquido: 0, impostoPago: 0 };
      }
      acc[country].rendimentoLiquido += (row.delta || 0);
      return acc;
    }, {});

    return {
        filteredOptionSales,
        groupedOptionData: Object.values(groupedOptions)
    };
};

export const calculateStockTotals = (stockSaleDetails) => stockSaleDetails.reduce(
    (acc, row) => {
      acc.realizacao += row.SaleAmountEUR || 0;
      acc.aquisicao += Math.abs(row.BuyAmountEUR || 0);
      acc.despesas += row.Commission || 0;
      return acc;
    }, { realizacao: 0, aquisicao: 0, despesas: 0, imposto: 0 }
);

export const calculateOptionTotals = (groupedOptionData) => groupedOptionData.reduce(
    (acc, group) => {
      acc.rendimentoLiquido += group.rendimentoLiquido || 0;
      acc.imposto += group.impostoPago || 0;
      return acc;
    }, { rendimentoLiquido: 0, imposto: 0 }
);

export const calculateDividendTotals = (dividendTaxReportRows) => dividendTaxReportRows.reduce(
    (acc, row) => {
      acc.rendimentoBruto += row.rendimentoBruto || 0;
      acc.impostoFonte += row.impostoFonte || 0;
      acc.impostoRetido += row.impostoRetido || 0;
      acc.retencaoFonte += row.retencaoFonte || 0;
      return acc;
    }, { rendimentoBruto: 0, impostoFonte: 0, impostoRetido: 0, retencaoFonte: 0 }
);