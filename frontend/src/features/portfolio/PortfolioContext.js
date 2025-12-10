// frontend/src/context/PortfolioContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
// IMPORT ADDED: apiDeletePortfolio
import { apiListPortfolios, apiCreatePortfolio, apiDeletePortfolio } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import logger from '../../lib/utils/logger';

export const PortfolioContext = createContext();

export const PortfolioProvider = ({ children }) => {
    const { user } = useAuth();
    const [portfolios, setPortfolios] = useState([]);
    const [activePortfolio, setActivePortfolio] = useState(null);
    const [loading, setLoading] = useState(false);

    // Function to fetch portfolios from the backend
    const fetchPortfolios = useCallback(async () => {
        if (!user) {
            setPortfolios([]);
            setActivePortfolio(null);
            return;
        }
        setLoading(true);
        try {
            const res = await apiListPortfolios();
            const fetchedPortfolios = res.data || [];
            setPortfolios(fetchedPortfolios);
            
            // Logic to determine which portfolio to set as active
            const savedId = localStorage.getItem('active_portfolio_id');
            const savedPortfolio = fetchedPortfolios.find(p => p.id.toString() === savedId);
            const defaultPortfolio = fetchedPortfolios.find(p => p.is_default);
            
            if (savedPortfolio) {
                setActivePortfolio(savedPortfolio);
            } else if (defaultPortfolio) {
                setActivePortfolio(defaultPortfolio);
                localStorage.setItem('active_portfolio_id', defaultPortfolio.id);
            } else if (fetchedPortfolios.length > 0) {
                setActivePortfolio(fetchedPortfolios[0]);
                localStorage.setItem('active_portfolio_id', fetchedPortfolios[0].id);
            } else {
                setActivePortfolio(null);
            }
            
        } catch (err) {
            logger.error("Failed to fetch portfolios", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const switchPortfolio = (portfolioId) => {
        const target = portfolios.find(p => p.id === portfolioId);
        if (target) {
            setActivePortfolio(target);
            localStorage.setItem('active_portfolio_id', target.id);
            // We reload to ensure clean state for all components
            window.location.reload(); 
        }
    };

    const createPortfolio = async (name, description) => {
        try {
            await apiCreatePortfolio(name, description);
            await fetchPortfolios();
            return true;
        } catch (err) {
            logger.error("Failed to create portfolio", err);
            throw err;
        }
    };

    const deletePortfolio = async (id) => {
        try {
            await apiDeletePortfolio(id);
            
            // If the deleted portfolio was active, switch to default
            if (activePortfolio && activePortfolio.id === id) {
                const defaultPf = portfolios.find(p => p.is_default) || portfolios[0];
                if (defaultPf && defaultPf.id !== id) {
                    setActivePortfolio(defaultPf);
                    localStorage.setItem('active_portfolio_id', defaultPf.id);
                } else {
                    setActivePortfolio(null);
                }
            }
            
            await fetchPortfolios();
            return true;
        } catch (err) {
            logger.error("Failed to delete portfolio", err);
            throw err;
        }
    };

    useEffect(() => {
        fetchPortfolios();
    }, [fetchPortfolios]);

    return (
        <PortfolioContext.Provider value={{ 
            portfolios, 
            activePortfolio, 
            switchPortfolio, 
            createPortfolio,
            deletePortfolio,
            refreshPortfolios: fetchPortfolios,
            loading 
        }}>
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolio = () => useContext(PortfolioContext);