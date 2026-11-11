// frontend/src/features/analytics/components/MetricCard.jsx
import React from 'react';
import { Box, Typography, Paper, Skeleton, Tooltip, IconButton, useTheme } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { formatCurrency } from '../../../lib/utils/formatUtils';

/**
 * Compact metric card shared by the analytics pages.
 * Money values are green when positive and red when negative, unless colorOverride is given.
 */
const MetricCard = ({ title, value, unit, isPercentage = false, isLoading, tooltipText, colorOverride, subValue }) => {
    const theme = useTheme();

    let displayValue;
    if (isLoading) {
        displayValue = <Skeleton width="60%" />;
    } else if (value === null || value === undefined || isNaN(value)) {
        displayValue = "N/A";
    } else {
        displayValue = isPercentage
            ? `${value.toFixed(2)}%`
            : formatCurrency(value);
        if (!isPercentage && unit) {
             displayValue = `${value.toFixed(0)} ${unit}`;
        }
    }

    let valueColor = 'text.primary';
    if (colorOverride) {
        valueColor = colorOverride;
    } else if (!isPercentage) {
        valueColor = value >= 0 ? 'success.main' : 'error.main';
    }

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                height: '100%',
                maxHeight: 70,
                minHeight: 30,
                position: 'relative'
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        fontSize: '0.65rem',
                        lineHeight: 1
                    }}
                >
                    {title}
                </Typography>

                {tooltipText && (
                    <Tooltip title={<Typography variant="body2">{tooltipText}</Typography>} placement="top" arrow>
                        <IconButton size="small" sx={{ p: 0, ml: 1, mt: -0.5, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}>
                            <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Typography
                variant="h6"
                sx={{
                    fontWeight: 700,
                    color: valueColor,
                    fontSize: { xs: '1.1rem', md: '1.25rem' },
                    lineHeight: 1.2,
                    mt: 0.5,
                    letterSpacing: '-0.5px'
                }}
            >
                {displayValue}
            </Typography>

            {subValue && (
                <Box sx={{ mt: 0.5 }}>
                    {subValue}
                </Box>
            )}
        </Paper>
    );
};

export default MetricCard;
