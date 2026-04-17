import { STATUS_HEX } from '../lib/colors';

interface Props {
  status: 'green' | 'amber' | 'red' | 'gray';
  size?: number;
  pulse?: boolean;
}

export function StatusDot({ status, size = 8, pulse = false }: Props) {
  const color = STATUS_HEX[status];
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: status !== 'gray' ? `0 0 ${size}px ${color}40` : undefined,
      }}
    />
  );
}
