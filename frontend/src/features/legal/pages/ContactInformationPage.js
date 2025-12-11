import React, { useState } from 'react';
import { 
  Container, Box, Typography, Link as MuiLink, Stack, Divider, 
  Avatar, Paper, Button, Snackbar, Alert 
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { grey, blue } from '@mui/material/colors';

const ContactInformationPage = () => {
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const contactEmail = "geral@visorfinanceiro.pt";

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(contactEmail);
    setOpenSnackbar(true);
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setOpenSnackbar(false);
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 8 } }}>
        <Stack spacing={4} alignItems="flex-start" textAlign="left">
          
          {/* 1. Header Section */}
          <Box>
            <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Contactos
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 'normal' }}>
              Tens alguma questão ou sugestão? Estou disponível para ajudar.
            </Typography>
          </Box>

          <Divider sx={{ width: '100%' }} />
          
          {/* 
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 3, 
              width: '100%', 
              borderColor: blue[200], 
              bgcolor: blue[50],
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
          >
            <Avatar sx={{ bgcolor: blue[500] }}>
              <HelpOutlineIcon />
            </Avatar>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">
                Tem uma dúvida rápida?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Muitas questões comuns já estão respondidas na nossa secção de Perguntas Frequentes.
              </Typography>
            </Box>
            <Button 
              component={RouterLink} 
              to="/#faq" // Assuming you add an id="faq" to your FaqSection in LandingPage
              variant="contained" 
              disableElevation
              size="small"
            >
              Ver FAQ
            </Button>
          </Paper>
          */}
          {/* 3. Main Contact Method */}
          <Box width="100%">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
              Canais Diretos
            </Typography>
            
            <Paper 
              elevation={0}
              sx={{
                p: 3,
                mt: 2,
                borderRadius: 2,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? grey[900] : grey[100],
                border: `1px solid ${grey[300]}`,
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                gap: 2
              }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                  <EmailOutlinedIcon fontSize="large" />
                </Avatar>
                <Box>
                  <Typography variant="overline" color="text.secondary" fontWeight="bold">
                    Suporte Geral
                  </Typography>
                  <MuiLink 
                    href={`mailto:${contactEmail}?subject=Suporte VisorFinanceiro`} 
                    variant="h5" 
                    underline="hover"
                    sx={{ 
                      display: 'block', 
                      fontWeight: 700,
                      wordBreak: 'break-all',
                      color: 'text.primary'
                    }}
                  >
                    {contactEmail}
                  </MuiLink>
                  <Typography variant="caption" color="text.secondary">
                    Responderei o mais breve possível.
                  </Typography>
                </Box>
              </Stack>

              <Button 
                startIcon={<ContentCopyIcon />} 
                onClick={handleCopyEmail}
                variant="outlined"
                color="inherit"
                size="small"
                sx={{ borderColor: grey[400], color: 'text.secondary' }}
              >
                Copiar
              </Button>
            </Paper>
          </Box>

        </Stack>

        {/* Copy Notification */}
        <Snackbar open={openSnackbar} autoHideDuration={3000} onClose={handleCloseSnackbar}>
          <Alert onClose={handleCloseSnackbar} severity="success" sx={{ width: '100%' }}>
            Email copiado para a área de transferência!
          </Alert>
        </Snackbar>
    </Container>
  );
};

export default ContactInformationPage;