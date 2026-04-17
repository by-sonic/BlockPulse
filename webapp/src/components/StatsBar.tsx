import { Activity, Users, MapPin, Database } from 'lucide-react';
import type { Stats } from '../api';

interface Props {
  stats: Stats | null;
}

export function StatsBar({ stats }: Props) {
  if (!stats) return null;
  const items = [
    { icon: Activity, label: 'Проверок / 24ч', value: stats.today },
    { icon: Users, label: 'Источников', value: stats.sources },
    { icon: MapPin, label: 'Регионов', value: stats.regions },
    { icon: Database, label: 'Всего', value: stats.total_probes },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-surface border border-border rounded-xl p-4 text-center
                     hover:border-border-bright transition-colors relative overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan/15 to-transparent" />
          <item.icon className="mx-auto mb-2 text-text-muted" size={18} />
          <div className="font-mono text-2xl font-semibold text-cyan">
            {item.value.toLocaleString()}
          </div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest font-medium mt-1">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
