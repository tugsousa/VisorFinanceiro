import React from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { usePortfolio } from '../PortfolioContext';
import logger from '../../../lib/utils/logger';

class PortfolioErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
        
        logger.error('Portfolio component error:', {
            error: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack
        });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleResetPortfolio = () => {
        const { refreshPortfolios } = this.props;
        this.setState({ hasError: false, error: null, errorInfo: null });
        
        // Try to refresh portfolios to recover state
        if (refreshPortfolios) {
            refreshPortfolios();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 3 }}>
                    <Alert severity="error" sx={{ mb: 2 }}>
                        <Alert.Title>Portfolio Error</Alert.Title>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            An error occurred while loading your portfolio data. This might be due to:
                        </Typography>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>Network connectivity issues</li>
                            <li>Authentication problems</li>
                            <li>Corrupted portfolio data</li>
                        </ul>
                    </Alert>
                    
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <Button 
                            variant="contained" 
                            onClick={this.handleRetry}
                            color="primary"
                        >
                            Try Again
                        </Button>
                        <Button 
                            variant="outlined" 
                            onClick={this.handleResetPortfolio}
                            color="secondary"
                        >
                            Reset Portfolio
                        </Button>
                    </Box>
                    
                    {process.env.NODE_ENV === 'development' && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            <Typography variant="caption">
                                <strong>Error Details (Development):</strong><br/>
                                {this.state.error && this.state.error.toString()}
                                <br/><br/>
                                <strong>Component Stack:</strong><br/>
                                {this.state.errorInfo.componentStack}
                            </Typography>
                        </Alert>
                    )}
                </Box>
            );
        }

        return this.props.children;
    }
}

// Higher-order component wrapper
export const withPortfolioErrorBoundary = (Component) => {
    return function PortfolioErrorBoundaryWrapper(props) {
        const { refreshPortfolios } = usePortfolio();
        
        return (
            <PortfolioErrorBoundary refreshPortfolios={refreshPortfolios}>
                <Component {...props} />
            </PortfolioErrorBoundary>
        );
    };
};

export default PortfolioErrorBoundary;