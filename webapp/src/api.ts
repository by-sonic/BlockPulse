const BASE = '';

async function request<T>(endpoint: string): Promise<T> {
  const res = await fetch(BASE + endpoint);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export interface PulseRow {
  region: string;
  protocol: string;
  total: number;
  ok: number;
  avg_ms: number | null;
  sources: number;
}

export interface PulseResponse {
  pulse: PulseRow[];
  stats: Stats;
  window_hours: number;
}

export interface Stats {
  total_probes: number;
  today: number;
  regions: number;
  sources: number;
}

export interface TimelineBucket {
  hour: string;
  protocol: string;
  total: number;
  ok: number;
  rate: number;
}

export interface TimelineResponse {
  buckets: TimelineBucket[];
  hours: number;
  interval: number;
}

export interface RegionDetail {
  protocol: string;
  port: number;
  total: number;
  ok: number;
  avg_ms: number | null;
  sources: number;
  isps: string;
}

export interface WhoAmI {
  ip: string;
  region: string;
  city: string;
  isp: string;
}

export const api = {
  pulse: (hours = 1) => request<PulseResponse>(`/api/pulse?hours=${hours}`),
  pulseRegion: (region: string, hours = 6) =>
    request<{ region: string; protocols: RegionDetail[]; window_hours: number }>(
      `/api/pulse/${encodeURIComponent(region)}?hours=${hours}`
    ),
  stats: () => request<Stats>('/api/stats'),
  regions: () => request<{ regions: string[] }>('/api/regions'),
  whoami: () => request<WhoAmI>('/api/whoami'),
  timeline: (hours = 24, interval = 1) =>
    request<TimelineResponse>(`/api/pulse/timeline?hours=${hours}&interval=${interval}`),
};
