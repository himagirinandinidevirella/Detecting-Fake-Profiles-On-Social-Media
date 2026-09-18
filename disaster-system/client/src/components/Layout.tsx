import { useState, type ReactNode } from 'react';
import { NAV, default as Sidebar } from './Sidebar';
import { useTheme } from '../hooks/useTheme';
import { ThemeContext } from './ChartView';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export default function Layout({ title, subtitle, children, actions }: Props) {
  const [open, setOpen] = useState(false);
  const { theme, appliedTheme, toggle } = useTheme();
  const current = NAV.find((n) => n.to === (window.location.pathname === '/' ? '/' : `/${window.location.pathname.split('/')[1]}`));

  return (
    <ThemeContext.Provider value={appliedTheme}>
      <div className="app">
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        <div className="main">
          <header className="topbar">
            <button className="icon-btn mobile-only" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">☰</button>
            <div>
              <h1>{title}</h1>
              {subtitle ? <div className="sub">{subtitle}</div> : null}
            </div>
            <div className="topbar-spacer" />
            {actions}
            <span className="chip live">Live data</span>
            <button className="icon-btn" onClick={toggle} title="Switch theme">
              {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          </header>
          <div className="page">{children}</div>
          <footer className="footer">
            <span>Natural Disaster Management System · Disaster Intelligence &amp; Analytics</span>
            <span>·</span>
            <span>{current?.label || 'Dashboard'}</span>
            <span>·</span>
            <span>SQLite · charts aggregated at request time · no login required</span>
          </footer>
        </div>
      </div>
    </ThemeContext.Provider>
  );
}
