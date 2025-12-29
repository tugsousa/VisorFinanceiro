// frontend/src/features/landing/components/FeaturesSection.js
import React from 'react';
import { Box, Container, Grid, Typography } from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TableViewIcon from '@mui/icons-material/TableView';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';

const Feature = ({ icon, title, text }) => (
  <Grid item xs={12} md={6} sx={{ mb: 4 }}>
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
      <Box sx={{ color: 'primary.main' }}>{icon}</Box>
      <Box>
        <Typography variant="h6" component="h3" sx={{ fontWeight: '600', mb: 1 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">
          {text}
        </Typography>
      </Box>
    </Box>
  </Grid>
);

const FeaturesSection = () => {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
      <Typography variant="h4" component="h2" align="center" sx={{ fontWeight: 'bold', mb: 6 }}>
        Tudo o que Precisas num Só Lugar
      </Typography>
      <Grid container spacing={4}>
        <Feature 
          icon={<AccountBalanceWalletIcon fontSize="large" />} 
          title="Gestão Multi-Portfólio" 
          text="Gere diferentes estratégias ou contas familiares num só lugar. Separa os teus investimentos de longo prazo das tuas operações de curto prazo com carteiras independentes." 
        />
        <Feature 
          icon={<AttachMoneyIcon fontSize="large" />} 
          title="Análise Avançada de Dividendos" 
          text="Planeia o teu rendimento passivo. Visualiza não só o histórico, mas também a estimativa exata do que vais receber no próximo ano." 
        />
        <Feature 
          icon={<ShowChartIcon fontSize="large" />} 
          title="Dashboard de Desempenho" 
          text="Obtém uma visão clara da tua riqueza. Monitoriza o desempenho global e descobre exatamente quanto cada ativo — ações, opções ou dividendos — contribui para os teus resultados." 
        />
        <Feature 
          icon={<ReceiptLongIcon fontSize="large" />} 
          title="Organiza o teu IRS" 
          text="Geramos automaticamente as tabelas que tens de preencher, com os dados de mais-valias calculados em Euros, para facilitar o preenchimento do Anexo J." 
        />
        <Feature 
          icon={<RequestQuoteIcon fontSize="large" />} 
          title="Controlo de Custos" 
          text="Visualiza exatamente quanto estás a pagar em comissões e taxas de conectividade por ano ou por corretora, e como isso impacta a tua rentabilidade." 
        />
        <Feature 
          icon={<TableViewIcon fontSize="large" />} 
          title="Análise Detalhada de Vendas" 
          text="Consulta cada venda com o cálculo FIFO (First-In, First-Out) aplicado automaticamente para determinar as mais e menos-valias com precisão." 
        />
      </Grid>
    </Container>
  );
};

export default FeaturesSection;