import { useQueries } from '@tanstack/react-query';
import {
    apiFetchStockSales,
    apiFetchOptionSales,
    apiFetchDividendTaxSummary,
    apiFetchDividendTransactions,
    apiFetchStockHoldings,
    apiFetchOptionHoldings,
    apiFetchCurrentHoldingsValue,
    apiFetchFees
} from 'features/analytics/api/analyticsApi';
import { apiFetchProcessedTransactions } from 'features/portfolio/api/portfolioApi';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { useState, useEffect, useRef } from 'react';

export const useDashboardData = (token) => {
    const { activePortfolio } = usePortfolio();
    const portfolioId = activePortfolio?.id;
    
    // WebSocket state
    const [uploadProgress, setUploadProgress] = useState(null);
    const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 5;
    const reconnectDelay = 1000;

    // WebSocket connection management
    useEffect(() => {
        if (!token || !portfolioId) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setUploadProgress(null);
            setIsWebSocketConnected(false);
            return;
        }

        const connectWebSocket = () => {
            try {
                // Use wss:// for production, ws:// for development
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/api/ws`;
                
                wsRef.current = new WebSocket(wsUrl);
                
                wsRef.current.onopen = () => {
                    console.log('WebSocket connected');
                    setIsWebSocketConnected(true);
                    reconnectAttempts.current = 0;
                };

                wsRef.current.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log('WebSocket message received:', message);
                        
                        if (message.type === 'upload_progress') {
                            setUploadProgress(message.data);
                        } else if (message.type === 'dashboard_update') {
                            // Handle dashboard updates
                            console.log('Dashboard update received:', message.data);
                        }
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };

                wsRef.current.onclose = (event) => {
                    console.log('WebSocket disconnected:', event.code, event.reason);
                    setIsWebSocketConnected(false);
                    
                    // Attempt to reconnect if not manually closed
                    if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
                        reconnectAttempts.current++;
                        console.log(`Reconnecting WebSocket (attempt ${reconnectAttempts.current})...`);
                        setTimeout(connectWebSocket, reconnectDelay * reconnectAttempts.current);
                    }
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    setIsWebSocketConnected(false);
                };

            } catch (error) {
                console.error('Failed to create WebSocket connection:', error);
            }
        };

        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close(1000, 'Component unmounting');
                wsRef.current = null;
            }
        };
    }, [token, portfolioId]);

    // Clear progress when portfolio changes
    useEffect(() => {
        setUploadProgress(null);
    }, [portfolioId]);

    const results = useQueries({
        queries: [
            { 
                queryKey: ['stockSales', token, portfolioId], 
                queryFn: () => apiFetchStockSales(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['optionSales', token, portfolioId], 
                queryFn: () => apiFetchOptionSales(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data?.OptionSaleDetails || [] 
            },
            { 
                queryKey: ['dividendSummary', token, portfolioId], 
                queryFn: () => apiFetchDividendTaxSummary(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || {} 
            },
            { 
                queryKey: ['dividendTransactions', token, portfolioId], 
                queryFn: () => apiFetchDividendTransactions(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['stockHoldingsByYear', token, portfolioId], 
                queryFn: () => apiFetchStockHoldings(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || {} 
            },
            { 
                queryKey: ['optionHoldings', token, portfolioId], 
                queryFn: () => apiFetchOptionHoldings(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['currentHoldingsValue', token, portfolioId], 
                queryFn: () => apiFetchCurrentHoldingsValue(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['fees', token, portfolioId], 
                queryFn: () => apiFetchFees(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
            { 
                queryKey: ['allProcessedTransactions', token, portfolioId], 
                queryFn: () => apiFetchProcessedTransactions(portfolioId), 
                enabled: !!token && !!portfolioId, 
                staleTime: 1000 * 60 * 5, 
                select: (res) => res.data || [] 
            },
        ]
    });

    const isLoading = results.some(q => q.isLoading);
    const isError = results.some(q => q.isError);
    const error = results.find(q => q.error)?.error;

    return {
        stockSalesData: results[0].data,
        optionSalesData: results[1].data,
        dividendSummaryData: results[2].data,
        dividendTransactionsData: results[3].data,
        stockHoldingsByYearData: results[4].data,
        optionHoldingsData: results[5].data,
        currentHoldingsValueData: results[6].data,
        feesData: results[7].data,
        allTransactionsData: results[8].data,
        isHoldingsValueFetching: results[6].isFetching,
        isLoading,
        isError,
        error,
        // WebSocket data
        uploadProgress,
        isWebSocketConnected
    };
};