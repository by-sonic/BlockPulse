export function statusColor(rate: number | null): 'green' | 'amber' | 'red' | 'gray' {
  if (rate === null || rate === undefined) return 'gray';
  if (rate >= 0.7) return 'green';
  if (rate >= 0.3) return 'amber';
  return 'red';
}

export const STATUS_HEX: Record<string, string> = {
  green: '#00e878',
  amber: '#ffa726',
  red: '#ff4070',
  gray: '#3d3f56',
  blue: '#3B82F6',
};

export const STATUS_DIM: Record<string, string> = {
  green: 'rgba(0, 232, 120, 0.1)',
  amber: 'rgba(255, 167, 38, 0.1)',
  red: 'rgba(255, 64, 112, 0.1)',
  gray: 'rgba(61, 63, 86, 0.1)',
};

export const PROTO_LABELS: Record<string, string> = {
  'vless-reality': 'VLESS Reality',
  'xhttp-1': 'XHTTP #1',
  'xhttp-2': 'XHTTP #2',
  'xhttp-3': 'XHTTP #3',
  'hysteria2': 'Hysteria2',
};

export const PROTO_SHORT: Record<string, string> = {
  'vless-reality': 'VLESS',
  'xhttp-1': 'XH-1',
  'xhttp-2': 'XH-2',
  'xhttp-3': 'XH-3',
  'hysteria2': 'HY2',
};

export const PROTO_ORDER = ['vless-reality', 'xhttp-1', 'xhttp-2', 'xhttp-3', 'hysteria2'];
