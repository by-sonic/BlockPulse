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
    const r = row.region || '?';
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

const RUSSIA_BOUNDS: [[number, number], [number, number]] = [[19, 41], [180, 82]];

export function BlockMap({ pulse, onRegionClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [loaded, setLoaded] = useState(false);
  const regionDataRef = useRef<RegionData>({});

  regionDataRef.current = buildRegionData(pulse);

  const updateColors = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('regions')) return;
    const regionData = regionDataRef.current;

    const fillExpr: any[] = ['match', ['get', 'name']];
    const lineExpr: any[] = ['match', ['get', 'name']];

    for (const [pulseRegion, data] of Object.entries(regionData)) {
      const status = statusColor(data.rate);
      const hex = STATUS_HEX[status];
      fillExpr.push(pulseRegion, hex + 'bb');
      lineExpr.push(pulseRegion, hex);
    }

    fillExpr.push('rgba(30, 32, 48, 0.35)');
    lineExpr.push('rgba(50, 55, 80, 0.4)');

    const widthExpr: any[] = ['match', ['get', 'name']];
    for (const pulseRegion of Object.keys(regionData)) {
      widthExpr.push(pulseRegion, 2.5);
    }
    widthExpr.push(0.5);

    try {
      map.setPaintProperty('regions-fill', 'fill-color', fillExpr);
      map.setPaintProperty('regions-line', 'line-color', lineExpr);
      map.setPaintProperty('regions-line', 'line-width', widthExpr);
    } catch { /* map not ready */ }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{
          id: 'bg',
          type: 'background',
          paint: { 'background-color': '#080810' },
        }],
      },
      bounds: RUSSIA_BOUNDS,
      fitBoundsOptions: { padding: 30 },
      minZoom: 2,
      maxZoom: 8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', async () => {
      try {
        const resp = await fetch('/russia-regions.geojson');
        const geojson = await resp.json();

        map.addSource('regions', { type: 'geojson', data: geojson });

        map.addLayer({
          id: 'regions-fill',
          type: 'fill',
          source: 'regions',
          paint: {
            'fill-color': 'rgba(30, 32, 48, 0.4)',
            'fill-opacity': 1,
          },
        });

        map.addLayer({
          id: 'regions-line',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': 'rgba(60, 65, 90, 0.5)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 1, 8, 1.5],
          },
        });

        map.addLayer({
          id: 'regions-hover',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': '#3B82F6',
            'line-width': 2,
            'line-opacity': 0,
          },
        });

        // Region labels at higher zoom
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
            'text-halo-color': '#080810',
            'text-halo-width': 1.5,
          },
        });

        setLoaded(true);
      } catch (e) {
        console.error('GeoJSON load error:', e);
      }
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
      const regionData = regionDataRef.current;

      if (popupRef.current) popupRef.current.remove();

      const rd = regionData[name];
      const hasData = rd && rd.totalAll > 0;

      const protos = PROTO_ORDER.map(p => {
        const d = rd?.protocols[p];
        if (!d) {
          return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
            <span style="width:7px;height:7px;border-radius:50%;background:#3d3f56;flex-shrink:0"></span>
            <span style="flex:1;font-size:12px;color:#6e7191">${PROTO_LABELS[p] || p}</span>
            <span style="font-family:monospace;font-size:11px;color:#3d3f56">—</span>
          </div>`;
        }
        const pct = Math.round(d.rate * 100);
        const status = statusColor(d.rate);
        const color = STATUS_HEX[status];
        const ms = d.avg_ms ? `${d.avg_ms}ms` : '';
        return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
          <span style="width:7px;height:7px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}50;flex-shrink:0"></span>
          <span style="flex:1;font-size:12px;color:#e0e2ef">${PROTO_LABELS[p] || p}</span>
          <span style="font-family:monospace;font-size:12px;font-weight:600;color:${color}">${pct}%</span>
          ${ms ? `<span style="font-family:monospace;font-size:10px;color:#6e7191">${ms}</span>` : ''}
        </div>`;
      }).join('');

      const rateText = hasData
        ? `<div style="font-size:11px;color:#6e7191;margin-top:6px;font-family:monospace">
            Проверок: ${rd.totalAll} | Доступность: ${Math.round(rd.rate * 100)}%
          </div>`
        : `<div style="font-size:11px;color:#6e7191;margin-top:6px">Нет данных — запусти проверку!</div>`;

      const popup = new maplibregl.Popup({ offset: 15, maxWidth: '300px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:'Geist',system-ui,sans-serif">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#e0e2ef">${name}</div>
            ${protos}
            ${rateText}
          </div>
        `)
        .addTo(map);
      popupRef.current = popup;

      if (onRegionClick) onRegionClick(name);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [onRegionClick]);

  useEffect(() => {
    if (loaded) updateColors();
  }, [loaded, pulse, updateColors]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border bg-surface">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan/20 to-transparent z-10" />
      <div ref={containerRef} className="w-full h-[420px] md:h-[540px]" />

      {/* Legend */}
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
