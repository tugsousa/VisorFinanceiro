import React, { useState } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, CircularProgress, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import MetricCard from '../../analytics/components/MetricCard';
import { useAllocation } from '../hooks/useAllocation';
import GroupsEditor from '../components/GroupsEditor';
import AssignmentsEditor from '../components/AssignmentsEditor';
import DriftTable from '../components/DriftTable';
import AllocationDoughnut from '../components/AllocationDoughnut';
import DepositCalculator from '../components/DepositCalculator';
import { formatCurrency } from '../../../lib/utils/formatUtils';

/**
 * The "Alocação-alvo" tab of the Portfólio page: the groups and their targets, how far the portfolio
 * is from them, and how to split the next deposit.
 */
export default function AllocationTab({ portfolioId }) {
    const { data: status, isLoading, isError } = useAllocation(portfolioId);
    const [groupsOpen, setGroupsOpen] = useState(false);

    if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (isError || !status) return <Alert severity="error">Erro ao carregar a alocação-alvo.</Alert>;

    if (!status.configured) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Alert severity="info">
                    Define a alocação que queres para a carteira: cria grupos (por exemplo 80% ações e 20% obrigações),
                    guarda-os e depois escolhe o grupo de cada ativo. Os grupos abaixo são uma sugestão a partir das
                    posições atuais.
                </Alert>
                <GroupsEditor portfolioId={portfolioId} status={status} />
            </Box>
        );
    }

    const outside = (status.drift || []).filter(d => d.outside_tolerance);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                    <MetricCard
                        title="Valor considerado"
                        value={status.total_eur}
                        colorOverride="text.primary"
                        tooltipText="Soma dos ativos com grupo, mais a liquidez se um grupo a incluir. É a base das percentagens."
                    />
                </Grid>
                <Grid item xs={6} md={3}>
                    <MetricCard
                        title="Grupos fora da tolerância"
                        value={outside.length}
                        unit={outside.length === 1 ? 'grupo' : 'grupos'}
                        colorOverride={outside.length > 0 ? 'error.main' : 'success.main'}
                        tooltipText={`Grupos a mais de ${status.tolerance_pp.toLocaleString('pt-PT')} pontos percentuais do alvo.`}
                    />
                </Grid>
                <Grid item xs={6} md={3}>
                    <MetricCard
                        title="Liquidez"
                        value={status.cash_eur}
                        colorOverride="text.primary"
                        tooltipText={status.cash_included ? 'Incluída no grupo que marcaste.' : 'Não entra nas percentagens: nenhum grupo a inclui.'}
                    />
                </Grid>
                <Grid item xs={6} md={3}>
                    <MetricCard
                        title="Ativos sem grupo"
                        value={status.unassigned.length}
                        unit={status.unassigned.length === 1 ? 'ativo' : 'ativos'}
                        colorOverride={status.unassigned.length > 0 ? 'warning.main' : 'text.primary'}
                        tooltipText="Ativos sem grupo não entram nas percentagens."
                    />
                </Grid>
            </Grid>

            {status.unassigned.length > 0 && (
                <Alert severity="warning">
                    {status.unassigned.length === 1 ? '1 ativo não tem grupo' : `${status.unassigned.length} ativos não têm grupo`}
                    {' '}({formatCurrency(status.unassigned_value_eur)}) e não {status.unassigned.length === 1 ? 'entra' : 'entram'} nas
                    percentagens. Escolhe o grupo em «Ativos de cada grupo».
                </Alert>
            )}
            {status.holdings_without_price > 0 && (
                <Alert severity="info">
                    {status.holdings_without_price === 1 ? '1 ativo não tem' : `${status.holdings_without_price} ativos não têm`} preço
                    de mercado e {status.holdings_without_price === 1 ? 'conta' : 'contam'} pelo custo.
                </Alert>
            )}

            <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: 1, borderColor: 'divider', borderRadius: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>Alvo vs. atual</Typography>
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} lg={8}><DriftTable status={status} /></Grid>
                    <Grid item xs={12} lg={4}><AllocationDoughnut status={status} /></Grid>
                </Grid>
            </Paper>

            <DepositCalculator portfolioId={portfolioId} status={status} />

            <AssignmentsEditor portfolioId={portfolioId} status={status} />

            <Accordion
                expanded={groupsOpen}
                onChange={(_, open) => setGroupsOpen(open)}
                elevation={0}
                sx={{ border: 1, borderColor: 'divider', borderRadius: '12px !important', '&:before': { display: 'none' } }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight="bold">Editar grupos, alvos e tolerância</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                    <GroupsEditor portfolioId={portfolioId} status={status} />
                </AccordionDetails>
            </Accordion>
        </Box>
    );
}
