import React from 'react';
import { Container, Box, Typography, List, ListItem, ListItemText, Link } from '@mui/material';

const PrivacyPolicyPage = () => {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Política de Privacidade
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Última atualização: 14 de Julho de 2025
      </Typography>

      <Box sx={{ my: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>1. Introdução</Typography>
        <Typography variant="body1" paragraph>
          Bem-vindo ao Rumo Claro. A sua privacidade é de extrema importância para nós. Esta Política de Privacidade explica como recolhemos, usamos, partilhamos e protegemos a sua informação pessoal quando utiliza o nosso website e serviços.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>2. Que Dados Recolhemos</Typography>
        <Typography variant="body1" paragraph>
          Recolhemos vários tipos de informação para fornecer e melhorar o nosso serviço para si:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Dados Fornecidos pelo Utilizador"
              secondary="Quando se regista, recolhemos o seu nome de utilizador e endereço de e-mail."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Dados Carregados pelo Utilizador"
              secondary="Recolhemos os dados financeiros contidos nos ficheiros CSV que carrega, como nomes de produtos, ISINs, quantidades, preços, datas e outros detalhes de transações."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Dados Recolhidos Automaticamente"
              secondary="Para fins de segurança e para gerir a sua sessão, recolhemos automaticamente o seu endereço de IP e informações do seu navegador (User-Agent) quando faz login."
            />
          </ListItem>
        </List>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>3. Como Usamos os Seus Dados</Typography>
        <Typography variant="body1" paragraph>
          Utilizamos a informação que recolhemos para os seguintes fins:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="Para fornecer e manter o nosso serviço, incluindo a autenticação e gestão da sua conta." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Para processar os seus ficheiros de transações e gerar os seus relatórios de portefólio, mais-valias e resumos fiscais." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Para comunicar consigo, enviando e-mails transacionais essenciais, como verificação de e-mail e redefinição de senha." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Para garantir a segurança da sua conta e do nosso serviço." />
          </ListItem>
        </List>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>4. Partilha de Dados com Terceiros</Typography>
        <Typography variant="body1" paragraph>
          Não vendemos os seus dados pessoais. No entanto, partilhamos informação com os seguintes prestadores de serviços para operar a nossa plataforma:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="Fornecedor de Hosting (Ex: Hetzner, DigitalOcean): Onde o nosso servidor e base de dados estão alojados." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Cloudflare, Inc.: Para fornecer segurança (WAF, CDN) e gestão de DNS." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Mailgun Technologies, Inc.: Para enviar os e-mails transacionais necessários para a gestão da sua conta." />
          </ListItem>
        </List>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>5. Segurança dos Dados</Typography>
        <Typography variant="body1" paragraph>
          A segurança dos seus dados é uma prioridade. Usamos encriptação de senhas (bcrypt), comunicação segura via SSL/TLS (fornecida pela Cloudflare), e proteção contra ataques CSRF para proteger a sua informação.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>6. Retenção de Dados</Typography>
        <Typography variant="body1" paragraph>
          Manteremos os seus dados pessoais apenas pelo tempo necessário para os fins estabelecidos nesta política. Se eliminar a sua conta, todos os seus dados pessoais e financeiros associados serão permanentemente removidos da nossa base de dados.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>7. Os Seus Direitos (GDPR)</Typography>
        <Typography variant="body1" paragraph>
          Tem o direito de aceder, corrigir e eliminar os seus dados. Pode eliminar a sua conta e todos os dados associados a qualquer momento através da página de <Link href="/settings">Configurações</Link> da sua conta.
        </Typography>
        
        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>8. Cookies e Armazenamento Local</Typography>
        <Typography variant="body1" paragraph>
          Não utilizamos cookies de rastreamento. Utilizamos o armazenamento local (localStorage) do seu navegador para guardar o seu token de autenticação, o que é estritamente necessário para manter a sua sessão segura e permitir que navegue no site como um utilizador autenticado.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>9. Alterações a esta Política</Typography>
        <Typography variant="body1" paragraph>
          Podemos atualizar a nossa Política de Privacidade de tempos em tempos. Iremos notificá-lo de quaisquer alterações, publicando a nova Política de Privacidade nesta página.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>10. Contacte-nos</Typography>
        <Typography variant="body1" paragraph>
          Se tiver alguma questão sobre esta Política de Privacidade, por favor contacte-nos através de: <Link href="mailto:seu-email-de-suporte@rumoclaro.pt">seu-email-de-suporte@rumoclaro.pt</Link>.
        </Typography>
      </Box>
    </Container>
  );
};

export default PrivacyPolicyPage;