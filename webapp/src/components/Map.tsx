import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { statusColor, STATUS_HEX, PROTO_LABELS, PROTO_ORDER } from '../lib/colors';
import type { PulseRow } from '../api';

interface Props {
  pulse: PulseRow[];
  onRegionClick?: (region: string) => void;
}

type RegionData = Record<string, {
  totalOk: number;
  totalAll: number;
  rate: number;
  protocols: Record<string, { rate: number; avg_ms: number | null }>;
}>;

function buildRegionData(pulse: PulseRow[]): RegionData {
  const rd: RegionData = {};
  for (const row of pulse) {
    const r = (row.region || '?').toLowerCase();
    if (!rd[r]) rd[r] = { totalOk: 0, totalAll: 0, rate: 0, protocols: {} };
    rd[r].totalOk += row.ok;
    rd[r].totalAll += row.total;
    const rate = row.total > 0 ? row.ok / row.total : 0;
    rd[r].protocols[row.protocol] = { rate, avg_ms: row.avg_ms };
  }
  for (const r of Object.values(rd)) {
    r.rate = r.totalAll > 0 ? r.totalOk / r.totalAll : 0;
  }
  return rd;
}

const RUSSIA_CENTER: [number, number] = [90, 62];
const DEFAULT_FILL = 'rgba(20, 22, 38, 0.5)';
const DEFAULT_LINE = 'rgba(50, 55, 80, 0.35)';

let _geojsonCache: any = null;

export function BlockMap({ pulse, onRegionClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  const regionDataRef = useRef<RegionData>({});

  regionDataRef.current = buildRegionData(pulse);

  const colorize = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('regions')) return;
    const rd = regionDataRef.current;
    const src = map.getSource('regions') as maplibregl.GeoJSONSource;
    const data = _geojsonCache;
    if (!data) return;

    for (const f of data.features) {
      const name = f.properties.name;
      const d = rd[name.toLowerCase()];
      if (d && d.totalAll > 0) {
        const st = statusColor(d.rate);
        f.properties._fill = STATUS_HEX[st] + 'bb';
        f.properties._stroke = STATUS_HEX[st];
        f.properties._width = 2;
      } else {
        f.properties._fill = DEFAULT_FILL;
        f.properties._stroke = DEFAULT_LINE;
        f.properties._width = 0.4;
      }
    }
    src.setData(data);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#060610' } }],
      },
      center: RUSSIA_CENTER,
      zoom: 2.2,
      minZoom: 2,
      maxZoom: 8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', async () => {
      if (!_geojsonCache) {
        const resp = await fetch('/russia-regions.geojson');
        _geojsonCache = await resp.json();
        for (const f of _geojsonCache.features) {
          f.properties._fill = DEFAULT_FILL;
          f.properties._stroke = DEFAULT_LINE;
          f.properties._width = 0.4;
        }
      }

      map.addSource('regions', { type: 'geojson', data: _geojsonCache });

      map.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: { 'fill-color': ['get', '_fill'], 'fill-opacity': 1 },
      });
      map.addLayer({
        id: 'regions-line',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': ['get', '_stroke'],
          'line-width': ['get', '_width'],
        },
      });
      map.addLayer({
        id: 'regions-hover',
        type: 'line',
        source: 'regions',
        paint: { 'line-color': '#3B82F6', 'line-width': 2, 'line-opacity': 0 },
      });
      map.addLayer({
        id: 'regions-label',
        type: 'symbol',
        source: 'regions',
        minzoom: 4,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 7, 13],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-max-width': 8,
        },
        paint: {
          'text-color': 'rgba(180, 185, 210, 0.7)',
          'text-halo-color': '#060610',
          'text-halo-width': 1.5,
        },
      });

      setReady(true);
    });

    let hoveredName: string | null = null;
    map.on('mousemove', 'regions-fill', (e) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const name = e.features[0].properties?.name || '';
      if (name !== hoveredName) {
        hoveredName = name;
        map.setPaintProperty('regions-hover', 'line-opacity', [
          'case', ['==', ['get', 'name'], name], 1, 0,
        ]);
      }
    });
    map.on('mouseleave', 'regions-fill', () => {
      map.getCanvas().style.cursor = '';
      hoveredName = null;
      map.setPaintProperty('regions-hover', 'line-opacity', 0);
    });

    map.on('click', 'regions-fill', (e) => {
      if (!e.features?.length) return;
      const name = e.features[0].properties?.name || '';
      const rd = regionDataRef.current;
      if (popupRef.current) popupRef.current.remove();

      const data = rd[name.toLowerCase()];
      const hasData = data && data.totalAll > 0;

      const rows = PROTO_ORDER.map(p => {
        const d = data?.protocols[p];
        if (!d) return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
          <span style="width:6px;height:6px;border-radius:50%;background:#3d3f56"></span>
          <span style="flex:1;font-size:12px;color:#6e7191">${PROTO_LABELS[p] || p}</span>
          <span style="font-family:monospace;font-size:11px;color:#3d3f56">\u2014</span></div>`;
        const pct = Math.round(d.rate * 100);
        const c = STATUS_HEX[statusColor(d.rate)];
        const ms = d.avg_ms ? `${d.avg_ms}ms` : '';
        return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
          <span style="width:6px;height:6px;border-radius:50%;background:${c};box-shadow:0 0 5px ${c}50"></span>
          <span style="flex:1;font-size:12px;color:#e0e2ef">${PROTO_LABELS[p] || p}</span>
          <span style="font-family:monospace;font-size:12px;font-weight:600;color:${c}">${pct}%</span>
          ${ms ? `<span style="font-family:monospace;font-size:10px;color:#6e7191">${ms}</span>` : ''}</div>`;
      }).join('');

      const info = hasData
        ? `<div style="font-size:11px;color:#6e7191;margin-top:6px;font-family:monospace">Проверок: ${data.totalAll} | Доступность: ${Math.round(data.rate * 100)}%</div>`
        : `<div style="font-size:11px;color:#6e7191;margin-top:6px">Нет данных</div>`;

      popupRef.current = new maplibregl.Popup({ offset: 15, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:'Inter',system-ui,sans-serif">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#e0e2ef">${name}</div>
          ${rows}${info}</div>`)
        .addTo(map);

      onRegionClick?.(name);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [onRegionClick]);

  useEffect(() => {
    if (ready) colorize();
  }, [ready, pulse, colorize]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border bg-surface">
      <div ref={containerRef} className="w-full h-[420px] md:h-[540px]" />
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 z-10">
        {([
          ['green', 'Работает'],
          ['amber', 'Нестабильно'],
          ['red', 'Блокировка'],
          ['gray', 'Нет данных'],
        ] as const).map(([s, label]) => (
          <div
            key={s}
            className="flex items-center gap-1.5 bg-base/80 backdrop-blur-sm rounded-md px-2 py-1
                       text-[10px] font-mono text-text-secondary border border-border"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_HEX[s] }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
