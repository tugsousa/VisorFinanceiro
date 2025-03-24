// src/App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import Dashboard from './pages/Dashboard';
import YearlyView from './pages/YearlyView';
import DetailedView from './pages/DetailedView';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/yearly" element={<YearlyView />} />
          <Route path="/detailed" element={<DetailedView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;