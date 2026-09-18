import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapCamp, MapPoint, MapSos } from '../lib/api';
import { SEVERITY_COLORS, STATUS_COLORS, hexAlpha } from '../lib/charts';
import { ThemeContext } from './ChartView';
import { fmtNumber } from '../lib/format';

interface Props {
  points: MapPoint[];
  camps?: MapCamp[];
  sos?: MapSos[];
  height?: number;
  showLegend?: boolean;
}

const severityColor = (s: string) => SEVERITY_COLORS[s] || '#94a3b8';

/** Basemap follows the active theme so the map matches the dashboard. */
const TILES: Record<'dark' | 'light', { url: string; attribution: string }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
};

/**
 * Interactive Leaflet map: disaster locations coloured by severity and sized by
 * affected population, with optional relief-camp and SOS layers.
 */
export default function MapView({ points, camps = [], sos = [], height = 460, showLegend = true }: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{ disasters?: L.LayerGroup; camps?: L.LayerGroup; sos?: L.LayerGroup }>({});
  const tilesRef = useRef<L.TileLayer | null>(null);
  const theme = useContext(ThemeContext);
  const [tilesOk, setTilesOk] = useState(true);
  const [visible, setVisible] = useState({ disasters: true, camps: true, sos: false });

  const positioned = useMemo(() => points.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number'), [points]);
  const maxAffected = useMemo(() => positioned.reduce((m, p) => Math.max(m, p.affected_population || 0), 1), [positioned]);

  // init map once
  useEffect(() => {
    if (!holderRef.current || mapRef.current) return;
    const map = L.map(holderRef.current, {
      center: [22.5, 79.5],
      zoom: 5,
      zoomControl: true,
      preferCanvas: true,
      worldCopyJump: true,
    });
    mapRef.current = map;
    layersRef.current.disasters = L.layerGroup().addTo(map);
    layersRef.current.camps = L.layerGroup().addTo(map);
    layersRef.current.sos = L.layerGroup();
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // basemap follows the theme
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tilesRef.current) {
      map.removeLayer(tilesRef.current);
      tilesRef.current = null;
    }
    setTilesOk(true);
    const cfg = TILES[theme] || TILES.dark;
    const tiles = L.tileLayer(cfg.url, { maxZoom: 18, attribution: cfg.attribution });
    tiles.on('tileerror', () => setTilesOk(false));
    tiles.addTo(map);
    tiles.bringToBack();
    tilesRef.current = tiles;
  }, [theme]);

  // disaster markers
  useEffect(() => {
    const layer = layersRef.current.disasters;
    if (!layer) return;
    layer.clearLayers();
    for (const p of positioned) {
      const color = severityColor(p.severity);
      const radius = 5 + Math.sqrt((p.affected_population || 0) / maxAffected) * 20;
      const marker = L.circleMarker([p.lat as number, p.lon as number], {
        radius,
        color,
        weight: p.status === 'Active' ? 2.6 : 1.2,
        fillColor: color,
        fillOpacity: p.status === 'Active' ? 0.62 : 0.34,
      });
      marker.bindPopup(`
        <div style="min-width:190px">
          <div style="font-weight:700;margin-bottom:4px">${p.name}</div>
          <div><b>Type:</b> ${p.type}</div>
          <div><b>Severity:</b> ${p.severity}</div>
          <div><b>Status:</b> ${p.status}</div>
          <div><b>Location:</b> ${p.location}</div>
          <div><b>Region:</b> ${p.region}</div>
          <div><b>Date:</b> ${p.occurred_on}</div>
          <div><b>Affected:</b> ${fmtNumber(p.affected_population)} people</div>
          <div><b>Casualties:</b> ${fmtNumber(p.casualties)}</div>
        </div>
      `);
      marker.bindTooltip(`${p.type} · ${p.severity}`, { direction: 'top', opacity: 0.9 });
      layer.addLayer(marker);
    }
  }, [positioned, maxAffected]);

  // camp markers
  useEffect(() => {
    const layer = layersRef.current.camps;
    if (!layer) return;
    layer.clearLayers();
    for (const c of camps) {
      if (typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
      const color = STATUS_COLORS[c.status] || '#38bdf8';
      const marker = L.marker([c.lat, c.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:13px;height:13px;border-radius:3px;background:${hexAlpha(color, 0.85)};border:2px solid ${color};transform:rotate(45deg)"></div>`,
          iconSize: [13, 13],
          iconAnchor: [6, 6],
        }),
      });
      const rate = c.capacity ? Math.round((c.occupancy / c.capacity) * 100) : 0;
      marker.bindPopup(`
        <div style="min-width:180px">
          <div style="font-weight:700;margin-bottom:4px">⛺ ${c.name}</div>
          <div><b>Status:</b> ${c.status}</div>
          <div><b>Location:</b> ${c.location}</div>
          <div><b>Capacity:</b> ${fmtNumber(c.capacity)}</div>
          <div><b>Occupancy:</b> ${fmtNumber(c.occupancy)} (${rate}%)</div>
        </div>
      `);
      layer.addLayer(marker);
    }
  }, [camps]);

  // sos markers
  useEffect(() => {
    const layer = layersRef.current.sos;
    if (!layer) return;
    layer.clearLayers();
    for (const s of sos) {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number') continue;
      const color = s.priority === 'Critical' ? '#fb5a5a' : '#fbbf24';
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: s.priority === 'Critical' ? 5 : 3.5,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.75,
      });
      marker.bindTooltip(`${s.priority} SOS · ${s.status} · ${s.location}`, { direction: 'top' });
      layer.addLayer(marker);
    }
  }, [sos]);

  // layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { disasters, camps: campLayer, sos: sosLayer } = layersRef.current;
    if (disasters) (visible.disasters ? disasters.addTo(map) : map.removeLayer(disasters));
    if (campLayer) (visible.camps ? campLayer.addTo(map) : map.removeLayer(campLayer));
    if (sosLayer) (visible.sos ? sosLayer.addTo(map) : map.removeLayer(sosLayer));
  }, [visible]);

  const counts = useMemo(() => {
    const bySeverity: Record<string, number> = {};
    for (const p of positioned) bySeverity[p.severity] = (bySeverity[p.severity] || 0) + 1;
    return bySeverity;
  }, [positioned]);

  if (!positioned.length) {
    return (
      <div className="empty-state" style={{ height }}>
        <div className="glyph">🗺️</div>
        <b>No data available</b>
        <span>No disaster records with coordinates match the current filters, so there is nothing to plot.</span>
      </div>
    );
  }

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={holderRef} style={{ height, width: '100%' }} />
      {showLegend ? (
        <div className="map-legend">
          <div style={{ fontWeight: 700, marginBottom: 5 }}>{positioned.length} mapped events</div>
          {Object.entries(counts).map(([sev, n]) => (
            <div className="row" key={sev}>
              <span className="dot" style={{ background: severityColor(sev) }} />
              {sev} · {n}
            </div>
          ))}
          <div className="row" style={{ marginTop: 5 }}>
            <span className="dot" style={{ background: '#34d399', borderRadius: 3, transform: 'rotate(45deg)' }} />
            Relief camp · {camps.length}
          </div>
        </div>
      ) : null}
      {!tilesOk ? (
        <div className="map-tiles-note">
          <span className="chip">Offline tiles — markers still plotted</span>
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 10, left: 52, zIndex: 500 }} className="map-toggles">
        <button className="btn ghost" style={{ padding: '5px 9px', fontSize: 11.5 }} onClick={() => setVisible((v) => ({ ...v, disasters: !v.disasters }))}>
          {visible.disasters ? '✓' : '○'} Disasters
        </button>
        <button className="btn ghost" style={{ padding: '5px 9px', fontSize: 11.5 }} onClick={() => setVisible((v) => ({ ...v, camps: !v.camps }))}>
          {visible.camps ? '✓' : '○'} Camps
        </button>
        <button className="btn ghost" style={{ padding: '5px 9px', fontSize: 11.5 }} onClick={() => setVisible((v) => ({ ...v, sos: !v.sos }))}>
          {visible.sos ? '✓' : '○'} SOS
        </button>
      </div>
    </div>
  );
}
