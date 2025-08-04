import React from 'react';
import { Container, Box, Typography, List, ListItem, ListItemText, Link as MuiLink, Paper } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

// Um componente de secção reutilizável para manter o estilo consistente
const Section = ({ title, number, children }) => (
  <Box component="section" sx={{ my: 4 }}>
    <Typography variant="h5" component="h2" gutterBottom>
      {number}. {title}
    </Typography>
    {children}
  </Box>
);

const PrivacyPolicyPage = () => {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Política de Privacidade
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom align="center" sx={{ mb: 4 }}>
        Última atualização: 20 de Julho de 2025
      </Typography>

      <Section title="O Nosso Compromisso" number={1}>
        <Typography variant="body1" paragraph>
          O Rumo Claro é uma ferramenta concebida para o ajudar a gerir o seu portefólio de investimentos e a simplificar as suas obrigações fiscais. A sua privacidade e a segurança dos seus dados são a nossa máxima prioridade. Esta página descreve as nossas políticas relativas à recolha, utilização e proteção das suas informações. Ao utilizar o nosso Serviço, concorda com as práticas descritas nesta política.
        </Typography>
      </Section>

      <Section title="Recolha e Utilização de Dados" number={2}>
        <Typography variant="body1" paragraph>
          Para fornecer as funcionalidades do Rumo Claro, recolhemos dois tipos de informação:
        </Typography>
        <List dense sx={{ pl: 2, mb: 2 }}>
          <ListItem>
            <ListItemText
              primary={<strong>Dados da Conta</strong>}
              secondary="Ao criar a sua conta, recolhemos o seu nome de utilizador, e-mail e país. Estes dados são armazenados de forma permanente no seu perfil para gerir o seu acesso."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary={<strong>Dados Financeiros</strong>}
              secondary="Para que a plataforma funcione, é necessário que carregue os seus extratos de transações (ficheiros CSV ou XML). Estes dados, que incluem detalhes como ativos, datas, quantidades e valores, são processados e armazenados de forma segura na sua conta pessoal."
            />
          </ListItem>
        </List>
        <Typography variant="body1" paragraph>
          O armazenamento persistente dos seus dados financeiros é o que nos permite oferecer-lhe funcionalidades avançadas, como um dashboard interativo, análise histórica do seu desempenho e a consulta de todas as suas transações a qualquer momento, sem necessidade de carregar os ficheiros repetidamente.
        </Typography>
      </Section>

      <Section title="Retenção e Controlo dos Seus Dados" number={3}>
        <Typography variant="body1" paragraph>
          Acreditamos que deve ter controlo total sobre a sua informação.
        </Typography>

          <Typography variant="body1">
            A qualquer momento, pode <strong>eliminar todas as suas transações</strong> através da página <MuiLink component={RouterLink} to="/transactions">Dados</MuiLink>. Se desejar <strong>encerrar permanentemente a sua conta</strong>, pode fazê-lo na página de <MuiLink component={RouterLink} to="/settings">Configurações</MuiLink>. Esta ação é irreversível e eliminará imediatamente todos os seus dados (de conta e financeiros) da nossa plataforma.
          </Typography>

      </Section>

      <Section title="Partilha de Dados com Terceiros" number={4}>
        <Typography variant="body1" paragraph>
          <strong>Não vendemos os seus dados pessoais.</strong> Para operar a nossa plataforma, recorremos a prestadores de serviços essenciais que processam dados em nosso nome, sob estritas obrigações de segurança e confidencialidade:
        </Typography>
        <List dense sx={{ pl: 2 }}>
          <ListItem>
            <ListItemText primary={<strong>Alojamento Web (Hetzner)</strong>} secondary="A nossa aplicação e a sua base de dados estão alojadas em servidores seguros na Alemanha." />
          </ListItem>
          <ListItem>
            <ListItemText primary={<strong>Segurança e Desempenho (Cloudflare)</strong>} secondary="O tráfego entre o seu navegador e os nossos servidores é protegido e acelerado pela Cloudflare." />
          </ListItem>
          <ListItem>
            <ListItemText primary={<strong>Envio de E-mails (Amazon SES)</strong>} secondary="Utilizamos este serviço para enviar e-mails essenciais, como a verificação de conta e recuperação de senha." />
          </ListItem>
        </List>
      </Section>

      <Section title="Cookies e Armazenamento Local" number={5}>
        <Typography variant="body1" paragraph>
          O nosso Serviço não utiliza cookies para fins de rastreamento ou publicidade. Usamos as seguintes tecnologias estritamente necessárias:
        </Typography>
        <List dense sx={{ pl: 2 }}>
          <ListItem>
            <ListItemText primary={<strong>Armazenamento Local (localStorage)</strong>} secondary="Para guardar os seus tokens de autenticação e manter a sua sessão segura." />
          </ListItem>
          <ListItem>
            <ListItemText primary={<strong>Cookies Essenciais</strong>} secondary="Utilizamos um cookie para gerir o seu consentimento de cookies e outro para proteger a sua conta contra ataques (CSRF)." />
          </ListItem>
        </List>
      </Section>

      <Section title="Segurança" number={6}>
        <Typography variant="body1" paragraph>
          Levamos a sua confiança a sério e implementamos medidas de segurança robustas para proteger os seus dados, incluindo encriptação de senhas e comunicação segura (HTTPS). No entanto, nenhum método de transmissão pela Internet é 100% infalível. Ao dar-lhe o controlo total para eliminar os seus dados a qualquer momento, capacitamo-lo a gerir o seu próprio risco.
        </Typography>
      </Section>

      <Section title="Alterações a esta Política" number={7}>
        <Typography variant="body1" paragraph>
          Podemos atualizar esta Política de Privacidade periodicamente. Notificá-lo-emos de quaisquer alterações, publicando a nova versão nesta página.
        </Typography>
      </Section>
      
      <Section title="Contacto" number={8}>
        <Typography variant="body1" paragraph>
          Se tiver alguma questão sobre a nossa Política de Privacidade, contacte-nos através do e-mail: <MuiLink href="mailto:geral@rumoclaro.pt">geral@rumoclaro.pt</MuiLink>.
        </Typography>
      </Section>

    </Container>
  );
};

export default PrivacyPolicyPage;