import React from 'react';
import { Container, Box, Typography, Link as MuiLink, Stack, Divider, Avatar } from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import { grey } from '@mui/material/colors';

const ContactInformationPage = () => {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
        {/* Changed alignItems and textAlign for left alignment */}
        <Stack spacing={3} alignItems="flex-start" textAlign="left">

          {/* 2. Main Title and Subtitle */}
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
              Entre em Contacto
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
              Estamos aqui para ajudar. Se tiver alguma questão, sugestão ou precisar de suporte, não hesite em contactar-nos.
            </Typography>
          </Box>

          {/* Changed Divider width to span the container */}
          <Divider sx={{ width: '100%' }} />

          {/* 3. The main Contact Card */}
          <Box 
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) => theme.palette.action.hover,
              width: '100%',
              maxWidth: '450px',
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ bgcolor: grey[300], color: grey[800] }}>
                <EmailOutlinedIcon />
              </Avatar>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Email
                </Typography>
                <MuiLink 
                  href="mailto:geral@rumoclaro.pt" 
                  variant="h6" 
                  underline="hover"
                  sx={{ 
                    display: 'block', 
                    fontWeight: 500,
                    wordBreak: 'break-all'
                  }}
                >
                  geral@rumoclaro.pt
                </MuiLink>
              </Box>
            </Stack>
          </Box>
          
          {/* 4. Additional Information (Response Time) */}
          <Typography variant="caption" color="text.secondary">
            Faremos o nosso melhor para responder a todas as questões num prazo de 48 horas úteis.
          </Typography>

        </Stack>
    </Container>
  );
};

export default ContactInformationPage;