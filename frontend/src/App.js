// src/App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import Dashboard from './pages/Dashboard';
import DetailedView from './pages/DetailedView';
import Layout from './layouts/Layout';
import Holdings from './pages/HoldingsPage';
import Dividends from './pages/DividendsPage';
import Cash from './pages/CashPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/detailed" element={<DetailedView />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/dividends" element={<Dividends />} />
          <Route path="/cash" element={<Cash />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;