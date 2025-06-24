import React from 'react';
import { Box, Button, Container, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const LandingPage = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 128px)', // Adjust based on your Layout's AppBar height
        textAlign: 'center',
        p: 3,
      }}
    >
      <Container maxWidth="md">
        <Typography 
          variant="h2" 
          component="h1" 
          gutterBottom 
          sx={{ 
            fontWeight: 'bold', 
            color: 'primary.main',
            mb: 2,
          }}
        >
          Track Your Investments, Simplify Your Taxes.
        </Typography>
        <Typography 
          variant="h6" 
          component="p" 
          color="text.secondary" 
          sx={{ mb: 4, maxWidth: '700px', margin: 'auto' }}
        >
          Taxfolio helps you consolidate your transaction history, understand your portfolio's performance, and prepare for tax season with ease.
        </Typography>
        <Button
          component={RouterLink}
          to="/signup"
          variant="contained"
          color="primary"
          size="large"
          endIcon={<ArrowForwardIcon />}
          sx={{ textTransform: 'none', fontSize: '1.1rem', py: 1.5, px: 4 }}
        >
          Get Started for Free
        </Button>
      </Container>
    </Box>
  );
};

export default LandingPage;