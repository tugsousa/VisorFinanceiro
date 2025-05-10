// frontend/src/hooks/useTaxReportData.js
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  apiFetchStockSales, 
  apiFetchOptionSales, 
  apiFetchDividendTaxSummary 
} from '../api/apiService';
import { UI_TEXT } from '../constants';

export const useTaxReportData = () => {
  const { token } = useContext(AuthContext);
  const [data, setData] = useState({
    stockSales: [],
    optionSales: [],
    dividendSummary: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setData({ stockSales: [], optionSales: [], dividendSummary: {} });
        setLoading(false);
        setError(UI_TEXT.userNotAuthenticated);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [stockRes, optionRes, dividendRes] = await Promise.allSettled([
          apiFetchStockSales(),
          apiFetchOptionSales(),
          apiFetchDividendTaxSummary(),
        ]);

        const errors = [];
        const collectedData = { stockSales: [], optionSales: [], dividendSummary: {} };

        if (stockRes.status === 'fulfilled') {
          collectedData.stockSales = stockRes.value.data || [];
        } else {
          errors.push(`Stock Sales: ${stockRes.reason?.response?.data?.error || stockRes.reason.message}`);
        }
        if (optionRes.status === 'fulfilled') {
          collectedData.optionSales = optionRes.value.data?.OptionSaleDetails || [];
        } else {
          errors.push(`Option Sales: ${optionRes.reason?.response?.data?.error || optionRes.reason.message}`);
        }
        if (dividendRes.status === 'fulfilled') {
          collectedData.dividendSummary = dividendRes.value.data || {};
        } else {
          errors.push(`Dividend Summary: ${dividendRes.reason?.response?.data?.error || dividendRes.reason.message}`);
        }
        
        setData(collectedData);
        if (errors.length > 0) setError(errors.join('; '));

      } catch (e) { // Catch any unexpected error from Promise.all itself or setup
        console.error("Failed to fetch tax report data via hook:", e);
        setError(e.message || UI_TEXT.errorLoadingData);
        setData({ stockSales: [], optionSales: [], dividendSummary: {} });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  return { data, loading, error };
};