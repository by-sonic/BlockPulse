import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border mt-8">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
            <Activity size={14} />
            <span className="font-display text-xs">Block<span className="text-blue/60">Pulse</span></span>
          </Link>

          <div className="flex items-center gap-5 text-xs text-text-muted">
            <Link to="/map" className="hover:text-text-secondary transition-colors cursor-pointer">Карта</Link>
            <Link to="/contribute" className="hover:text-text-secondary transition-colors cursor-pointer">Участвовать</Link>
            <Link to="/about" className="hover:text-text-secondary transition-colors cursor-pointer">О проекте</Link>
            <a href="https://github.com/by-sonic/BlockPulse" target="_blank" rel="noopener" className="hover:text-text-secondary transition-colors cursor-pointer">GitHub</a>
            <a href="https://t.me/vpnstatuschecker_bot" target="_blank" rel="noopener" className="hover:text-text-secondary transition-colors cursor-pointer">Telegram</a>
          </div>

          <a
            href="https://t.me/bysonicvpn_bot"
            target="_blank"
            rel="noopener"
            className="text-xs text-text-muted hover:text-blue transition-colors cursor-pointer"
          >
            VPN от SonicVPN
          </a>
        </div>
      </div>
    </footer>
  );
}
