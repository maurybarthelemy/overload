/** Graphiques Recharts harmonisés (thème sombre, tactile, adaptés mobile). */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateShort } from '../lib/format';

const AX = { stroke: '#6c6c74', fontSize: 11, tickLine: false, axisLine: false } as const;

interface Pt { x: string; y: number; label?: string }

function Tip({ active, payload, unit, fmtX }: { active?: boolean; payload?: { payload: Pt }[]; unit: string; fmtX: (s: string) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="t">{fmtX(p.x)}</div>
      <b>{Math.round(p.y * 10) / 10} {unit}</b>
      {p.label && <div className="t" style={{ marginTop: 2 }}>{p.label}</div>}
    </div>
  );
}

export function LineArea({ data, unit = 'kg', color = '#30D158', height = 200, fmtX = formatDateShort, id = 'g' }: { data: Pt[]; unit?: string; color?: string; height?: number; fmtX?: (s: string) => string; id?: string }) {
  if (data.length === 0) return <div className="empty small">Pas encore de données</div>;
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const pad = Math.max(1, (max - min) * 0.15);
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.35} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)" />
          <XAxis dataKey="x" {...AX} tickFormatter={fmtX} minTickGap={24} />
          <YAxis {...AX} width={44} domain={[Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)]} allowDecimals={false} />
          <Tooltip content={<Tip unit={unit} fmtX={fmtX} />} cursor={{ stroke: 'rgba(255,255,255,.2)' }} />
          <Area type="monotone" dataKey="y" stroke={color} strokeWidth={2.5} fill={`url(#${id})`} dot={data.length < 25 ? { r: 3, fill: color, strokeWidth: 0 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, unit = '', color = '#0A84FF', height = 180, fmtX = formatDateShort }: { data: Pt[]; unit?: string; color?: string; height?: number; fmtX?: (s: string) => string }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)" />
          <XAxis dataKey="x" {...AX} tickFormatter={fmtX} minTickGap={16} />
          <YAxis {...AX} width={44} allowDecimals={false} tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip content={<Tip unit={unit} fmtX={fmtX} />} cursor={{ fill: 'rgba(255,255,255,.05)' }} />
          <Bar dataKey="y" fill={color} radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
