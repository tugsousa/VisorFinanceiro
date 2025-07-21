// frontend/src/components/landing/HowItWorksSection.js
import React from 'react';
import { Box, Container, Grid, Typography, Paper } from '@mui/material';

const Step = ({ number, title, text, imageName }) => (
  <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
    <Typography variant="h4" component="div" color="primary.main" sx={{ fontWeight: 'bold', mb: 2 }}>
      {number}
    </Typography>
    <Typography variant="h6" component="h3" sx={{ fontWeight: '600', mb: 2 }}>
      {title}
    </Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>
      {text}
    </Typography>
    <Box
      sx={{
        height: 200,
        bgcolor: 'grey.200',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid',
        borderColor: 'grey.300'
      }}
    >
      <Typography color="text.secondary">
        {/* TODO: Substitua este texto por uma imagem. 
            Exemplo: <img src={`/images/${imageName}`} alt={title} style={{ width: '100%', borderRadius: '8px' }} /> */}
        {`Imagem para: ${title}`}
      </Typography>
    </Box>
  </Grid>
);

const HowItWorksSection = () => {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
      <Typography variant="h4" component="h2" align="center" sx={{ fontWeight: 'bold', mb: 6 }}>
        Começa em Menos de 1 Minuto
      </Typography>
      <Grid container spacing={5}>
        <Step
          number="1"
          title="Carrega o teu ficheiro"
          text="Exporta o extrato do teu broker (por exemplo, DEGIRO ou Interactive Brokers) e carrega-o na nossa plataforma segura."
          imageName="screenshot-upload-page.png" // TODO: Crie e adicione esta imagem
        />
        <Step
          number="2"
          title="Análise Automática"
          text="O RumoClaro processa instantaneamente as tuas transações, aplicando as taxas de câmbio históricas corretas."
          imageName="icon-processing.png" // TODO: Crie e adicione esta imagem/ícone
        />
        <Step
          number="3"
          title="Visualiza e Decide"
          text="Explora os dashboards interativos para perceberes o teu desempenho e preparares os dados para o teu IRS."
          imageName="screenshot-realizedgains-page.png" // TODO: Crie e adicione esta imagem
        />
      </Grid>
    </Container>
  );
};

export default HowItWorksSection;