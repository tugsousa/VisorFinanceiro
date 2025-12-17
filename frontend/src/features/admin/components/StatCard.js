// frontend/src/components/admin/StatCard.js
import React from 'react';
import { Box, Typography, CircularProgress, Paper } from '@mui/material';

/**
 * A reusable card for displaying a single key statistic.
 * Handles a loading state.
 * @param {object} props
 * @param {string} props.title - The title or label for the statistic.
 * @param {React.ReactNode} props.value - The value to display. Can be a string, number, or formatted component.
 * @param {boolean} [props.loading=false] - If true, displays a loading spinner instead of the value.
 */
const StatCard = ({ title, value, loading = false }) => (
    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', height: '100%' }}>
        <Typography variant="h6" color="text.secondary" sx={{ fontSize: '1rem' }}>
            {title}
        </Typography>
        <Typography variant="h4" component="p" sx={{ fontWeight: 'bold', mt: 1, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? <CircularProgress size={28} /> : (value ?? 'N/A')}
        </Typography>
    </Paper>
);

export default StatCard;