import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { STATUS_HEX } from '../lib/colors';

interface Props {
  data: { rate: number }[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = STATUS_HEX.cyan, height = 32 }: Props) {
  if (!data.length) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, 1]} hide />
        <Area
          type="monotone"
          dataKey="rate"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color.replace('#', '')})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
