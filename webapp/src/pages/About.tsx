import { motion } from 'framer-motion';
import { ExternalLink, Database, Shield, Cpu, Layers, Code2 } from 'lucide-react';

const FADE = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

export function About() {
  if (typeof document !== 'undefined') {
    document.title = 'О проекте BlockPulse — мониторинг VPN блокировок';
  }
  return (
    <div className="max-w-3xl mx-auto px-4 pb-16">
      <motion.div {...FADE} className="mb-10">
        <h1 className="font-display text-2xl md:text-3xl mb-3">
          О проекте <span className="text-blue">BlockPulse</span>
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed max-w-xl">
          Открытый crowdsourced мониторинг блокировок VPN-протоколов в РФ.
          Собираем данные от реальных пользователей — показываем что работает, а что нет.
        </p>
      </motion.div>

      {/* Architecture */}
      <motion.section
        {...FADE}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="rounded-2xl border border-border bg-surface p-6 md:p-8 mb-6"
      >
        <h2 className="font-display text-sm mb-5 flex items-center gap-2">
          <Layers size={15} className="text-blue" />
          Архитектура
        </h2>
        <pre className="font-mono text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">{`
┌──────────────┐    POST /api/probe    ┌────────────────┐
│  CLI probe   │ ───────────────────>  │   API сервер   │
│  (Python,    │                       │   (aiohttp)    │
│   stdlib)    │                       │                │
└──────────────┘                       │   SQLite DB    │
                                       │                │
┌──────────────┐    GET /api/pulse     │  Telegram bot  │
│  React SPA   │ <──────────────────   │   (aiogram)    │
│  (Vite+TS)   │                       └────────────────┘
└──────────────┘                              │
                                              │ каждые 5 мин
                                              ▼
                                       server-side probe
        `.trim()}</pre>
      </motion.section>

      {/* Stack */}
      <motion.section
        {...FADE}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="grid md:grid-cols-2 gap-4 mb-6"
      >
        <TechCard
          icon={Cpu}
          title="Backend"
          items={['Python 3.12 + aiohttp', 'aiogram (Telegram)', 'SQLite (aiosqlite)', 'Docker Compose']}
        />
        <TechCard
          icon={Layers}
          title="Frontend"
          items={['React 19 + TypeScript', 'Vite 8 + Tailwind CSS 4', 'MapLibre GL (карта)', 'Framer Motion']}
        />
        <TechCard
          icon={Shield}
          title="Безопасность"
          items={['HMAC-подпись проб', 'Rate limiting (IP)', 'GeoIP-валидация', 'CORS + input sanitization']}
        />
        <TechCard
          icon={Database}
          title="Probe-скрипт"
          items={['Один файл, 0 зависимостей', 'TLS handshake (socket+ssl)', 'UDP probe (Hysteria2)', 'Авто-определение региона']}
        />
      </motion.section>

      {/* Protocols */}
      <motion.section
        {...FADE}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="rounded-2xl border border-border bg-surface p-6 md:p-8 mb-6"
      >
        <h2 className="font-display text-sm mb-4">Тестируемые протоколы</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-text-muted font-mono uppercase">
                <th className="py-2 pr-4">Протокол</th>
                <th className="py-2 pr-4">Порт</th>
                <th className="py-2 pr-4">Транспорт</th>
                <th className="py-2">Описание</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {[
                ['VLESS Reality', '443', 'TCP+TLS', 'Маскировка под HTTPS (SNI: www.samsung.com)'],
                ['XHTTP #1', '2083', 'TCP+TLS', 'XHTTP Reality (SNI: www.microsoft.com)'],
                ['XHTTP #2', '8743', 'TCP+TLS', 'XHTTP Reality (SNI: github.com)'],
                ['XHTTP #3', '47832', 'TCP+TLS', 'XHTTP Reality (SNI: www.google.com)'],
                ['Hysteria2', '29080', 'UDP', 'QUIC-based, salamander obfuscation'],
              ].map(([proto, port, transport, desc]) => (
                <tr key={proto} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-text-primary">{proto}</td>
                  <td className="py-2.5 pr-4 font-mono">{port}</td>
                  <td className="py-2.5 pr-4 font-mono">{transport}</td>
                  <td className="py-2.5">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* Context */}
      <motion.section
        {...FADE}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="rounded-2xl border border-border bg-surface p-6 md:p-8 mb-8"
      >
        <h2 className="font-display text-sm mb-3">Зачем это нужно</h2>
        <div className="text-xs text-text-secondary leading-relaxed space-y-3">
          <p>
            С 2025 года ТСПУ (технические средства противодействия угрозам) научились блокировать
            популярные VPN-протоколы. Но ситуация отличается от региона к региону и от провайдера
            к провайдеру. То, что не работает на Ростелекоме в Казани, может работать на МТС в Москве.
          </p>
          <p>
            BlockPulse собирает данные от реальных пользователей из разных регионов и провайдеров,
            чтобы показать объективную картину: какой протокол работает, где и когда.
          </p>
          <p>
            Три варианта XHTTP с разными портами и SNI позволяют различить тип блокировки:
            по порту, по SNI (чёрный список доменов) или по паттерну трафика.
          </p>
        </div>
      </motion.section>

      {/* Links */}
      <motion.div
        {...FADE}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="flex flex-wrap items-center justify-center gap-5"
      >
        <a
          href="https://github.com/by-sonic/BlockPulse"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-surface text-sm text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors cursor-pointer"
        >
          <Code2 size={15} />
          GitHub
        </a>
        <a
          href="https://t.me/vpnstatuschecker_bot"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-surface text-sm text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors cursor-pointer"
        >
          <ExternalLink size={15} />
          Telegram-бот
        </a>
      </motion.div>
    </div>
  );
}

function TechCard({ icon: Icon, title, items }: { icon: typeof Cpu; title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-blue" />
        <h3 className="font-display text-xs">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="w-1 h-1 rounded-full bg-text-muted shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
