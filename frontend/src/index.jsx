// frontend/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from '@mui/material/styles'; // Import ThemeProvider
import theme from './lib/theme'; // Import your new theme file
import { HelmetProvider } from 'react-helmet-async';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { ptPT } from '@mui/x-date-pickers/locales';
import { pt } from 'date-fns/locale';
import { Chart } from 'chart.js';
import 'chartjs-adapter-date-fns';

// Import the Poppins font weights you want to use
import '@fontsource/poppins/400.css'; // Regular
import '@fontsource/poppins/500.css'; // Medium
import '@fontsource/poppins/600.css'; // Semi-Bold
import '@fontsource/poppins/700.css'; // Bold

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          {/* Date pickers in pt-PT (calendar, month names, "Cancelar"/"OK"), whatever the browser's language. */}
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pt}
            localeText={ptPT.components.MuiLocalizationProvider.defaultProps.localeText}>
            <App />
          </LocalizationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>
);

reportWebVitals();