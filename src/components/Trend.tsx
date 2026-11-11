import type { Trend } from '../lib/analysis';
import { Icon } from './Icon';

export function TrendChip({ trend, label }: { trend: Trend; label: string }) {
  return (
    <span className={`chip ${trend === 'up' ? 'up' : trend === 'down' ? 'down' : ''}`}>
      {trend !== 'same' && <Icon name={trend === 'up' ? 'up' : 'down'} size={12} stroke={3} />}
      {label}
    </span>
  );
}
