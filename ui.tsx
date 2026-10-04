import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Book, Balances, Filters, Range, Tx, fmtMoney, getCycles, cycleLabel, monthKeys, fmtMonth, TYPES, METHODS, Period, currentCycleIndex, addMonths } from './logic';

export type Page = 'dashboard' | 'transactions' | 'accounts' | 'categories' | 'cycles' | 'reports' | 'settings';
export interface ConfirmOpts { title: string; body: string; action: string; danger?: boolean; run: () => void; }
export interface AppCtx {
  book: Book; bal: Balances; filters: Filters; range: Range;
  setFilters: (f: Partial<Filters>) => void;
  go: (p: Page) => void;
  editTx: (t?: Partial<Tx>) => void;
  quickAdd: () => void;
  confirm: (o: ConfirmOpts) => void;
  toast: (s: string) => void;
}
export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

const PATHS: Record<string, string> = {
  dashboard: 'M3 12h7V3H3zM14 21h7v-9h-7zM14 3v5h7V3zM3 21h7v-5H3z',
  transactions: 'M4 6h16M4 12h16M4 18h10',
  accounts: 'M3 7h18v12H3zM3 11h18M7 15h3',
  categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  cycles: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  reports: 'M5 20V10M12 20V4M19 20v-7',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
};
export const Icon = ({ name, size = 18 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);

export const Money = ({ n, signed = false, plain = false }: { n: number; signed?: boolean; plain?: boolean }) => (
  <span className={'num' + (plain ? '' : n < 0 ? ' neg' : signed && n > 0 ? ' pos' : '')}>{fmtMoney(n, signed)}</span>
);

export function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (narrow ? ' narrow' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={'field' + (wide ? ' wide' : '')}><span>{label}</span>{children}</label>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty"><strong>{title}</strong><p>{body}</p>{action}</div>;
}

export function Panel({ title, note, right, children, className = '' }: { title?: string; note?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={'panel ' + className}>
      {(title || right) && <header className="panel-head"><div><h3>{title}</h3>{note && <p className="note">{note}</p>}</div>{right}</header>}
      {children}
    </section>
  );
}

// ----- Filters -----
const PRESETS: [string, string][] = [
  ['currentCycle', 'Current salary cycle'], ['previousCycle', 'Previous salary cycle'], ['currentMonth', 'Current month'], ['previousMonth', 'Previous month'],
  ['last30', 'Last 30 days'], ['last3m', 'Last 3 months'], ['last6m', 'Last 6 months'], ['thisYear', 'This year'], ['all', 'All time'], ['custom', 'Custom range'],
];
const encode = (p: Period) => (p.kind === 'cycle' || p.kind === 'month' ? `${p.kind}:${p.key}` : p.kind);
const decode = (v: string, old: Period): Period => {
  const [kind, key] = v.split(':');
  if (key) return { kind: kind as any, key };
  if (kind === 'custom') return { kind: 'custom', from: old.from, to: old.to };
  return { kind: kind as any };
};

export function PeriodSelect() {
  const { book, filters, setFilters } = useApp();
  const cycles = getCycles(book);
  const p = filters.period;
  return (
    <>
      <Field label="Period">
        <select value={encode(p)} onChange={e => setFilters({ period: decode(e.target.value, p) })}>
          {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {cycles.length > 0 && <optgroup label="Salary cycles">{[...cycles].reverse().map(c => <option key={c.start} value={'cycle:' + c.start}>{cycleLabel(c)}</option>)}</optgroup>}
          <optgroup label="Months">{monthKeys(book).reverse().map(k => <option key={k} value={'month:' + k}>{fmtMonth(k)}</option>)}</optgroup>
        </select>
      </Field>
      {p.kind === 'custom' && <>
        <Field label="From"><input type="date" value={p.from || ''} onChange={e => setFilters({ period: { ...p, from: e.target.value || undefined } })} /></Field>
        <Field label="To"><input type="date" value={p.to || ''} onChange={e => setFilters({ period: { ...p, to: e.target.value || undefined } })} /></Field>
      </>}
    </>
  );
}

export function FilterBar({ search }: { search?: boolean }) {
  const { book, filters, setFilters } = useApp();
  const active = filters.accountId !== 'all' || filters.categoryId !== 'all' || filters.type !== 'all' || filters.method !== 'all' || !!filters.search;
  return (
    <div className="filters">
      <PeriodSelect />
      <Field label="Account">
        <select value={filters.accountId} onChange={e => setFilters({ accountId: e.target.value })}>
          <option value="all">All accounts</option>
          {book.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Category">
        <select value={filters.categoryId} onChange={e => setFilters({ categoryId: e.target.value })}>
          <option value="all">All categories</option>
          {book.categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </Field>
      <Field label="Type">
        <select value={filters.type} onChange={e => setFilters({ type: e.target.value as any })}>
          <option value="all">All types</option>
          {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="Payment method">
        <select value={filters.method} onChange={e => setFilters({ method: e.target.value as any })}>
          <option value="all">All methods</option>
          {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>
      {search && <Field label="Search"><input type="search" placeholder="Description or notes" value={filters.search} onChange={e => setFilters({ search: e.target.value })} /></Field>}
      {active && <button className="btn ghost clear" onClick={() => setFilters({ accountId: 'all', categoryId: 'all', type: 'all', method: 'all', search: '' })}>Clear filters</button>}
    </div>
  );
}

/** Step to the previous / next salary cycle or month. */
export function PeriodStepper() {
  const { book, range, setFilters } = useApp();
  const cycles = getCycles(book);
  let prev: Period | null = null, next: Period | null = null;
  if (range.cycleIndex !== undefined) {
    const cur = currentCycleIndex(cycles);
    const mk = (i: number): Period | null => (cycles[i] ? (i === cur ? { kind: 'currentCycle' } : { kind: 'cycle', key: cycles[i].start }) : null);
    prev = mk(range.cycleIndex - 1); next = mk(range.cycleIndex + 1);
  } else if (range.monthKey) {
    prev = { kind: 'month', key: addMonths(range.monthKey + '-01', -1).slice(0, 7) };
    next = { kind: 'month', key: addMonths(range.monthKey + '-01', 1).slice(0, 7) };
  } else return null;
  return (
    <div className="stepper">
      <button className="icon-btn" disabled={!prev} onClick={() => prev && setFilters({ period: prev })} aria-label="Previous period"><Icon name="left" /></button>
      <button className="icon-btn" disabled={!next} onClick={() => next && setFilters({ period: next })} aria-label="Next period"><Icon name="right" /></button>
    </div>
  );
}

export function useWidth<T extends HTMLElement>(initial = 720): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(260, el.clientWidth));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
