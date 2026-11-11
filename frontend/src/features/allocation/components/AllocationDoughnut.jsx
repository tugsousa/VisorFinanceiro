import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Box, Typography } from '@mui/material';
import { formatPct, groupColor } from '../logic/allocationLogic';

ChartJS.register(ArcElement, Tooltip, Legend);

/** A double doughnut: the outer ring is the target, the inner ring today's allocation. */
export default function AllocationDoughnut({ status }) {
    const drift = status.drift || [];
    const colors = drift.map(d => groupColor(status.groups, d.group_id));

    const data = {
        labels: drift.map(d => d.name),
        datasets: [
            {
                label: 'Alvo',
                data: drift.map(d => d.target_pct),
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 2,
                weight: 1,
            },
            {
                label: 'Atual',
                data: drift.map(d => Math.max(0, d.current_pct)),
                backgroundColor: colors.map(c => `${c}b3`),
                borderColor: '#fff',
                borderWidth: 2,
                weight: 1,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '35%',
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatPct(ctx.parsed)}`,
                },
            },
        },
    };

    return (
        <Box>
            <Box sx={{ height: 280 }}>
                <Doughnut data={data} options={options} />
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 1 }}>
                Anel exterior: alvo · anel interior: atual
            </Typography>
        </Box>
    );
}
