import { NavLink } from 'react-router-dom';

export interface NavEntry {
  to: string;
  label: string;
  icon: string;
  group: string;
}

export const NAV: NavEntry[] = [
  { to: '/', label: 'Dashboard', icon: '📊', group: 'Overview' },
  { to: '/disasters', label: 'Disaster Management', icon: '🌪️', group: 'Overview' },
  { to: '/alerts', label: 'Disaster Alerts', icon: '🚨', group: 'Overview' },
  { to: '/map', label: 'Disaster Map', icon: '🗺️', group: 'Overview' },
  { to: '/sos', label: 'SOS Analytics', icon: '🆘', group: 'Response' },
  { to: '/camps', label: 'Relief Camp Analytics', icon: '⛺', group: 'Response' },
  { to: '/volunteers', label: 'Volunteer Analytics', icon: '🤝', group: 'Response' },
  { to: '/donations', label: 'Donation Analytics', icon: '💠', group: 'Response' },
  { to: '/helplines', label: 'Emergency Helplines', icon: '📞', group: 'Preparedness' },
  { to: '/safety', label: 'Safety Tips', icon: '🛡️', group: 'Preparedness' },
  { to: '/datasets', label: 'Dataset Management', icon: '🗂️', group: 'Data Studio' },
  { to: '/analysis', label: 'Dataset Analysis', icon: '🔬', group: 'Data Studio' },
  { to: '/comparison', label: 'Dataset Comparison', icon: '⚖️', group: 'Data Studio' },
];

export default function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark" aria-hidden>🛰️</div>
        <div className="brand-text">
          <b>Disaster Intelligence</b>
          <span>Natural Disaster System</span>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <div className="nav-section">{g}</div>
          {NAV.filter((n) => n.group === g).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={onNavigate}
            >
              <span className="ico" aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 14 }}>
        <div className="hint" style={{ padding: '0 10px' }}>
          Open access · no login, no registration. Every chart is computed live from the
          SQLite database or an uploaded dataset.
        </div>
      </div>
    </aside>
  );
}
