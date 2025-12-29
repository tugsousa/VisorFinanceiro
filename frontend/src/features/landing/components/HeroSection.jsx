import React from 'react';
import { Button, Container, Grid, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const HeroSection = () => {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 10 } }}>
      <Grid container spacing={4} alignItems="center" justifyContent="center">
        {/* Content */}
        <Grid item xs={12} sx={{ textAlign: 'center' }}>
          <Typography 
            component="h1" 
            variant="h3" 
            sx={{ fontWeight: 'bold', mb: 2 }} 
          >
            Simplifica os teus impostos e gere o teu portfólio com clareza.
          </Typography>
          
          <Typography 
            variant="h6" 
            color="text.secondary" 
            sx={{ mb: 4, maxWidth: '800px', mx: 'auto' }} // Centra e limita a largura do texto
          >
            O VisorFinanceiro transforma as transações do teu broker em dashboards claros, métricas essenciais e análises detalhadas da tua carteira. Acompanha desempenho, dividendos, ações, opções e custos — tudo num só lugar.
          </Typography>
          
          <Button 
            component={RouterLink} 
            to="/signup" 
            variant="contained" 
            size="large" 
            endIcon={<ArrowForwardIcon />} 
            sx={{ textTransform: 'none', fontSize: '1.1rem', py: 1.5, px: 4 }} 
          >
            Criar Conta Gratuita
          </Button>
        </Grid>
      </Grid>
    </Container>
  );
};

export default HeroSection;