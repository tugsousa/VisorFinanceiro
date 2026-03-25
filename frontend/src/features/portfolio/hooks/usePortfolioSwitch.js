import { useCallback, useState } from 'react';
import { usePortfolio } from '../PortfolioContext';
import { useAuth } from '../../auth/AuthContext';
import logger from '../../../lib/utils/logger';

export const usePortfolioSwitch = () => {
    const { switchPortfolio, refreshPortfolios } = usePortfolio();
    const { fetchCsrfToken } = useAuth();
    const [switching, setSwitching] = useState(false);
    const [switchError, setSwitchError] = useState(null);

    const handlePortfolioSwitch = useCallback(async (portfolioId) => {
        if (switching) return; // Prevent multiple simultaneous switches

        setSwitching(true);
        setSwitchError(null);

        try {
            // Ensure we have a fresh CSRF token before switching
            await fetchCsrfToken(true);
            
            // Switch the portfolio
            switchPortfolio(portfolioId);
            
            // Optional: Refresh portfolio data to ensure consistency
            await refreshPortfolios();
            
        } catch (error) {
            const errorMsg = error.message || 'Failed to switch portfolio';
            setSwitchError(errorMsg);
            logger.error('Portfolio switch failed:', error);
            
            // Try to recover by refreshing portfolios
            try {
                await refreshPortfolios();
            } catch (refreshError) {
                logger.error('Failed to recover after portfolio switch error:', refreshError);
            }
        } finally {
            setSwitching(false);
        }
    }, [switchPortfolio, refreshPortfolios, fetchCsrfToken, switching]);

    const clearSwitchError = useCallback(() => {
        setSwitchError(null);
    }, []);

    return {
        handlePortfolioSwitch,
        switching,
        switchError,
        clearSwitchError
    };
};