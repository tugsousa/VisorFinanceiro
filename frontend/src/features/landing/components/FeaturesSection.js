// frontend/src/components/landing/FeaturesSection.js
import React from 'react';
import { Box, Container, Grid, Typography } from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TableViewIcon from '@mui/icons-material/TableView';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

const Feature = ({ icon, title, text, imageName }) => (
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
          icon={<ShowChartIcon fontSize="large" />}
          title="Dashboard de Desempenho"
          text="Vê o teu lucro/prejuízo total, analisa a contribuição das ações, opções e dividendos, e percebe a alocação do teu portfólio."
          //imageName="feature-dashboard.png" // TODO: Crie esta imagem
        />
        <Feature
          icon={<ReceiptLongIcon fontSize="large" />}
          title="Organiza o teu IRS"
          text="Geramos automaticamente as tabelas que tens de preencher, com os dados de mais-valias, para facilitar o preenchimento da tua declaração."
          //imageName="feature-taxpage.png" // TODO: Crie esta imagem
        />
        <Feature
          icon={<TableViewIcon fontSize="large" />}
          title="Análise Detalhada de Vendas"
          text="Consulta cada venda com o cálculo FIFO (First-In, First-Out) aplicado automaticamente para determinar as mais e menos-valias."
          //imageName="feature-sales.png" // TODO: Crie esta imagem
        />
        <Feature
          icon={<AttachMoneyIcon fontSize="large" />}
          title="Gestão de Dividendos"
          text="Acompanha todos os dividendos recebidos, organizados por ano e país, com a distinção entre o valor bruto e o imposto retido na fonte."
          //imageName="feature-dividends.png" // TODO: Crie esta imagem
        />
      </Grid>
    </Container>
  );
};

export default FeaturesSection;