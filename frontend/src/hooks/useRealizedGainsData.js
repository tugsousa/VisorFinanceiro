// frontend/src/hooks/useRealizedGainsData.js
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { apiFetchRealizedGainsData } from '../api/apiService';
import { UI_TEXT } from '../constants';

export const useRealizedGainsData = () => {
  const { token } = useContext(AuthContext); // No need for csrfToken here, apiService handles it
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setData(null);
        setLoading(false);
        setError(UI_TEXT.userNotAuthenticated);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetchRealizedGainsData();
        setData(response.data);
      } catch (e) {
        console.error("Failed to fetch realized gains data via hook:", e);
        setError(e.response?.data?.error || e.message || UI_TEXT.errorLoadingData);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  return { data, loading, error, refetch: () => { /* Implement refetch if needed */ } };
};