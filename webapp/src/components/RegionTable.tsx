import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { statusColor, STATUS_HEX, PROTO_ORDER, PROTO_SHORT } from '../lib/colors';
import { normalizeRegion } from '../lib/regions';
import { StatusDot } from './StatusDot';
import type { PulseRow } from '../api';
import { api } from '../api';

interface Props {
  pulse: PulseRow[];
}

type SortKey = 'region' | 'rate' | 'sources';

interface RegionAgg {
  region: string;
  rate: number;
  sources: number;
  protocols: Record<string, { rate: number; avg_ms: number | null }>;
}

export function RegionTable({ pulse }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('region');
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any[] | null>(null);

  const regions = useMemo(() => {
    const map: Record<string, RegionAgg> = {};
    for (const row of pulse) {
      const r = normalizeRegion(row.region || '?');
      if (!map[r]) map[r] = { region: r, rate: 0, sources: 0, protocols: {} };
      const rate = row.total > 0 ? row.ok / row.total : 0;
      map[r].protocols[row.protocol] = { rate, avg_ms: row.avg_ms };
      map[r].sources = Math.max(map[r].sources, row.sources);
    }
    for (const v of Object.values(map)) {
      const rates = Object.values(v.protocols).map(p => p.rate);
      v.rate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    }
    const list = Object.values(map);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'region') cmp = a.region.localeCompare(b.region);
      else if (sortKey === 'rate') cmp = a.rate - b.rate;
      else cmp = a.sources - b.sources;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [pulse, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'region'); }
  };

  const toggleExpand = async (region: string) => {
    if (expanded === region) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(region);
    setDetail(null);
    try {
      const d = await api.pulseRegion(region, 6);
      setDetail(d.protocols);
    } catch {
      setDetail([]);
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="inline-flex ml-1 opacity-40 group-hover:opacity-100 transition-opacity">
      {sortKey === k ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={10} />}
    </span>
  );

  if (!regions.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center text-text-muted">
        Данных пока нет
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden relative">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan/10 to-transparent" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th
                onClick={() => toggleSort('region')}
                className="text-left px-4 py-3 text-[10px] text-text-muted font-mono uppercase tracking-wider font-medium cursor-pointer group"
              >
                Регион <SortIcon k="region" />
              </th>
              {PROTO_ORDER.map(p => (
                <th key={p} className="px-2 py-3 text-center text-[10px] text-text-muted font-mono uppercase tracking-wider font-medium whitespace-nowrap">
                  {PROTO_SHORT[p]}
                </th>
              ))}
              <th
                onClick={() => toggleSort('sources')}
                className="px-3 py-3 text-center text-[10px] text-text-muted font-mono uppercase tracking-wider font-medium cursor-pointer group"
              >
                Ист. <SortIcon k="sources" />
              </th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <motion.tr
                key={r.region}
                layout
                className="border-b border-border last:border-b-0 cursor-pointer hover:bg-cyan/[0.02] transition-colors"
                onClick={() => toggleExpand(r.region)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: expanded === r.region ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={14} className="text-text-muted" />
                    </motion.div>
                    <span className="font-medium">{r.region}</span>
                  </div>
                </td>
                {PROTO_ORDER.map(proto => {
                  const pd = r.protocols[proto];
                  if (!pd) return <td key={proto} className="px-2 py-3 text-center"><StatusDot status="gray" /></td>;
                  const pct = Math.round(pd.rate * 100);
                  const status = statusColor(pd.rate);
                  return (
                    <td key={proto} className="px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <StatusDot status={status} size={7} />
                        <span className="font-mono text-xs" style={{ color: STATUS_HEX[status] }}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center font-mono text-xs text-text-secondary">
                  {r.sources}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-border bg-surface-2 overflow-hidden"
          >
            <div className="p-4">
              <div className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">
                {expanded} — детализация за 6 часов
              </div>
              {!detail ? (
                <div className="text-text-muted text-xs">Загрузка...</div>
              ) : detail.length === 0 ? (
                <div className="text-text-muted text-xs">Нет данных</div>
              ) : (
                <div className="grid gap-2">
                  {detail.map((d: any) => {
                    const rate = d.total > 0 ? d.ok / d.total : 0;
                    const pct = Math.round(rate * 100);
                    const status = statusColor(rate);
                    const color = STATUS_HEX[status];
                    return (
                      <div
                        key={d.protocol}
                        className="flex items-center gap-3 bg-elevated/50 rounded-lg px-3 py-2"
                      >
                        <StatusDot status={status} size={8} />
                        <span className="text-xs font-medium flex-1">{PROTO_SHORT[d.protocol] || d.protocol}</span>
                        <span className="font-mono text-xs" style={{ color }}>{pct}%</span>
                        <span className="font-mono text-[10px] text-text-muted">
                          {d.ok}/{d.total}
                        </span>
                        {d.avg_ms && (
                          <span className="font-mono text-[10px] text-text-muted">{d.avg_ms}ms</span>
                        )}
                        {d.isps && (
                          <span className="text-[10px] text-text-muted truncate max-w-[120px]" title={d.isps}>
                            {d.isps}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
