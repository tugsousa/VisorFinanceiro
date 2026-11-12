// frontend/src/features/tax/components/TaxLineDetailDrawer.jsx
import React, { useEffect } from 'react';
import {
  Alert, Box, Drawer, IconButton, Table, TableBody, TableCell, TableContainer,
  TableFooter, TableHead, TableRow, Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { formatBroker } from 'features/analytics/logic/cashFlowCalculations';
import { formatQuantity } from 'lib/utils/formatUtils';
import { getOptionNetIncome, sumDividendTransactions } from '../logic/taxTransformers';

const formatEUR = (value) => (value || 0).toFixed(2);
const formatAmount = (value, currency) => `${(value || 0).toFixed(2)} ${currency || ''}`.trim();
const formatRate = (value) => (value ? value.toFixed(4) : '');
const sumBy = (rows, getValue) => rows.reduce((total, row) => total + (getValue(row) || 0), 0);
// Both sides of a match can come from different brokers, as matching is not done per broker.
const formatBrokers = (source, otherSource, otherLabel) => (
  source === otherSource
    ? formatBroker(source)
    : `${formatBroker(source)} (${otherLabel}: ${formatBroker(otherSource)})`
);

const eurColumn = (label, getValue) => ({
  label,
  align: 'right',
  render: (row) => formatEUR(getValue(row)),
  total: (rows) => formatEUR(sumBy(rows, getValue)),
});

const LINE_DETAILS = {
  dividend: {
    getRows: (line) => line.transactions,
    getSummary: (line) => [
      { label: 'Rendimento Bruto', value: `${formatEUR(line.rendimentoBruto)} €` },
      { label: 'Imposto no país da fonte', value: `${formatEUR(line.impostoFonte)} €` },
    ],
    columns: [
      { label: 'Corretora', render: (tx) => formatBroker(tx.source) },
      { label: 'Data', render: (tx) => tx.date },
      { label: 'Produto', render: (tx) => tx.product_name },
      { label: 'ISIN', render: (tx) => tx.isin },
      { label: 'Tipo', render: (tx) => (tx.transaction_subtype === 'TAX' ? 'Retenção' : 'Bruto') },
      { label: 'Valor original', align: 'right', render: (tx) => formatAmount(tx.amount, tx.currency) },
      { label: 'Câmbio', align: 'right', render: (tx) => formatRate(tx.exchange_rate) },
      { label: 'Valor (€)', align: 'right', render: (tx) => formatEUR(tx.amount_eur) },
    ],
  },
  stock: {
    getRows: (line) => line.sales,
    getSummary: (line) => [
      { label: 'Data de venda', value: line.SaleDate },
      { label: 'Data de compra', value: line.BuyDate },
      { label: 'Realização', value: `${formatEUR(line.SaleAmountEUR)} €` },
      { label: 'Aquisição', value: `${formatEUR(line.BuyAmountEUR)} €` },
      { label: 'Despesas e Encargos', value: `${formatEUR(line.Commission)} €` },
    ],
    columns: [
      { label: 'Corretora', render: (sale) => formatBrokers(sale.SaleSource, sale.BuySource, 'compra') },
      { label: 'Produto', render: (sale) => sale.ProductName },
      { label: 'ISIN', render: (sale) => sale.ISIN },
      { label: 'Qtd', align: 'right', render: (sale) => formatQuantity(sale.Quantity), total: (rows) => formatQuantity(sumBy(rows, (sale) => sale.Quantity)) },
      { label: 'Preço venda', align: 'right', render: (sale) => sale.SalePrice },
      { label: 'Valor venda', align: 'right', render: (sale) => formatAmount(sale.SaleAmount, sale.SaleCurrency) },
      { label: 'Câmbio venda', align: 'right', render: (sale) => formatRate(sale.SaleExchangeRate) },
      eurColumn('Realização (€)', (sale) => sale.SaleAmountEUR),
      { label: 'Preço compra', align: 'right', render: (sale) => sale.BuyPrice },
      { label: 'Valor compra', align: 'right', render: (sale) => formatAmount(Math.abs(sale.BuyAmount || 0), sale.BuyCurrency) },
      { label: 'Câmbio compra', align: 'right', render: (sale) => formatRate(sale.BuyExchangeRate) },
      eurColumn('Aquisição (€)', (sale) => Math.abs(sale.BuyAmountEUR || 0)),
      eurColumn('Comissão venda (€)', (sale) => sale.SaleCommission),
      eurColumn('Comissão compra (€)', (sale) => sale.BuyCommission),
    ],
  },
  option: {
    getRows: (line) => line.sales,
    getSummary: (line) => [
      { label: 'Rendimento Líquido', value: `${formatEUR(line.rendimentoLiquido)} €` },
    ],
    columns: [
      { label: 'Corretora', render: (sale) => formatBrokers(sale.close_source, sale.open_source, 'abertura') },
      { label: 'Produto', render: (sale) => sale.product_name },
      { label: 'Abertura', render: (sale) => sale.open_date },
      { label: 'Fecho', render: (sale) => sale.close_date },
      { label: 'Qtd', align: 'right', render: (sale) => sale.quantity, total: (rows) => sumBy(rows, (sale) => sale.quantity) },
      { label: 'Valor abertura', align: 'right', render: (sale) => formatAmount(sale.open_amount, sale.open_currency) },
      { label: 'Valor fecho', align: 'right', render: (sale) => formatAmount(sale.close_amount, sale.close_currency) },
      eurColumn('Abertura (€)', (sale) => sale.open_amount_eur),
      eurColumn('Fecho (€)', (sale) => sale.close_amount_eur),
      eurColumn('Delta (€)', (sale) => sale.delta),
      eurColumn('Comissão (€)', (sale) => Math.abs(sale.commission || 0)),
      eurColumn('Líquido (€)', getOptionNetIncome),
    ],
  },
};

const cellSx = { fontSize: '0.75rem', whiteSpace: 'nowrap', px: 1, py: 0.5 };

// The dividend lines come from the backend summary, so here the transactions are an independent check.
const DividendReconciliation = ({ line }) => {
  const { gross, tax } = sumDividendTransactions(line.transactions);
  const grossDifference = gross - line.rendimentoBruto;
  const taxDifference = tax - line.impostoFonte;
  const matches = Math.abs(grossDifference) < 0.005 && Math.abs(taxDifference) < 0.005;

  return (
    <Alert severity={matches ? 'success' : 'warning'} sx={{ mt: 2 }}>
      {matches
        ? `A soma das transações coincide com a linha: bruto ${formatEUR(gross)} €, retenção ${formatEUR(tax)} €.`
        : `A soma das transações não coincide com a linha: diferença de ${formatEUR(grossDifference)} € no bruto e ${formatEUR(taxDifference)} € na retenção.`}
    </Alert>
  );
};

export default function TaxLineDetailDrawer({ selectedLine, onClose }) {
  useEffect(() => {
    if (!selectedLine) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLine, onClose]);

  if (!selectedLine) return null;

  const { type, lineNumber, code, country, line } = selectedLine;
  const { columns, getRows, getSummary } = LINE_DETAILS[type];
  const rows = getRows(line);
  const hasTotals = columns.some((column) => column.total);

  return (
    <Drawer
      variant="persistent"
      anchor="right"
      open
      PaperProps={{
        component: 'aside',
        'aria-label': `Transações da linha ${lineNumber}`,
        sx: { width: { xs: '100%', md: 'min(960px, 70vw)' }, p: 2 },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h6" component="h2" sx={{ color: '#0183cb' }}>
            Linha {lineNumber} · {code}
          </Typography>
          <Typography variant="body2" color="text.secondary">{country}</Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Fechar detalhe da linha" size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, my: 2 }}>
        {getSummary(line).map(({ label, value }) => (
          <Box key={label}>
            <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      <Typography variant="subtitle2" gutterBottom>
        Transações usadas no cálculo ({rows.length})
      </Typography>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label={`transações da linha ${lineNumber}`}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.label} align={column.align} sx={{ ...cellSx, fontWeight: 600 }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow hover key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={column.label} align={column.align} sx={cellSx}>
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {hasTotals && (
            <TableFooter>
              <TableRow>
                {columns.map((column, columnIndex) => (
                  <TableCell
                    key={column.label}
                    align={column.align}
                    sx={{ ...cellSx, fontWeight: 600, color: 'text.primary' }}
                  >
                    {column.total ? column.total(rows) : (columnIndex === 0 ? 'Total' : '')}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>

      {type === 'dividend' && <DividendReconciliation line={line} />}
    </Drawer>
  );
}
