// frontend/src/hooks/useProcessedTransactions.js
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { apiFetchProcessedTransactions } from '../api/apiService';
import { UI_TEXT } from '../constants';

export const useProcessedTransactions = () => {
  const { token } = useContext(AuthContext);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTransactions = async () => {
    if (!token) {
      setTransactions([]);
      setLoading(false);
      setError(UI_TEXT.userNotAuthenticated);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetchProcessedTransactions();
      setTransactions(response.data || []);
    } catch (e) {
      console.error("Failed to fetch processed transactions via hook:", e);
      setError(e.response?.data?.error || e.message || UI_TEXT.errorLoadingData);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchTransactions();
  }, [token]);

  return { transactions, loading, error, refetch: fetchTransactions };
};