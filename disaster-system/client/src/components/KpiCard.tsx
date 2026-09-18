import type { Kpi } from '../lib/api';
import { fmtKpi } from '../lib/format';

const ICONS: Record<string, string> = {
  disaster: '🌪️', alert: '🚨', people: '👥', sos: '🆘', cross: '⚕️', rupee: '₹', camp: '⛺',
  clock: '⏱️', timer: '⏲️', shield: '🛡️', globe: '🌍', pin: '📍', bell: '🔔', check: '✅',
  bed: '🛏️', gauge: '📊', food: '🍚', heart: '❤️', cash: '💵', box: '📦', building: '🏢',
  phone: '📞', x: '❌', book: '📚', eye: '👁️', star: '⭐', flag: '🚩', truck: '🚚',
};

export default function KpiCard({ kpi }: { kpi: Kpi }) {
  const value = kpi.value === null || kpi.value === undefined || kpi.value === ''
    ? '—'
    : fmtKpi(kpi.value, kpi.format, kpi.unit);
  return (
    <div className="kpi" data-tone={kpi.tone || 'default'}>
      <div className="kpi-label">{kpi.label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-hint">{kpi.hint || kpi.note || '\u00A0'}</div>
      {kpi.icon ? <div className="kpi-icon" aria-hidden>{ICONS[kpi.icon] || '•'}</div> : null}
    </div>
  );
}
