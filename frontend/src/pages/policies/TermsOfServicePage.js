import React from 'react';
import { Container, Box, Typography, List, ListItem, ListItemText, Link, Divider } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom'; // CORREÇÃO: Adicionada esta linha

const TermsOfServicePage = () => {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Termos de Serviço
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Última atualização: 20 de Julho de 2025
      </Typography>

      <Box sx={{ my: 3 }}>
        <Typography variant="body1" paragraph>
          Bem-vindo ao VisorFinanceiro! Estes Termos de Serviço regem o seu acesso e utilização da nossa plataforma. Por favor, leia-os atentamente antes de usar o nosso serviço.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>1. Aceitação dos Termos</Typography>
        <Typography variant="body1" paragraph>
          Ao criar uma conta ou ao utilizar o nosso Serviço, você concorda em estar vinculado por estes Termos. Se não concordar com alguma parte dos termos, não poderá aceder ao Serviço. Reservamo-nos o direito de modificar estes Termos a qualquer momento, sendo recomendado que os reveja regularmente.
        </Typography>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" component="h2" gutterBottom>2. Descrição do Serviço</Typography>
        <Typography variant="body1" paragraph>
          O VisorFinanceiro é uma ferramenta desenhada para o ajudar a analisar as suas transações financeiras e a organizar a informação para a sua declaração de impostos em Portugal. O serviço permite:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="Carregar ficheiros de transações de corretoras suportadas (ex: Degiro, Interactive Brokers)." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Processar e analisar dados de vendas de ações, opções e dividendos." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Gerar resumos e tabelas que servem como um auxílio visual para o preenchimento de anexos da declaração de IRS (como o Anexo J)." />
          </ListItem>
        </List>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" component="h2" gutterBottom>3. Isenção de Responsabilidade e Limitação de Responsabilidade</Typography>
        <Typography variant="body1" paragraph sx={{ mt: 2 }}>
          AVISO IMPORTANTE: O VisorFinanceiro é uma ferramenta de auxílio e para fins informativos. NÃO constitui aconselhamento financeiro, de investimento ou fiscal.
          A lógica da ferramenta foi extensivamente verificada. No entanto, isto não implica a ausência de erros ou bugs. As informações e cálculos fornecidos pela plataforma:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="São baseados nos dados que você fornece. A precisão dos resultados depende da exatidão e integridade dos ficheiros que carrega." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Utilizam taxas de câmbio de fontes de dados históricas, que podem não corresponder exatamente às taxas oficiais usadas pela Autoridade Tributária." />
          </ListItem>
          <ListItem>
            <ListItemText sx={{ fontWeight: 'medium' }} primary="NÃO substituem a confirmação e validação por si e/ou por um profissional de contabilidade qualificado." />
          </ListItem>
        </List>
        <Typography variant="body1" paragraph>
          A utilização dos dados gerados pelo VisorFinanceiro para o preenchimento da sua declaração de IRS ou para qualquer outra finalidade é da sua inteira e exclusiva responsabilidade. Em nenhuma circunstância o VisorFinanceiro, os seus criadores ou afiliados serão responsáveis por quaisquer perdas, danos ou coimas resultantes do uso da informação fornecida.
        </Typography>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" component="h2" gutterBottom>4. Contas de Utilizador</Typography>
        <Typography variant="body1" paragraph>
          Ao registar-se no VisorFinanceiro, você concorda em:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="Fornecer informações exatas e completas (nome de utilizador e email)." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Manter a confidencialidade da sua senha e assumir total responsabilidade por todas as atividades que ocorram na sua conta." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Não utilizar o serviço para fins ilícitos ou que possam prejudicar a reputação ou o funcionamento da plataforma." />
          </ListItem>
        </List>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" component="h2" gutterBottom>5. Propriedade dos Dados</Typography>
        <Typography variant="body1" paragraph>
          O Serviço e o seu conteúdo original (software, design, texto) são propriedade do VisorFinanceiro. Os dados financeiros que você carrega e os resultados gerados a partir deles são sua propriedade. Você concede-nos apenas uma licença limitada para processar esses dados com o único propósito de lhe fornecer as funcionalidades do Serviço.
        </Typography>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" component="h2" gutterBottom>6. Rescisão</Typography>
        <Typography variant="body1" paragraph>
          Você pode eliminar a sua conta a qualquer momento através da página de <Link component={RouterLink} to="/settings">Configurações</Link>. Esta ação resultará na remoção permanente e irreversível de todos os seus dados pessoais e financeiros da nossa base de dados.
        </Typography>
        <Typography variant="body1" paragraph>
          Reservamo-nos o direito de suspender ou eliminar a sua conta se violar estes Termos.
        </Typography>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" component="h2" gutterBottom>7. Contacto</Typography>
        <Typography variant="body1" paragraph>
          Para qualquer questão sobre estes Termos de Serviço, por favor contacte-nos através do email: <Link href="mailto:geral@visorfinanceiro.pt">geral@visorfinanceiro.pt</Link>.
        </Typography>
      </Box>
    </Container>
  );
};

export default TermsOfServicePage;