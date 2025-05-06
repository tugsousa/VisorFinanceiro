// src/App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import DetailedView from './pages/DetailedView';
import Layout from './layouts/Layout';
import Holdings from './pages/HoldingsPage';
import Dividends from './pages/DividendsPage';
import Tax from './pages/TaxPage';
import OptionPage from './pages/OptionPage';
import StockPage from './pages/StockPage'; // Import the Stock page
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage'; // Import the Stock page
import { AuthProvider } from './context/AuthContext';


function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/detailed" element={<DetailedView />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/dividends" element={<Dividends />} />
          <Route path="/tax" element={<Tax />} />
          <Route path="/options" element={<OptionPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/stocks" element={<StockPage />} /> {/* Add route for StockPage */}
        </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;
