import { useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Copy, Check, Bot, Apple, Monitor, ChevronDown, Zap, Shield, HelpCircle } from 'lucide-react';

type Platform = 'linux' | 'macos' | 'windows';

const PLATFORMS: { id: Platform; label: string; icon: typeof Monitor }[] = [
  { id: 'linux', label: 'Linux', icon: Terminal },
  { id: 'macos', label: 'macOS', icon: Apple },
  { id: 'windows', label: 'Windows', icon: Monitor },
];

export function ContributeSection() {
  const [platform, setPlatform] = useState<Platform>('linux');
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  const oneLiners: Record<Platform, string> = {
    linux: `curl -sL ${base}/probe/install.sh | bash`,
    macos: `curl -sL ${base}/probe/install.sh | bash`,
    windows: `irm ${base}/probe/install.ps1 | iex`,
  };

  const manualSteps: Record<Platform, { cmd: string; desc: string }[]> = {
    linux: [
      { desc: 'Скачай и запусти probe-скрипт', cmd: `curl -sL ${base}/probe.py | python3` },
    ],
    macos: [
      { desc: 'Скачай и запусти probe-скрипт', cmd: `curl -sL ${base}/probe.py | python3` },
    ],
    windows: [
      { desc: 'Скачай и запусти в PowerShell', cmd: `(irm ${base}/probe.py) | python` },
    ],
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan/20 to-transparent" />

        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 bg-cyan/10 rounded-xl shrink-0">
            <Zap size={22} className="text-cyan" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1">Помоги собрать данные</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Запусти одну команду на своём устройстве — скрипт проверит доступность VPN-протоколов 
              из твоей сети и отправит результаты на карту. Это занимает ~30 секунд.
            </p>
          </div>
        </div>

        {/* Platform tabs */}
        <div className="flex gap-1.5 mb-4 bg-base rounded-lg p-1 border border-border">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all
                ${platform === p.id
                  ? 'bg-surface border border-border-bright text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              <p.icon size={14} />
              {p.label}
            </button>
          ))}
        </div>

        {/* One-liner */}
        <div className="mb-4">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap size={10} />
            Быстрый старт — одна команда
          </div>
          <CmdBlock cmd={oneLiners[platform]} highlight />
        </div>

        {/* What it does */}
        <div className="bg-base/50 border border-border rounded-lg p-3 mb-4">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
            Что делает скрипт:
          </div>
          <div className="space-y-1.5 text-xs text-text-secondary">
            <div className="flex items-start gap-2">
              <span className="text-green mt-0.5">1.</span>
              <span>Проверяет наличие Python 3 — если нет, устанавливает автоматически</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green mt-0.5">2.</span>
              <span>Скачивает probe-скрипт и запускает проверку 5 VPN-протоколов</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green mt-0.5">3.</span>
              <span>Пробует TLS-handshake на тестовые серверы (VLESS Reality, XHTTP ×3, Hysteria2)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green mt-0.5">4.</span>
              <span>Определяет твой регион/ISP по GeoIP и отправляет результаты на карту</span>
            </div>
          </div>
        </div>

        {/* Manual alternative */}
        <Details summary="Ручная установка (если one-liner не подходит)">
          <div className="space-y-3 pt-2">
            {manualSteps[platform].map((s, i) => (
              <div key={i}>
                <div className="text-xs text-text-secondary mb-1.5">{s.desc}</div>
                <CmdBlock cmd={s.cmd} />
              </div>
            ))}
            <div className="text-xs text-text-muted mt-2">
              Нужен Python 3.8+. Скрипт использует только стандартную библиотеку — никаких зависимостей.
            </div>
          </div>
        </Details>
      </div>

      {/* Safety block */}
      <div className="bg-surface border border-border rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-green/15 to-transparent" />
        <div className="flex items-start gap-3">
          <Shield size={18} className="text-green shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold mb-1">Безопасность</h4>
            <ul className="text-xs text-text-secondary space-y-1 leading-relaxed">
              <li>• Код скрипта открыт — проверь перед запуском: <code className="text-cyan bg-base px-1 rounded">{base}/probe.py</code></li>
              <li>• Никакие личные данные не собираются — только IP для определения региона</li>
              <li>• Скрипт не устанавливает VPN и не модифицирует систему</li>
              <li>• Используется только стандартная библиотека Python (socket, ssl, http)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-surface border border-border rounded-xl p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber/15 to-transparent" />
        <div className="flex items-start gap-3 mb-3">
          <HelpCircle size={18} className="text-amber shrink-0 mt-0.5" />
          <h4 className="text-sm font-semibold">Частые вопросы</h4>
        </div>
        <div className="space-y-2">
          <Details summary="Как это работает?">
            <p className="text-xs text-text-secondary leading-relaxed pt-1">
              Скрипт пытается установить TLS-соединение к тестовым серверам на портах разных 
              VPN-протоколов. Если ТСПУ блокирует протокол — handshake не проходит (timeout/reset). 
              Если проходит — протокол работает в твоей сети. Результат + твой регион/ISP 
              отправляются на сервер и агрегируются на карте.
            </p>
          </Details>
          <Details summary="Это легально?">
            <p className="text-xs text-text-secondary leading-relaxed pt-1">
              Да. Скрипт не обходит блокировки, не устанавливает VPN и не передаёт трафик. 
              Он только проверяет техническую доступность сетевых портов — аналог ping или traceroute.
            </p>
          </Details>
          <Details summary="Как запускать регулярно?">
            <p className="text-xs text-text-secondary leading-relaxed pt-1">
              Добавь в crontab (Linux/macOS): <code className="text-cyan bg-base px-1 rounded text-[11px]">
              */30 * * * * curl -sL {base}/probe/install.sh | bash &gt;/dev/null 2&gt;&amp;1</code>
              <br />Это будет запускать проверку каждые 30 минут.
            </p>
          </Details>
        </div>
      </div>

      {/* Telegram bot */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <a
          href="https://t.me/vpnstatuschecker_bot"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan hover:opacity-80 transition-opacity
                     bg-cyan/5 border border-cyan/20 rounded-lg px-4 py-2"
        >
          <Bot size={16} />
          Telegram бот
        </a>
      </div>
    </motion.section>
  );
}

function CmdBlock({ cmd, highlight }: { cmd: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group rounded-lg border ${highlight
      ? 'bg-base border-cyan/20'
      : 'bg-base border-border'
    } px-3 py-2.5`}>
      <div className={`font-mono text-xs select-all pr-10 break-all leading-relaxed ${
        highlight ? 'text-cyan' : 'text-green'
      }`}>
        {cmd}
      </div>
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-surface-2 border border-border
                   text-text-muted hover:text-text-primary hover:border-border-bright
                   transition-all opacity-60 group-hover:opacity-100"
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
    <div className="border-t border-border pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {summary}
      </button>
      {open && <div className="pl-5 mt-1">{children}</div>}
    </div>
  );
}
