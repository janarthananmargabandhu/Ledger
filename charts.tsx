import React, { useState } from 'react';
import { Slice, fmtMoney, fmtNum } from './logic';
import { useWidth } from './ui';

export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)'];
export const colorAt = (i: number) => (i < PALETTE.length ? PALETTE[i] : 'var(--c8)');

export function HBars({ items, onPick }: { items: Slice[]; onPick?: (id: string) => void }) {
  const max = Math.max(1, ...items.map(i => i.amount));
  return (
    <ol className="hbars">
      {items.map((s, i) => (
        <li key={s.id}>
          <button className="hbar" onClick={onPick ? () => onPick(s.id) : undefined} disabled={!onPick} title={onPick ? `Show only ${s.name}` : undefined}>
            <span className="hbar-top"><span className="hbar-name">{s.icon && <span className="emoji">{s.icon}</span>}{s.name}</span><span className="num">{fmtMoney(s.amount)}<em>{s.pct}%</em></span></span>
            <span className="hbar-track"><span className="hbar-fill" style={{ width: `${Math.max(1.5, (s.amount / max) * 100)}%`, background: colorAt(i) }} /></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Donut({ items, total }: { items: Slice[]; total: number }) {
  const R = 52, C = 2 * Math.PI * R;
  const shown = items.slice(0, PALETTE.length);
  const rest = items.slice(PALETTE.length).reduce((s, i) => s + i.amount, 0);
  const parts = rest > 0 ? [...shown.map(s => s.amount), rest] : shown.map(s => s.amount);
  let acc = 0;
  return (
    <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={`Spending by category, total ${fmtMoney(total)}`}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="18" />
      {total > 0 && parts.map((v, i) => {
        const len = (v / total) * C; const off = -acc; acc += len;
        return <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={colorAt(i)} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 1.2)} ${C}`} strokeDashoffset={off} transform="rotate(-90 70 70)" />;
      })}
      <text x="70" y="66" textAnchor="middle" className="donut-label">Spent</text>
      <text x="70" y="84" textAnchor="middle" className="donut-total">₹{compact(total)}</text>
    </svg>
  );
}

export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return +(a / 1e7).toFixed(1) + 'Cr';
  if (a >= 1e5) return +(a / 1e5).toFixed(1) + 'L';
  if (a >= 1e3) return +(a / 1e3).toFixed(1) + 'k';
  return fmtNum(a);
};
const niceMax = (v: number) => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

export interface Series { name: string; color: string; values: number[]; }
export function BarChart({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44, padB = 24, padT = 8;
  const innerW = w - padL - 6, innerH = height - padB - padT;
  const max = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
  const n = labels.length;
  const slot = n ? innerW / n : innerW;
  const barW = Math.max(2, Math.min(28, (slot * 0.72) / Math.max(1, series.length)));
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 64))));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const h = hover !== null && hover < n ? hover : null;
  return (
    <div className="chart" ref={ref}>
      <div className="chart-read" aria-live="polite">
        {h === null ? <span className="note">{n ? 'Point at a bar to see the amount' : ''}</span> : <>
          <strong>{labels[h]}</strong>
          {series.map(s => <span key={s.name}><i style={{ background: s.color }} />{series.length > 1 ? s.name + ' ' : ''}<b className="num">{fmtMoney(s.values[h])}</b></span>)}
        </>}
      </div>
      <svg width={w} height={height} role="img" aria-label="Bar chart" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={w - 6} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={padL - 6} y={y(max * f) + 4} textAnchor="end" className="axis">{compact(max * f)}</text>
          </g>
        ))}
        {labels.map((l, i) => {
          const x0 = padL + i * slot;
          const groupW = barW * series.length;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={x0} y={padT} width={slot} height={innerH + padB} fill={h === i ? 'var(--hover)' : 'transparent'} />
              {series.map((s, j) => {
                const v = s.values[i] || 0;
                return v > 0 ? <rect key={j} x={x0 + (slot - groupW) / 2 + j * barW} y={y(v)} width={Math.max(1, barW - 1)} height={Math.max(1, padT + innerH - y(v))} fill={s.color} rx="1.5" /> : null;
              })}
              {i % every === 0 && <text x={x0 + slot / 2} y={height - 6} textAnchor="middle" className="axis">{l.length > 9 && n > 3 ? l.split(' → ')[0] : l}</text>}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <div className="legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
    </div>
  );
}
