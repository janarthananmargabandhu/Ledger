// ---------- Data structures ----------
export type TxType = 'income' | 'expense' | 'savings' | 'transfer' | 'adjustment';
export type Method = 'cash' | 'upi' | 'debit' | 'credit' | 'bank' | 'other';
export type CatKind = 'expense' | 'income' | 'savings' | 'any';

export interface Account { id: string; name: string; opening: number; sample?: boolean; }
export interface Category { id: string; name: string; icon: string; kind: CatKind; system?: boolean; }
export interface Tx {
  id: string;
  date: string;            // YYYY-MM-DD
  accountId: string;
  toAccountId?: string;    // transfers only
  description: string;
  categoryId: string;      // '' for transfers
  amount: number;          // always positive, except adjustments which are signed
  type: TxType;
  method: Method;
  notes?: string;
  createdAt: number;
  sample?: boolean;
  by?: string;             // id of the family member who entered it
}
export interface Member { id: string; name: string; }
export interface Book {
  accounts: Account[];
  categories: Category[];
  txs: Tx[];
  settings: { hasSample: boolean; voiceLang?: 'ta' | 'en'; cycleBy?: string };  // cycleBy: member whose salary starts a cycle ('' = anyone)
  members?: Member[];      // filled in from the shared ledger, not saved with the book
}

export const TYPES: { id: TxType; label: string }[] = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'savings', label: 'Savings' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'adjustment', label: 'Adjustment' },
];
export const METHODS: { id: Method; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'debit', label: 'Debit card' },
  { id: 'credit', label: 'Credit card' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'other', label: 'Other' },
];
export const SALARY = 'salary';
export const OTHER = 'other';

