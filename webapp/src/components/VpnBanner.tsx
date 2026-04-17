import { motion } from 'framer-motion';
import { Shield, ArrowRight, Zap } from 'lucide-react';

export function VpnBanner() {
  return (
    <motion.a
      href="https://t.me/bysonicvpn_bot"
      target="_blank"
      rel="noopener"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="group relative block overflow-hidden rounded-2xl border border-blue/15 bg-gradient-to-br from-blue/5 via-surface to-cyan-dim cursor-pointer"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative flex items-center gap-5 px-6 py-5">
        <div className="shrink-0 w-12 h-12 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Shield size={22} className="text-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-display text-sm tracking-wide">Sonic<span className="text-blue">VPN</span></span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-green/10 text-green border border-green/20 uppercase">
              Работает
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Быстрый VPN с автоматическим подбором протокола. VLESS, XHTTP, WireGuard — всё из коробки.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-blue group-hover:gap-2.5 transition-all">
          <Zap size={13} />
          Подключить
          <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </motion.a>
  );
}
