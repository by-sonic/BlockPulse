import { useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Apple, Monitor, Copy, Check, ChevronDown, Shield, HelpCircle, Zap, ExternalLink } from 'lucide-react';

type Platform = 'linux' | 'macos' | 'windows';

const PLATFORMS: { id: Platform; label: string; icon: typeof Terminal }[] = [
  { id: 'linux', label: 'Linux', icon: Terminal },
  { id: 'macos', label: 'macOS', icon: Apple },
  { id: 'windows', label: 'Windows', icon: Monitor },
];

export function ContributePage() {
  const [platform, setPlatform] = useState<Platform>('linux');
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  const oneLiners: Record<Platform, string> = {
    linux: `curl -sL ${base}/probe/install.sh | bash`,
    macos: `curl -sL ${base}/probe/install.sh | bash`,
    windows: `irm ${base}/probe/install.ps1 | iex`,
  };

  const manualCmds: Record<Platform, string> = {
    linux: `curl -sL ${base}/probe.py | python3`,
    macos: `curl -sL ${base}/probe.py | python3`,
    windows: `(irm ${base}/probe.py) | python`,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-16">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <h1 className="font-display text-2xl md:text-3xl mb-3">
          Помоги собрать <span className="text-blue">данные</span>
        </h1>
        <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
          Запусти одну команду — скрипт проверит доступность VPN-протоколов из твоей сети
          и отправит результаты на карту. Занимает ~30 секунд.
        </p>
      </motion.div>

      {/* Install card */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="rounded-2xl border border-border bg-surface p-6 mb-6"
      >
        {/* Platform tabs */}
        <div className="flex gap-1 mb-5 bg-base rounded-xl p-1 border border-border">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer
                ${platform === p.id
                  ? 'bg-surface border border-border-bright text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              <p.icon size={14} />
              {p.label}
            </button>
          ))}
        </div>

        {/* One-liner */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
            <Zap size={10} />
            Быстрый старт
          </div>
          <CmdBlock cmd={oneLiners[platform]} accent />
        </div>

        {/* Steps */}
        <div className="bg-base/60 rounded-xl border border-border p-4 mb-5">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-3">Что делает скрипт</div>
          <div className="space-y-2 text-xs text-text-secondary">
            {[
              'Проверяет Python 3 — если нет, устанавливает автоматически',
              'Скачивает probe-скрипт и запускает проверку 5 VPN-протоколов',
              'Пробует TLS-handshake на тестовые серверы (VLESS Reality, XHTTP x3, Hysteria2)',
              'Определяет регион/ISP по GeoIP и отправляет результаты на карту',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="font-mono text-blue shrink-0 mt-px">{i + 1}.</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Manual */}
        <Details summary="Ручная установка">
          <div className="pt-2 space-y-2">
            <p className="text-xs text-text-secondary">Если one-liner не подходит, скачай и запусти скрипт вручную:</p>
            <CmdBlock cmd={manualCmds[platform]} />
            <p className="text-[11px] text-text-muted">Нужен Python 3.8+. Только стандартная библиотека — никаких зависимостей.</p>
          </div>
        </Details>

        <Details summary="Автоматический запуск (crontab)">
          <div className="pt-2 space-y-2">
            <p className="text-xs text-text-secondary">Добавь в crontab для автоматической проверки каждые 30 минут:</p>
            <CmdBlock cmd={`*/30 * * * * curl -sL ${base}/probe/install.sh | bash >/dev/null 2>&1`} />
          </div>
        </Details>
      </motion.section>

      {/* Security */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="rounded-2xl border border-border bg-surface p-6 mb-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green/8 border border-green/15 shrink-0">
            <Shield size={16} className="text-green" />
          </div>
          <div>
            <h3 className="font-display text-sm mb-1">Безопасность</h3>
            <ul className="text-xs text-text-secondary space-y-1.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-text-muted mt-0.5">-</span>
                <span>Код открыт — <a href={`${base}/probe.py`} target="_blank" rel="noopener" className="text-blue hover:underline">{base}/probe.py</a></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-muted mt-0.5">-</span>
                <span>Собирается только IP для определения региона. Никаких личных данных.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-muted mt-0.5">-</span>
                <span>Скрипт не устанавливает VPN и не модифицирует систему</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-muted mt-0.5">-</span>
                <span>Стандартная библиотека Python (socket, ssl, http)</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.section>

      {/* FAQ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="rounded-2xl border border-border bg-surface p-6 mb-8"
      >
        <div className="flex items-center gap-2.5 mb-4">
          <HelpCircle size={16} className="text-amber" />
          <h3 className="font-display text-sm">FAQ</h3>
        </div>
        <Details summary="Как это работает?">
          <p className="text-xs text-text-secondary leading-relaxed pt-1">
            Скрипт пытается установить TLS-соединение к тестовым серверам на портах разных
            VPN-протоколов. Если ТСПУ блокирует протокол — handshake не проходит (timeout/reset).
            Если проходит — протокол работает в твоей сети. Результат + регион/ISP
            отправляются на сервер и агрегируются на карте.
          </p>
        </Details>
        <Details summary="Это легально?">
          <p className="text-xs text-text-secondary leading-relaxed pt-1">
            Да. Скрипт не обходит блокировки, не устанавливает VPN и не передаёт трафик.
            Он только проверяет техническую доступность сетевых портов — аналог ping или traceroute.
          </p>
        </Details>
        <Details summary="Почему Python?">
          <p className="text-xs text-text-secondary leading-relaxed pt-1">
            Стандартная библиотека Python включает socket и ssl — всё что нужно для TLS handshake.
            Ноль внешних зависимостей, один файл, работает на любой ОС.
          </p>
        </Details>
      </motion.section>

      {/* Links */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <a
          href="https://t.me/vpnstatuschecker_bot"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-blue transition-colors cursor-pointer"
        >
          <ExternalLink size={14} />
          Telegram-бот
        </a>
        <a
          href="https://github.com/by-sonic/BlockPulse"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-blue transition-colors cursor-pointer"
        >
          <ExternalLink size={14} />
          GitHub
        </a>
      </div>
    </div>
  );
}

function CmdBlock({ cmd, accent }: { cmd: string; accent?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={`group relative rounded-xl border px-4 py-3 ${
      accent ? 'bg-base border-blue/20' : 'bg-base border-border'
    }`}>
      <code className={`font-mono text-xs select-all break-all leading-relaxed pr-10 block ${
        accent ? 'text-blue' : 'text-green'
      }`}>{cmd}</code>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-surface-2 border border-border
                   text-text-muted hover:text-text-primary hover:border-border-bright
                   transition-all opacity-50 group-hover:opacity-100 cursor-pointer"
        title="Копировать"
      >
        {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border pt-3 mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {summary}
      </button>
      {open && <div className="pl-5 mt-2">{children}</div>}
    </div>
  );
}
