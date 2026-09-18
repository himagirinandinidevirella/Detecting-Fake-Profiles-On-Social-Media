import { Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import DisasterManagement from './pages/DisasterManagement';
import Alerts from './pages/Alerts';
import DisasterMap from './pages/DisasterMap';
import Sos from './pages/Sos';
import Camps from './pages/Camps';
import Volunteers from './pages/Volunteers';
import Donations from './pages/Donations';
import Helplines from './pages/Helplines';
import SafetyTips from './pages/SafetyTips';
import DatasetManagement from './pages/DatasetManagement';
import DatasetAnalysis from './pages/DatasetAnalysis';
import DatasetComparison from './pages/DatasetComparison';

/**
 * Open access: no login, no registration — the app opens straight on the dashboard.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/disasters" element={<DisasterManagement />} />
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/map" element={<DisasterMap />} />
      <Route path="/sos" element={<Sos />} />
      <Route path="/camps" element={<Camps />} />
      <Route path="/volunteers" element={<Volunteers />} />
      <Route path="/donations" element={<Donations />} />
      <Route path="/helplines" element={<Helplines />} />
      <Route path="/safety" element={<SafetyTips />} />
      <Route path="/datasets" element={<DatasetManagement />} />
      <Route path="/analysis" element={<DatasetAnalysis />} />
      <Route path="/comparison" element={<DatasetComparison />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
