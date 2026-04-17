import { motion } from 'framer-motion';
import { Shield, Wifi, Radio, Zap, Globe } from 'lucide-react';
import { statusColor, STATUS_HEX, STATUS_DIM, PROTO_LABELS, PROTO_ORDER } from '../lib/colors';
import { Sparkline } from './Sparkline';
import { StatusDot } from './StatusDot';
import type { PulseRow, TimelineBucket } from '../api';

interface Props {
  pulse: PulseRow[];
  timeline: TimelineBucket[];
}

const PROTO_ICONS: Record<string, typeof Shield> = {
  'vless-reality': Shield,
  'xhttp-1': Globe,
  'xhttp-2': Wifi,
  'xhttp-3': Radio,
  'hysteria2': Zap,
};

export function ProtocolGrid({ pulse, timeline }: Props) {
  const byProto: Record<string, { ok: number; total: number; regions: Set<string>; topBlocked: string[] }> = {};

  for (const row of pulse) {
    if (!byProto[row.protocol]) {
      byProto[row.protocol] = { ok: 0, total: 0, regions: new Set(), topBlocked: [] };
    }
    const p = byProto[row.protocol];
    p.ok += row.ok;
    p.total += row.total;
    p.regions.add(row.region);
  }

  for (const row of pulse) {
    const p = byProto[row.protocol];
    if (!p) continue;
    const rate = row.total > 0 ? row.ok / row.total : 1;
    if (rate < 0.5 && row.region) {
      p.topBlocked.push(row.region);
    }
  }

  const sparkData: Record<string, { rate: number }[]> = {};
  for (const proto of PROTO_ORDER) {
    const buckets = timeline.filter(b => b.protocol === proto);
    sparkData[proto] = buckets.map(b => ({ rate: b.rate }));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {PROTO_ORDER.map((proto, i) => {
        const data = byProto[proto];
        if (!data) return null;
        const rate = data.total > 0 ? data.ok / data.total : 0;
        const pct = Math.round(rate * 100);
        const status = statusColor(rate);
        const color = STATUS_HEX[status];
        const Icon = PROTO_ICONS[proto] || Shield;

        return (
          <motion.div
            key={proto}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
            className="bg-surface border border-border rounded-xl p-4 relative overflow-hidden
                       hover:border-border-bright transition-all group"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan/10 to-transparent" />

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg" style={{ background: STATUS_DIM[status] }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{PROTO_LABELS[proto]}</div>
                <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
                  {data.regions.size} регион{data.regions.size > 4 ? 'ов' : data.regions.size > 1 ? 'а' : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-bold" style={{ color }}>
                  {pct}%
                </div>
              </div>
            </div>

            {/* availability bar */}
            <div className="h-1.5 rounded-full bg-elevated overflow-hidden mb-3">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            {/* sparkline */}
            {sparkData[proto]?.length > 1 && (
              <div className="mb-2">
                <Sparkline data={sparkData[proto]} color={color} height={28} />
              </div>
            )}

            {data.topBlocked.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <StatusDot status="red" size={5} />
                <span className="text-[10px] text-text-muted font-mono truncate">
                  {data.topBlocked.slice(0, 2).join(', ')}
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
