import { motion } from 'framer-motion';
import type { Stats } from '../api';

interface Props {
  stats: Stats | null;
}

function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="font-mono font-semibold text-cyan"
    >
      {value.toLocaleString()}
    </motion.span>
  );
}

export function Header({ stats }: Props) {
  return (
    <header className="relative pt-10 pb-6 px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="font-mono text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Block<span className="text-cyan" style={{ textShadow: '0 0 24px rgba(0,229,255,0.4)' }}>Pulse</span>
        </h1>
        <p className="text-text-secondary text-sm flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green" />
          </span>
          Мониторинг блокировок VPN-протоколов в РФ
        </p>
      </motion.div>

      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mt-6 flex justify-center gap-3 md:gap-4 flex-wrap"
        >
          {[
            { label: 'проверок / 24ч', value: stats.today },
            { label: 'источников', value: stats.sources },
            { label: 'регионов', value: stats.regions },
            { label: 'всего', value: stats.total_probes },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-surface border border-border rounded-xl px-4 py-3 min-w-[100px]
                         hover:border-border-bright transition-colors relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-dim to-transparent" />
              <div className="text-xl md:text-2xl">
                <AnimatedNumber value={s.value} />
              </div>
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-medium mt-1">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </header>
  );
}