// ---------- Dates ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const monthStart = (s: string) => s.slice(0, 7) + '-01';
export const addMonths = (s: string, n: number) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + n); return iso(d); };
export const monthEnd = (s: string) => addDays(addMonths(s, 1), -1);
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDate = (s: string, year = false) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]}${year ? ' ' + y : ''}`; };
export const fmtMonth = (key: string, short = false) => { const [y, m] = key.split('-').map(Number); return `${(short ? MON : MONTHS)[m - 1]} ${y}`; };

// ---------- Money ----------
export const fmtNum = (n: number) => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtMoney = (n: number, signed = false) => {
  const s = '₹' + fmtNum(n);
  if (signed) return (n < 0 ? '−' : '+') + s;
  return n < 0 ? '−' + s : s;
};
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// ---------- Balances ----------
/** Signed effect of a transaction on one account. */
export function effect(t: Tx, accountId: string): number {
  if (t.type === 'transfer') {
    if (t.accountId === t.toAccountId) return 0;
    if (t.accountId === accountId) return -t.amount;
    if (t.toAccountId === accountId) return t.amount;
    return 0;
  }
  if (t.accountId !== accountId) return 0;
  if (t.type === 'income') return t.amount;
  if (t.type === 'adjustment') return t.amount;
  return -t.amount; // expense, savings
}
/** Signed amount as shown in a list (from the point of view of the source account). */
export const signedAmount = (t: Tx, viewAccount?: string) =>
  effect(t, viewAccount && (t.accountId === viewAccount || t.toAccountId === viewAccount) ? viewAccount : t.accountId);

export const sortAsc = (txs: Tx[]) => [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));

export interface Balances {
  byAccount: Record<string, number>;
  after: Record<string, number>;     // tx id -> balance of its source account after it
  afterTo: Record<string, number>;   // transfer id -> balance of destination after it
  total: number;
}
export function computeBalances(book: Book, upTo?: string): Balances {
  const byAccount: Record<string, number> = {};
  for (const a of book.accounts) byAccount[a.id] = a.opening;
  const after: Record<string, number> = {};
  const afterTo: Record<string, number> = {};
  for (const t of sortAsc(book.txs)) {
    if (upTo && t.date > upTo) break;
    if (t.accountId in byAccount) { byAccount[t.accountId] += effect(t, t.accountId); after[t.id] = byAccount[t.accountId]; }
    if (t.type === 'transfer' && t.toAccountId && t.toAccountId in byAccount && t.toAccountId !== t.accountId) {
      byAccount[t.toAccountId] += t.amount; afterTo[t.id] = byAccount[t.toAccountId];
    }
  }
  const total = Object.values(byAccount).reduce((s, n) => s + n, 0);
  return { byAccount, after, afterTo, total };
}

// ---------- Salary cycles ----------
export interface Cycle { start: string; end: string | null; salary: number; }
export const isSalary = (t: Tx) => t.type === 'income' && t.categoryId === SALARY;
/** A cycle starts on every date a salary was recorded and runs until the day before the next one. */
export function getCycles(book: Book): Cycle[] {
  const byDate = new Map<string, number>();
  const who = book.settings.cycleBy && (book.members || []).some(m => m.id === book.settings.cycleBy) ? book.settings.cycleBy : '';
  for (const t of book.txs) if (isSalary(t) && (!who || !t.by || t.by === who)) byDate.set(t.date, (byDate.get(t.date) || 0) + t.amount);
  const dates = [...byDate.keys()].sort();
  return dates.map((d, i) => ({ start: d, end: i + 1 < dates.length ? addDays(dates[i + 1], -1) : null, salary: byDate.get(d)! }));
}
export const cycleLabel = (c: Cycle) => `${fmtDate(c.start)} → ${c.end ? fmtDate(c.end) : 'Present'}`;
export function currentCycleIndex(cycles: Cycle[], now = today()): number {
  let idx = -1;
  cycles.forEach((c, i) => { if (c.start <= now) idx = i; });
  return idx;
}
export function monthKeys(book: Book): string[] {
  const s = new Set(book.txs.map(t => t.date.slice(0, 7)));
  s.add(today().slice(0, 7));
  return [...s].sort();
}

// ---------- Periods & filters ----------
export type PeriodKind = 'currentCycle' | 'previousCycle' | 'currentMonth' | 'previousMonth' | 'last30' | 'last3m' | 'last6m' | 'thisYear' | 'all' | 'custom' | 'cycle' | 'month';
export interface Period { kind: PeriodKind; from?: string; to?: string; key?: string; }
export interface Range { from: string; to: string; label: string; title: string; open: boolean; empty?: boolean; cycleIndex?: number; monthKey?: string; }
export interface Filters { period: Period; accountId: string; categoryId: string; type: 'all' | TxType; method: 'all' | Method; search: string; }
export const defaultFilters = (): Filters => ({ period: { kind: 'currentCycle' }, accountId: 'all', categoryId: 'all', type: 'all', method: 'all', search: '' });

const MIN = '0000-01-01', MAX = '9999-12-31';
export function resolvePeriod(p: Period, book: Book, now = today()): Range {
  const cycles = getCycles(book);
  const cyc = (i: number, title: string): Range => {
    const c = cycles[i];
    if (!c) return { from: MAX, to: MIN, label: 'No salary recorded', title, open: false, empty: true };
    return { from: c.start, to: c.end || MAX, label: cycleLabel(c), title, open: !c.end, cycleIndex: i };
  };
  const month = (key: string, title: string): Range =>
    ({ from: key + '-01', to: monthEnd(key + '-01'), label: fmtMonth(key), title, open: false, monthKey: key });
  const cur = currentCycleIndex(cycles, now);
  switch (p.kind) {
    case 'currentCycle': return cyc(cur, 'Current salary cycle');
    case 'previousCycle': return cyc(cur - 1, 'Previous salary cycle');
    case 'cycle': { const i = cycles.findIndex(c => c.start === p.key); return cyc(i, i === cur ? 'Current salary cycle' : 'Salary cycle'); }
    case 'currentMonth': return month(now.slice(0, 7), 'Current month');
    case 'previousMonth': return month(addMonths(now, -1).slice(0, 7), 'Previous month');
    case 'month': return month(p.key || now.slice(0, 7), 'Month');
    case 'last30': return { from: addDays(now, -29), to: now, label: `${fmtDate(addDays(now, -29))} → ${fmtDate(now)}`, title: 'Last 30 days', open: false };
    case 'last3m': return { from: addMonths(now, -2), to: now, label: `${fmtMonth(addMonths(now, -2).slice(0, 7), true)} → ${fmtDate(now)}`, title: 'Last 3 months', open: false };
    case 'last6m': return { from: addMonths(now, -5), to: now, label: `${fmtMonth(addMonths(now, -5).slice(0, 7), true)} → ${fmtDate(now)}`, title: 'Last 6 months', open: false };
    case 'thisYear': return { from: now.slice(0, 4) + '-01-01', to: now.slice(0, 4) + '-12-31', label: now.slice(0, 4), title: 'This year', open: false };
    case 'custom': {
      const from = p.from || MIN, to = p.to || MAX;
      return { from, to, label: `${p.from ? fmtDate(p.from, true) : 'Start'} → ${p.to ? fmtDate(p.to, true) : 'Present'}`, title: 'Custom range', open: !p.to };
    }
    default: return { from: MIN, to: MAX, label: 'Everything recorded', title: 'All time', open: true };
  }
}
/** The comparable period just before this one (previous cycle, previous month, or same-length window). */
export function previousRange(r: Range, book: Book): Range | null {
  if (r.empty) return null;
  if (r.cycleIndex !== undefined) {
    const c = getCycles(book)[r.cycleIndex - 1];
    return c ? { from: c.start, to: c.end || MAX, label: cycleLabel(c), title: 'previous salary cycle', open: false, cycleIndex: r.cycleIndex - 1 } : null;
  }
  if (r.monthKey) { const k = addMonths(r.monthKey + '-01', -1).slice(0, 7); return { from: k + '-01', to: monthEnd(k + '-01'), label: fmtMonth(k), title: 'previous month', open: false, monthKey: k }; }
  if (r.from === MIN || r.to === MAX) return null;
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1), label: '', title: `previous ${len} days`, open: false };
}

export function applyFilters(book: Book, f: Filters, r: Range, ignorePeriod = false): Tx[] {
  const q = f.search.trim().toLowerCase();
  return book.txs.filter(t => {
    if (!ignorePeriod && (t.date < r.from || t.date > r.to)) return false;
    if (f.accountId !== 'all' && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.categoryId !== 'all' && t.categoryId !== f.categoryId) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.method !== 'all' && t.method !== f.method) return false;
    if (q && !(t.description + ' ' + (t.notes || '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

// ---------- Aggregates ----------
export interface Totals { income: number; expenses: number; savings: number; count: number; }
export function totals(txs: Tx[]): Totals {
  const o: Totals = { income: 0, expenses: 0, savings: 0, count: txs.length };
  for (const t of txs) {
    if (t.type === 'income') o.income += t.amount;
    else if (t.type === 'expense') o.expenses += t.amount;
    else if (t.type === 'savings') o.savings += t.amount;
  }
  return o;
}
export interface Slice { id: string; name: string; icon: string; amount: number; pct: number; count: number; }
export const catOf = (book: Book, id: string): Category =>
  book.categories.find(c => c.id === id) || { id, name: id ? 'Uncategorised' : 'Transfer', icon: id ? '•' : '⇄', kind: 'any' };
export const accOf = (book: Book, id?: string) => book.accounts.find(a => a.id === id);

/** Spending by category. Only Expense transactions count: savings and transfers are excluded. */
export function spendByCategory(txs: Tx[], book: Book): Slice[] {
  const m = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const t of txs) if (t.type === 'expense') {
    const e = m.get(t.categoryId) || { amount: 0, count: 0 };
    e.amount += t.amount; e.count++; m.set(t.categoryId, e); total += t.amount;
  }
  return [...m.entries()].map(([id, e]) => { const c = catOf(book, id); return { id, name: c.name, icon: c.icon, amount: e.amount, count: e.count, pct: pct(e.amount, total) }; })
    .sort((a, b) => b.amount - a.amount);
}
export function spendByAccount(txs: Tx[], book: Book): Slice[] {
  const m = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const t of txs) if (t.type === 'expense') {
    const e = m.get(t.accountId) || { amount: 0, count: 0 };
    e.amount += t.amount; e.count++; m.set(t.accountId, e); total += t.amount;
  }
  return [...m.entries()].map(([id, e]) => ({ id, name: accOf(book, id)?.name || 'Deleted account', icon: '', amount: e.amount, count: e.count, pct: pct(e.amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

// ---------- Trend buckets ----------
export type Gran = 'day' | 'week' | 'month' | 'cycle';
export interface Bucket { label: string; from: string; to: string; }
export function makeBuckets(r: Range, gran: Gran, book: Book, txs: Tx[], now = today()): Bucket[] {
  if (r.empty) return [];
  const dates = txs.map(t => t.date).sort();
  const last = dates.length ? dates[dates.length - 1] : now;
  const from = r.from === MIN ? (dates[0] || now) : r.from;
  const cap = last > now ? last : now;
  const to = r.to < cap ? r.to : cap;
  if (from > to) return [];
  const out: Bucket[] = [];
  if (gran === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ label: fmtDate(d), from: d, to: d });
  } else if (gran === 'week') {
    for (let d = from; d <= to; d = addDays(d, 7)) { const e = addDays(d, 6) > to ? to : addDays(d, 6); out.push({ label: fmtDate(d), from: d, to: e }); }
  } else if (gran === 'month') {
    for (let d = monthStart(from); d <= to; d = addMonths(d, 1)) out.push({ label: fmtMonth(d.slice(0, 7), true), from: d, to: monthEnd(d) });
  } else {
    for (const c of getCycles(book)) { const e = c.end || MAX; if (e >= from && c.start <= to) out.push({ label: cycleLabel(c), from: c.start, to: e }); }
  }
  return out.slice(-120);
}
export const sumIn = (txs: Tx[], b: Bucket, pred: (t: Tx) => boolean) =>
  txs.reduce((s, t) => (t.date >= b.from && t.date <= b.to && pred(t) ? s + t.amount : s), 0);

// ---------- Insights ----------
export interface Insight { tone: 'neutral' | 'good' | 'warn'; text: string; }
export function buildInsights(book: Book, f: Filters, r: Range, now = today()): Insight[] {
  const out: Insight[] = [];
  if (r.empty) return out;
  const txs = applyFilters(book, f, r);
  const t = totals(txs);
  const cats = spendByCategory(txs, book);
  const where = r.cycleIndex !== undefined ? 'this salary cycle' : r.monthKey ? 'this month' : 'in this period';
  if (cats.length) {
    out.push({ tone: 'neutral', text: `Your highest spending category ${where} is ${cats[0].name}: ${fmtMoney(cats[0].amount)}, ${cats[0].pct}% of expenses.` });
  }
  if (t.income > 0 && t.expenses > 0) {
    const p = pct(t.expenses, t.income);
    out.push({ tone: p > 90 ? 'warn' : 'neutral', text: `You have spent ${p}% of the income received ${where}.` });
  }
  if (t.income > 0 && t.savings > 0) {
    out.push({ tone: 'good', text: `Your savings rate ${where} is ${pct(t.savings, t.income)}% (${fmtMoney(t.savings)} of ${fmtMoney(t.income)}).` });
  }
  // Comparison with the previous comparable period, cut at the same day count when this one is still running.
  const prev = previousRange(r, book);
  if (prev && t.expenses > 0) {
    const running = r.open || r.to > now;
    const daysIn = running ? daysBetween(r.from, now) : null;
    const cut = daysIn !== null ? addDays(prev.from, daysIn) : prev.to;
    const prevTxs = applyFilters(book, f, { ...prev, to: cut < prev.to ? cut : prev.to });
    const pt = totals(prevTxs);
    if (pt.expenses > 0) {
      const diff = t.expenses - pt.expenses;
      const at = daysIn !== null ? `at the same point of the ${prev.title}` : `in the ${prev.title}`;
      if (Math.abs(diff) >= 1) out.push({ tone: diff > 0 ? 'warn' : 'good', text: `You have spent ${fmtMoney(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${at} (${fmtMoney(pt.expenses)}${daysIn !== null ? ` by day ${daysIn + 1}` : ''}).` });
      const prevCats = new Map(spendByCategory(prevTxs, book).map(c => [c.id, c.amount]));
      let worst: { name: string; diff: number } | null = null;
      for (const c of cats) { const d = c.amount - (prevCats.get(c.id) || 0); if (d > 0 && (!worst || d > worst.diff)) worst = { name: c.name, diff: d }; }
      if (worst && cats.length > 1) out.push({ tone: 'warn', text: `${worst.name} is up the most: ${fmtMoney(worst.diff)} more than ${at}. Look here first if you want to cut back.` });
    }
  }
  const big = txs.filter(x => x.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
  if (big && t.expenses > 0 && txs.filter(x => x.type === 'expense').length > 2) {
    out.push({ tone: 'neutral', text: `Your largest single expense was ${big.description || catOf(book, big.categoryId).name} on ${fmtDate(big.date)}: ${fmtMoney(big.amount)}.` });
  }
  if (f.accountId === 'all') {
    const b = computeBalances(book);
    if (book.accounts.length) {
      const top = [...book.accounts].sort((x, y) => b.byAccount[y.id] - b.byAccount[x.id])[0];
      out.push({ tone: 'neutral', text: `Your balance across all accounts is ${fmtMoney(b.total)}. Most of it (${fmtMoney(b.byAccount[top.id])}) is in ${top.name}.` });
    }
  }
  return out;
}

// ---------- Pace: is the money going too fast, and how did the day go? ----------
export interface Pace { tone: 'good' | 'warn' | 'alert' | 'neutral'; title: string; text: string; }
const daySpend = (book: Book, d: string) => book.txs.reduce((s, t) => (t.type === 'expense' && t.date === d ? s + t.amount : s), 0);
/** A "usual day": the median of daily spending over the 30 days before `d`. Needs a week of history. */
export function usualDay(book: Book, d: string): number | null {
  const first = book.txs.filter(t => t.type === 'expense').map(t => t.date).sort()[0];
  if (!first) return null;
  const from = addDays(d, -30) > first ? addDays(d, -30) : first;
  const days: number[] = [];
  for (let x = from; x < d; x = addDays(x, 1)) days.push(daySpend(book, x));
  if (days.length < 7) return null;
  const nz = days.filter(v => v > 0).sort((a, b) => a - b);
  if (!nz.length) return null;
  return nz[Math.floor(nz.length / 2)];
}
export function buildPace(book: Book, now = today()): Pace[] {
  const out: Pace[] = [];
  const cycles = getCycles(book);
  const i = currentCycleIndex(cycles, now);
  const c = cycles[i];
  if (c && !c.end) {
    const txs = book.txs.filter(t => t.date >= c.start && t.date <= now);
    const t = totals(txs);
    const spendable = t.income - t.savings;
    const closed = cycles.slice(0, i).map(x => daysBetween(x.start, x.end!) + 1);
    const len = closed.length ? Math.round(closed.reduce((a, b) => a + b, 0) / closed.length) : 30;
    const day = daysBetween(c.start, now) + 1;
    if (spendable > 0 && t.expenses > 0) {
      const spentShare = t.expenses / spendable, timeShare = Math.min(1, day / len);
      const perDay = t.expenses / day;
      const outDate = addDays(c.start, Math.floor(spendable / perDay));
      const left = spendable - t.expenses;
      if (left <= 0) out.push({ tone: 'alert', title: 'This cycle\'s income is used up', text: `You have spent ${fmtMoney(t.expenses)} against ${fmtMoney(spendable)} available after savings. Anything more comes out of older balances.` });
      else if (spentShare >= 0.9) out.push({ tone: 'alert', title: 'Almost nothing left from this salary', text: `${pct(t.expenses, spendable)}% is spent on day ${day}. Only ${fmtMoney(left)} remains until the next salary.` });
      else if (spentShare > timeShare + 0.15) out.push({ tone: 'warn', title: 'Money is going fast', text: `${pct(t.expenses, spendable)}% of this cycle's money is spent in ${day} of about ${len} days. At this rate it runs out around ${fmtDate(outDate)}. To last the cycle, keep to about ${fmtMoney(Math.floor(left / Math.max(1, len - day)))} a day.` });
      else if (day >= 5 && spentShare < timeShare - 0.1) out.push({ tone: 'good', title: 'You are ahead of pace', text: `Day ${day} of about ${len}, and only ${pct(t.expenses, spendable)}% of this cycle's money is spent. ${fmtMoney(left)} is still in hand.` });
      else out.push({ tone: 'neutral', title: 'Spending is on pace', text: `${pct(t.expenses, spendable)}% spent on day ${day} of about ${len}. About ${fmtMoney(Math.floor(left / Math.max(1, len - day)))} a day keeps you on track.` });
    }
  }
  // Day-by-day: yesterday is complete, so judge that; today only gets a warning if it is already heavy.
  const y = addDays(now, -1);
  const usualY = usualDay(book, y), usualT = usualDay(book, now);
  if (usualY) {
    const spent = daySpend(book, y);
    if (spent <= usualY * 0.6) {
      let streak = 1;
      for (let d = addDays(y, -1); streak < 30; d = addDays(d, -1)) { const u = usualDay(book, d); if (!u || daySpend(book, d) > u * 0.6) break; streak++; }
      out.push({ tone: 'good', title: spent === 0 ? 'Congratulations, a no-spend day' : 'Congratulations, a light day', text: `Yesterday you spent ${fmtMoney(spent)} against your usual ${fmtMoney(usualY)} a day.${streak > 1 ? ` That is ${streak} light days in a row.` : ''}` });
    } else if (spent >= usualY * 2.5) out.push({ tone: 'warn', title: 'Yesterday was a heavy day', text: `You spent ${fmtMoney(spent)}, against your usual ${fmtMoney(usualY)} a day.` });
  }
  if (usualT) {
    const spent = daySpend(book, now);
    if (spent >= usualT * 2.5) out.push({ tone: 'warn', title: 'Today is running heavy', text: `${fmtMoney(spent)} spent so far today, against your usual ${fmtMoney(usualT)} a day.` });
  }
  return out;
}
export const memberName = (book: Book, id?: string) => (book.members || []).find(m => m.id === id)?.name || '';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
