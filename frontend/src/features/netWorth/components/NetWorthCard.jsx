import React from 'react';
import { Paper, Box, Typography, Skeleton, Button, useTheme } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { Link as RouterLink } from 'react-router-dom';
import { useNetWorth } from '../hooks/useNetWorth';
import { formatCurrency } from '../../../lib/utils/formatUtils';

/** Dashboard card with the total net worth, linking to the "Património" page. */
const NetWorthCard = () => {
    const theme = useTheme();
    const { data, isLoading, isError } = useNetWorth();
    if (isError) return null;

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5, mt: 2, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, bgcolor: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <AccountBalanceIcon color="primary" />
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Património total
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {isLoading ? <Skeleton width={120} /> : formatCurrency(data?.total_eur)}
                    </Typography>
                    {!isLoading && (
                        <Typography variant="caption" color="text.secondary">
                            Todas as carteiras {formatCurrency(data?.portfolios_eur)} · Outros ativos {formatCurrency(data?.other_assets_eur)}
                        </Typography>
                    )}
                </Box>
            </Box>
            <Button component={RouterLink} to="/net-worth" size="small" sx={{ textTransform: 'none' }}>
                Ver património
            </Button>
        </Paper>
    );
};

export default NetWorthCard;
