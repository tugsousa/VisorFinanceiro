// frontend/src/components/admin/StatCard.js
import React from 'react';
import { Box, Typography, CircularProgress, Paper, CardContent, Card, Chip } from '@mui/material';

/**
 * A reusable card for displaying a single key statistic.
 * Handles a loading state.
 * @param {object} props
 * @param {string} props.title - The title or label for the statistic.
 * @param {React.ReactNode} props.value - The value to display. Can be a string, number, or formatted component.
 * @param {boolean} [props.loading=false] - If true, displays a loading spinner instead of the value.
 * @param {string} [props.variant='default'] - Card variant: 'default', 'financial', 'user', 'activity'
 */
const StatCard = ({ title, value, loading = false, variant = 'default' }) => {
    // Define color schemes based on variant
    const getVariantStyles = (variantType) => {
        switch (variantType) {
            case 'financial':
                return {
                    bgColor: '#f8fafc',
                    textColor: '#1f2937',
                    borderColor: '#e5e7eb'
                };
            case 'user':
                return {
                    bgColor: '#f8fafc',
                    textColor: '#1f2937',
                    borderColor: '#e5e7eb'
                };
            case 'activity':
                return {
                    bgColor: '#f8fafc',
                    textColor: '#1f2937',
                    borderColor: '#e5e7eb'
                };
            default:
                return {
                    bgColor: '#f8fafc',
                    textColor: '#1f2937',
                    borderColor: '#e5e7eb'
                };
        }
    };

    const variantStyles = getVariantStyles(variant);

    return (
        <Card
            elevation={0}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: variantStyles.borderColor,
                transition: 'all 0.3s ease',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    borderColor: 'primary.light',
                },
                background: variantStyles.bgColor,
            }}
        >
            <CardContent sx={{ 
                position: 'relative',
                zIndex: 2,
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                p: 3,
                '&:last-child': {
                    pb: 3
                }
            }}>
                {/* Header with title */}
                <Box sx={{ mb: 2 }}>
                    <Typography 
                        variant="subtitle2" 
                        component="h3"
                        sx={{ 
                            fontWeight: 600, 
                            color: variantStyles.textColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            fontSize: '0.75rem'
                        }}
                    >
                        {title}
                    </Typography>
                </Box>

                {/* Value display */}
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'baseline', 
                    justifyContent: 'center',
                    minHeight: 60,
                    mt: 'auto'
                }}>
                    {loading ? (
                        <CircularProgress 
                            size={32} 
                            sx={{ color: variantStyles.textColor }} 
                        />
                    ) : (
                        <Typography 
                            variant="h3" 
                            component="p"
                            sx={{ 
                                fontWeight: 800, 
                                color: variantStyles.textColor,
                                letterSpacing: '-0.02em',
                                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' }
                            }}
                        >
                            {value ?? 'N/A'}
                        </Typography>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};

export default StatCard;
