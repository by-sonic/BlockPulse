import { useEffect, useState, useCallback } from 'react';
import { api, type Stats } from '../api';

export function useStats(refreshInterval = 60_000) {
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api.stats());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, refreshInterval);
    return () => clearInterval(id);
  }, [load, refreshInterval]);

  return stats;
}
