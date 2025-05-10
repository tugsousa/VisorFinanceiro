// frontend/src/hooks/useDividendTransactions.js
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { apiFetchDividendTransactions } from '../api/apiService';
import { UI_TEXT } from '../constants';

export const useDividendTransactions = () => {
  const { token } = useContext(AuthContext);
  const [dividendTransactions, setDividendTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setDividendTransactions([]);
        setLoading(false);
        setError(UI_TEXT.userNotAuthenticated);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetchDividendTransactions();
        setDividendTransactions(response.data || []);
      } catch (e) {
        console.error("Failed to fetch dividend transactions via hook:", e);
        setError(e.response?.data?.error || e.message || UI_TEXT.errorLoadingData);
        setDividendTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  return { dividendTransactions, loading, error };
};