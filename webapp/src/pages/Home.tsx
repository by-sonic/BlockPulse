import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, Terminal, ArrowRight, Activity, Users, MapPin, Database, ExternalLink } from 'lucide-react';
import { api, type Stats } from '../api';
import { VpnBanner } from '../components/VpnBanner';

const FADE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    document.title = 'BlockPulse — карта блокировок VPN в России в реальном времени';
    api.stats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16">
      {/* Hero */}
      <section className="pt-12 pb-16 text-center">
        <motion.div {...FADE_UP} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface mb-6 text-xs text-text-secondary font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            Мониторинг в реальном времени
          </div>
        </motion.div>

        <motion.h1
          {...FADE_UP}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="font-display text-4xl md:text-6xl tracking-tight mb-4"
        >
          Block<span className="text-blue">Pulse</span>
        </motion.h1>

        <motion.p
          {...FADE_UP}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-base md:text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed"
        >
          Crowdsourced карта блокировок VPN-протоколов в России.
          Узнай, что работает в твоём регионе прямо сейчас.
        </motion.p>

        <motion.div
          {...FADE_UP}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            to="/map"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue text-white text-sm font-semibold
                       hover:bg-blue/90 transition-colors shadow-lg shadow-blue/20 cursor-pointer"
          >
            <Map size={16} />
            Открыть карту
            <ArrowRight size={14} />
          </Link>
          <Link
            to="/contribute"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-surface text-sm font-medium
                       text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors cursor-pointer"
          >
            <Terminal size={16} />
            Запустить проверку
          </Link>
        </motion.div>
      </section>

      {/* Stats */}
      {stats && (
        <motion.section
          {...FADE_UP}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12"
        >
          <StatCard icon={Activity} label="Проверок / 24ч" value={stats.total_probes} />
          <StatCard icon={Users} label="Источников" value={stats.sources} />
          <StatCard icon={MapPin} label="Регионов" value={stats.regions} />
          <StatCard icon={Database} label="Всего записей" value={stats.today} />
        </motion.section>
      )}

      {/* VPN Ad Banner */}
      <section className="mb-12">
        <VpnBanner />
      </section>

      {/* Feature cards */}
      <motion.section
        {...FADE_UP}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="grid md:grid-cols-3 gap-4 mb-12"
      >
        <FeatureCard
          title="Интерактивная карта"
          desc="Регионы подсвечиваются по статусу блокировок. Кликни на регион — увидишь детализацию по протоколам и провайдерам."
          to="/map"
          icon={Map}
        />
        <FeatureCard
          title="5 протоколов"
          desc="VLESS Reality, XHTTP (3 варианта), Hysteria2. Разные порты и SNI позволяют отличить тип блокировки."
          to="/map"
          icon={Activity}
        />
        <FeatureCard
          title="Одна команда"
          desc="Запусти скрипт из терминала. Он сам проверит доступность протоколов и отправит данные на карту."
          to="/contribute"
          icon={Terminal}
        />
      </motion.section>

      {/* How it works */}
      <motion.section
        {...FADE_UP}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="rounded-2xl border border-border bg-surface p-6 md:p-8 mb-12"
      >
        <h2 className="font-display text-lg mb-6">Как это работает</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { n: '01', title: 'Запуск', desc: 'Пользователь запускает probe-скрипт на своём устройстве' },
            { n: '02', title: 'Проверка', desc: 'Скрипт пробует TLS-handshake к тестовым серверам на портах 5 VPN-протоколов' },
            { n: '03', title: 'Детекция', desc: 'Если ТСПУ блокирует — handshake не проходит (timeout или reset)' },
            { n: '04', title: 'Карта', desc: 'Результат + регион по GeoIP агрегируются на карте блокировок' },
          ].map(step => (
            <div key={step.n} className="flex flex-col gap-2">
              <span className="font-mono text-2xl font-semibold text-blue/30">{step.n}</span>
              <h3 className="font-display text-sm">{step.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Telegram */}
      <motion.div
        {...FADE_UP}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="text-center"
      >
        <a
          href="https://t.me/vpnstatuschecker_bot"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-blue transition-colors cursor-pointer"
        >
          <ExternalLink size={14} />
          Telegram-бот BlockPulse
        </a>
      </motion.div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text-muted mb-1">
        <Icon size={13} />
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-display text-xl text-blue">{value.toLocaleString()}</span>
    </div>
  );
}

function FeatureCard({ title, desc, to, icon: Icon }: { title: string; desc: string; to: string; icon: typeof Map }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-surface p-5 hover:border-border-bright transition-all cursor-pointer"
    >
      <div className="w-9 h-9 rounded-lg bg-blue/8 border border-blue/15 flex items-center justify-center mb-4 group-hover:bg-blue/12 transition-colors">
        <Icon size={16} className="text-blue" />
      </div>
      <h3 className="font-display text-sm mb-2">{title}</h3>
      <p className="text-xs text-text-secondary leading-relaxed">{desc}</p>
    </Link>
  );
}
