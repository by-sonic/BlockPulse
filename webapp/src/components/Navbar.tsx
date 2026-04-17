import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, Terminal, Info, Menu, X, Activity } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Главная', icon: Activity },
  { to: '/map', label: 'Карта', icon: Map },
  { to: '/contribute', label: 'Участвовать', icon: Terminal },
  { to: '/about', label: 'О проекте', icon: Info },
] as const;

export function Navbar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 inset-x-0 z-50">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface/70 backdrop-blur-xl px-5 py-2.5 shadow-lg shadow-black/20">
          <Link to="/" className="flex items-center gap-2.5 group cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-blue/10 border border-blue/20 flex items-center justify-center group-hover:bg-blue/20 transition-colors">
              <Activity size={14} className="text-blue" />
            </div>
            <span className="font-display text-base tracking-wide">
              Block<span className="text-blue">Pulse</span>
            </span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                    ${active ? 'text-blue' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  <Icon size={13} />
                  {label}
                  {active && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 bg-blue/8 border border-blue/15 rounded-lg"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Toggle menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="md:hidden mt-2 rounded-2xl border border-border bg-surface/90 backdrop-blur-xl p-3 shadow-lg"
            >
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer
                      ${active ? 'text-blue bg-blue/8' : 'text-text-secondary hover:text-text-primary hover:bg-elevated'}`}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
