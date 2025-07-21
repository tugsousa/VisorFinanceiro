// frontend/src/components/landing/TrustSection.js
import React from 'react';
import { Box, Container, Grid, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';

const TrustPoint = ({ icon, title, text }) => (
  <Grid item xs={12} md={4} sx={{ textAlign: 'center', px: 2 }}>
    <Box sx={{ color: 'primary.main', fontSize: 40, mb: 2 }}>{icon}</Box>
    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{title}</Typography>
    <Typography color="text.secondary">{text}</Typography>
  </Grid>
);

const TrustSection = () => {
  return (
    <Box sx={{ bgcolor: 'grey.100', py: { xs: 4, md: 8 } }}>
      <Container maxWidth="lg">
        <Typography variant="h4" component="h2" align="center" sx={{ fontWeight: 'bold', mb: 2 }}>
          A Sua Privacidade é a Nossa Prioridade
        </Typography>
        <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
          Compreendemos a sensibilidade dos seus dados. No Rumo Claro, levamos a segurança muito a sério.
        </Typography>
        <Grid container spacing={4}>
          <TrustPoint
            icon={<DeleteForeverIcon fontSize="inherit" />}
            title="Controlo Total"
            text="Você está no controlo. Pode eliminar todas as suas transações ou a sua conta inteira a qualquer momento, de forma permanente."
          />
          <TrustPoint
            icon={<DoNotDisturbOnIcon fontSize="inherit" />}
            title="Sem Venda de Dados"
            text="Nunca vendemos ou partilhamos os seus dados pessoais ou financeiros com terceiros para fins de marketing."
          />
          <TrustPoint
            icon={<LockIcon fontSize="inherit" />}
            title="Comunicação Segura"
            text="Toda a comunicação entre o seu navegador e os nossos servidores é encriptada com HTTPS para proteger a sua informação."
          />
        </Grid>
      </Container>
    </Box>
  );
};

export default TrustSection;