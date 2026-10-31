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

/** Donut you can explore: point at or tap a slice (or its key row) to read it in the centre. */
export function Donut({ items, total, active, onActive }: { items: Slice[]; total: number; active?: number | null; onActive?: (i: number | null) => void }) {
  const R = 54, C = 2 * Math.PI * R;
  const shown = items.slice(0, PALETTE.length);
  const rest = items.slice(PALETTE.length).reduce((s, i) => s + i.amount, 0);
  const parts = rest > 0 ? [...shown.map(s => s.amount), rest] : shown.map(s => s.amount);
  const a = active ?? null;
  const pick = a !== null && a < shown.length ? shown[a] : null;
  let acc = 0;
  return (
    <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={`Spending by category, total ${fmtMoney(total)}`} onMouseLeave={() => onActive?.(null)}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--soft)" strokeWidth="16" />
      {total > 0 && parts.map((v, i) => {
        const len = (v / total) * C; const off = -acc; acc += len;
        return <circle key={i} className={'donut-seg' + (a !== null && a !== i ? ' dim' : '') + (a === i ? ' on' : '')} cx="70" cy="70" r={R} fill="none" stroke={colorAt(i)} strokeWidth={a === i ? 22 : 16}
          strokeDasharray={`${Math.max(0, len - 1.6)} ${C}`} strokeDashoffset={off} transform="rotate(-90 70 70)" strokeLinecap="butt"
          onMouseEnter={() => onActive?.(i)} onClick={() => onActive?.(a === i ? null : i)} />;
      })}
      <text x="70" y="62" textAnchor="middle" className="donut-label">{pick ? pick.name : 'Spent'}</text>
      <text x="70" y="82" textAnchor="middle" className="donut-total">₹{compact(pick ? pick.amount : total)}</text>
      {pick && <text x="70" y="97" textAnchor="middle" className="donut-label">{pick.pct}%</text>}
    </svg>
  );
}

/** Two rings: outer is money used, inner is time passed. When outer runs ahead of inner, money is going too fast. */
export function PaceRing({ money, time, size = 148 }: { money: number; time: number; size?: number }) {
  const r1 = 60, r2 = 46, c1 = 2 * Math.PI * r1, c2 = 2 * Math.PI * r2;
  const tone = money > time + 0.15 ? 'var(--warn)' : money >= 0.9 ? 'var(--neg)' : 'var(--lime)';
  return (
    <svg className="pace-ring" width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`${Math.round(money * 100)}% of the money used, ${Math.round(time * 100)}% of the cycle passed`}>
      <circle cx="70" cy="70" r={r1} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="11" />
      <circle className="ring-anim" cx="70" cy="70" r={r1} fill="none" stroke={tone} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, money) * c1} ${c1}`} transform="rotate(-90 70 70)" />
      <circle cx="70" cy="70" r={r2} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
      <circle className="ring-anim" cx="70" cy="70" r={r2} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, time) * c2} ${c2}`} transform="rotate(-90 70 70)" />
      <text x="70" y="68" textAnchor="middle" className="ring-big">{Math.round(money * 100)}%</text>
      <text x="70" y="86" textAnchor="middle" className="ring-small">used</text>
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
