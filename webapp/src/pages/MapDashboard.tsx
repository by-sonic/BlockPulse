import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BlockMap } from '../components/Map';
import { ProtocolGrid } from '../components/ProtocolGrid';
import { RegionTable } from '../components/RegionTable';
import { usePulse } from '../hooks/usePulse';
import { useStats } from '../hooks/useStats';
import { api, type TimelineBucket } from '../api';
import { Activity, Users, MapPin } from 'lucide-react';

export function MapDashboard() {
  const { data: pulseData } = usePulse(1, 60_000);
  const stats = useStats(60_000);
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [, setSelectedRegion] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Карта блокировок VPN по регионам РФ — BlockPulse';
    api.timeline(24, 1).then(d => setTimeline(d.buckets)).catch(() => {});
    const id = setInterval(() => {
      api.timeline(24, 1).then(d => setTimeline(d.buckets)).catch(() => {});
    }, 120_000);
    return () => clearInterval(id);
  }, []);

  const pulse = pulseData?.pulse || [];

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      {/* Stats bar */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-wrap items-center gap-4 mb-6"
        >
          <h1 className="font-display text-lg mr-auto">
            Карта <span className="text-blue">блокировок</span>
          </h1>
          <MiniStat icon={Activity} value={stats.total_probes} label="проверок" />
          <MiniStat icon={Users} value={stats.sources} label="источников" />
          <MiniStat icon={MapPin} value={stats.regions} label="регионов" />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-green/20 bg-green/5 text-[10px] font-mono text-green uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            Live
          </div>
        </motion.div>
      )}

      {/* Map */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="mb-8"
      >
        <BlockMap pulse={pulse} onRegionClick={setSelectedRegion} />
      </motion.section>

      {/* Protocols */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <SectionTitle title="Протоколы" badge={`${pulse.length > 0 ? [...new Set(pulse.map(p => p.protocol))].length : 0}`} />
        <ProtocolGrid pulse={pulse} timeline={timeline} />
      </motion.section>

      {/* Regions */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <SectionTitle title="Регионы" badge={`${stats?.regions || 0}`} />
        <RegionTable pulse={pulse} />
      </motion.section>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label }: { icon: typeof Activity; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
      <Icon size={12} className="text-text-muted" />
      <span className="font-mono text-text-primary">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function SectionTitle({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="font-display text-sm">{title}</h2>
      {badge && (
        <span className="font-mono text-[10px] text-text-muted bg-surface-2 border border-border px-2 py-0.5 rounded-md">
          {badge}
        </span>
      )}
    </div>
  );
}
