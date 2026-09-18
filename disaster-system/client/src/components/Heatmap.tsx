import { useMemo, useState } from 'react';
import { hexAlpha } from '../lib/charts';
import EmptyState from './EmptyState';

interface Props {
  rows: string[];
  columns: string[];
  cells: { row: string; column: string; value: number }[];
  valueLabel?: string;
}

const RAMP = ['#38bdf8', '#f59e0b', '#ef4444'];

function rampColor(t: number): string {
  // 0 -> teal, 0.5 -> amber, 1 -> red
  const clamp = Math.max(0, Math.min(1, t));
  const idx = clamp < 0.5 ? 0 : 1;
  const local = clamp < 0.5 ? clamp * 2 : (clamp - 0.5) * 2;
  const from = RAMP[idx];
  const to = RAMP[idx + 1];
  const mix = (a: string, b: string, t: number) => {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  };
  return mix(from, to, local);
}

/** Cross-tab visual used for density matrices (region × type, skill × status, …). */
export default function Heatmap({ rows, columns, cells, valueLabel = 'value' }: Props) {
  const [hover, setHover] = useState<{ row: string; column: string; value: number } | null>(null);

  const { map, max } = useMemo(() => {
    const m = new Map<string, number>();
    let mx = 0;
    for (const c of cells) {
      m.set(`${c.row}||${c.column}`, c.value);
      if (c.value > mx) mx = c.value;
    }
    return { map: m, max: mx };
  }, [cells]);

  if (!rows.length || !columns.length || !cells.length) {
    return <EmptyState glyph="🔥" title="No data available" message="This cross-tab has no rows for the current selection." compact />;
  }

  const rowTotals = new Map<string, number>();
  for (const c of cells) rowTotals.set(c.row, (rowTotals.get(c.row) || 0) + c.value);
  const orderedRows = [...rows].sort((a, b) => (rowTotals.get(b) || 0) - (rowTotals.get(a) || 0)).slice(0, 22);

  return (
    <div className="heatmap">
      <table>
        <thead>
          <tr>
            <th />
            {columns.slice(0, 18).map((c) => <th key={c} title={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {orderedRows.map((r) => (
            <tr key={r}>
              <th className="rowhead" title={r}>{r.length > 26 ? `${r.slice(0, 25)}…` : r}</th>
              {columns.slice(0, 18).map((c) => {
                const value = map.get(`${r}||${c}`) ?? 0;
                const t = max ? value / max : 0;
                return (
                  <td
                    key={c}
                    className={value === 0 ? 'zero' : ''}
                    style={value === 0 ? undefined : { background: hexAlpha(rampColor(t), 0.28 + t * 0.62), color: t > 0.55 ? '#08111f' : undefined }}
                    onMouseEnter={() => setHover({ row: r, column: c, value })}
                    onMouseLeave={() => setHover(null)}
                    title={`${r} × ${c}: ${value.toLocaleString('en-IN')} ${valueLabel}`}
                  >
                    {value === 0 ? '·' : value.toLocaleString('en-IN')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="heatmap-scale">
        <span>0</span>
        <div className="bar" />
        <span>{max.toLocaleString('en-IN')} {valueLabel}</span>
        {hover ? (
          <span style={{ marginLeft: 10 }}>
            <b>{hover.row}</b> × <b>{hover.column}</b> → {hover.value.toLocaleString('en-IN')} {valueLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
