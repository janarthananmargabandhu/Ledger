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
export interface Tip { id: string; text: string; by?: string; at: string; }
export interface Book {
  accounts: Account[];
  categories: Category[];
  txs: Tx[];
  settings: { hasSample: boolean; voiceLang?: 'ta' | 'en'; cycleBy?: string; water?: { last: string; streak: number }; tips?: Tip[] };  // water: money plant watering streak  // cycleBy: member whose salary starts a cycle ('' = anyone)
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
    case 'currentCycle': return cycles.length ? cyc(cur, 'Current salary cycle') : { from: MIN, to: MAX, label: 'Everything recorded', title: 'All time, no salary recorded yet', open: true };
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
  const ds = dailyStats(txs, r, now);
  if (ds && ds.days > 1) out.push({ tone: 'neutral', text: `You spend about ${fmtMoney(Math.round(ds.avg))} a day on average ${where}, and a usual day costs ${fmtMoney(Math.round(ds.median))}.` });
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

// ---------- Cycle status: the numbers behind the Home screen ----------
export interface CycleStatus {
  start: string; day: number; len: number; daysLeft: number; nextSalary: string;
  income: number; expenses: number; savings: number; spendable: number; left: number; perDay: number;
  spentShare: number; timeShare: number; todaySpent: number; usual: number | null;
}
/** Where the current salary cycle stands today. Null until a salary has been recorded. */
export function cycleStatus(book: Book, now = today()): CycleStatus | null {
  const cycles = getCycles(book);
  const i = currentCycleIndex(cycles, now);
  const c = cycles[i];
  if (!c || c.end) return null;
  const t = totals(book.txs.filter(x => x.date >= c.start && x.date <= now));
  const closed = cycles.slice(0, i).map(x => daysBetween(x.start, x.end!) + 1);
  const len = Math.max(7, closed.length ? Math.round(closed.reduce((a, b) => a + b, 0) / closed.length) : 30);
  const day = daysBetween(c.start, now) + 1;
  const daysLeft = Math.max(1, len - day + 1);
  const spendable = t.income - t.savings;
  const left = spendable - t.expenses;
  return {
    start: c.start, day, len, daysLeft, nextSalary: addDays(c.start, len),
    income: t.income, expenses: t.expenses, savings: t.savings, spendable, left,
    perDay: left > 0 ? Math.floor(left / daysLeft) : 0,
    spentShare: spendable > 0 ? Math.min(1, t.expenses / spendable) : 0,
    timeShare: Math.min(1, day / len),
    todaySpent: book.txs.reduce((s, x) => (x.type === 'expense' && x.date === now ? s + x.amount : s), 0),
    usual: usualDay(book, now),
  };
}

// ---------- Quick picks: the expenses you log again and again ----------
export interface QuickPick { description: string; categoryId: string; amount: number; accountId: string; count: number; }
/** Most frequent expense descriptions of the last 60 days, with their usual amount and account. */
export function quickPicks(book: Book, max = 8, now = today()): QuickPick[] {
  const from = addDays(now, -60);
  const m = new Map<string, { d: string; cat: string; amounts: number[]; acc: string; count: number; last: number }>();
  for (const t of sortAsc(book.txs)) {
    if (t.type !== 'expense' || t.date < from || !t.description.trim()) continue;
    const k = t.description.trim().toLowerCase();
    const e = m.get(k) || { d: t.description.trim(), cat: t.categoryId, amounts: [], acc: t.accountId, count: 0, last: 0 };
    e.amounts.push(t.amount); e.cat = t.categoryId; e.acc = t.accountId; e.count++; e.last = t.createdAt; m.set(k, e);
  }
  return [...m.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, max)
    .map(e => { const s = [...e.amounts].sort((a, b) => a - b); return { description: e.d, categoryId: e.cat, amount: s[Math.floor(s.length / 2)], accountId: e.acc, count: e.count }; });
}

// ---------- Salary repair: turn an entry into the salary, and pull early expenses into the cycle ----------
/** Large entries that might really be a salary recorded the wrong way (last 60 days, not already salary). */
export function salaryCandidates(book: Book, now = today()): Tx[] {
  const from = addDays(now, -60);
  return book.txs.filter(t => t.date >= from && !isSalary(t) && t.type !== 'transfer' && (t.type === 'income' || t.amount >= 5000))
    .sort((a, b) => (a.type === 'income' ? 0 : 1) - (b.type === 'income' ? 0 : 1) || b.amount - a.amount).slice(0, 4);
}
/** Expenses dated before the first salary (within 31 days of it) that no cycle covers. */
export function earlyExpenses(book: Book, salaryDate?: string): { from: string; count: number; total: number } | null {
  const first = salaryDate || getCycles(book)[0]?.start;
  if (!first) return null;
  const prevSalary = book.txs.filter(t => isSalary(t) && t.date < first).map(t => t.date).sort().pop();
  const floor = prevSalary && prevSalary > addDays(first, -31) ? addDays(prevSalary, 1) : addDays(first, -31);
  if (prevSalary && getCycles(book).some(c => c.start === prevSalary)) return null;
  const early = book.txs.filter(t => t.type === 'expense' && t.date < first && t.date >= floor);
  if (!early.length) return null;
  return { from: early.map(t => t.date).sort()[0], count: early.length, total: early.reduce((s, t) => s + t.amount, 0) };
}

// ---------- Sparks: short, true, encouraging reads of your own numbers ----------
export interface Spark { emoji: string; kicker: string; big: string; text: string; tone: 'lime' | 'sky' | 'sun' | 'rose' | 'mint' | 'dawn' | 'night'; weight: number; kind?: 'stat' | 'fact' | 'quote'; }
// Original lines written for this app, so they can be shown freely.
export const QUOTES = [
  'Small entries, big clarity. Every rupee you log is a decision you get to make on purpose.',
  'You are not tracking money. You are building the habit that grows it.',
  'Payday is a fresh page. How this cycle ends is still being written, by you.',
  'Wealth is mostly quiet days. A light day today is a gift to next month.',
  'Knowing where it went is the first step to choosing where it goes.',
  'Consistency beats intensity. Open, log, close. That is the whole trick.',
  'Every saved rupee is future freedom, paid in advance.',
  'You do not need a perfect month. You need a slightly better one.',
  'The goal is not to spend nothing. It is to spend on what matters to you.',
  'Progress, not pressure. Look how far your numbers have come.',
  'Good morning. Today is a new chance to spend with intention and save with pride.',
  'A seed does not grow in a day, and neither does wealth. Water it daily.',
  'The best time to start saving was yesterday. The next best time is this morning.',
  'Rich is a feeling of enough. Grow the enough, and the feeling follows.',
  'Your future self is watching today\'s choices. Make them proud.',
  'Discipline is just remembering what you want most.',
  'Money is a tool. Today, you decide what it builds.',
  'Tiny savings, repeated, become a mountain you can stand on.',
  'Do not wait to feel rich to act wisely. Act wisely and you will feel rich.',
  'Every bill paid on time is a promise kept to yourself.',
  'Calm money is a gift you give your whole family.',
  'One mindful choice today is worth more than a perfect plan for tomorrow.',
  'Spend like a gardener: plant first, harvest later.',
  'Clarity is a superpower. You have it in your pocket.',
  'Earn with energy. Spend with thought. Save with joy.',
  'This morning, choose one thing you will not spend on, and one dream you will fund.',
  'Grow slow, grow steady, grow with purpose.',
  'Your salary is not your wealth. What you keep is.',
  'Abundance starts with attention.',
  'Rise, log, thrive. Let\'s make today count.',
];
const lakh = (n: number) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} lakh` : fmtMoney(Math.round(n)));
/** General facts: arithmetic and well-settled history only. */
export const FACTS: { emoji: string; kicker: string; big: string; text: string }[] = [
  { emoji: '⏳', kicker: 'The rule of 72', big: '72 ÷ rate', text: 'Divide 72 by a yearly return to see how many years money takes to double. At 8% a year it doubles in about 9 years.' },
  { emoji: '☕', kicker: 'Small spends add up', big: '₹100 a day', text: 'Saving ₹100 a day puts away ₹36,500 in a year, before any interest.' },
  { emoji: '📈', kicker: 'The magic of compounding', big: '₹1,000 a month', text: `Invested every month for 20 years at 10% a year, it can grow to about ${lakh(1000 * ((Math.pow(1 + 0.1 / 12, 240) - 1) / (0.1 / 12)))}. You would have put in only ₹2.4 lakh.` },
  { emoji: '🎈', kicker: 'Inflation, quietly', big: '12 years', text: 'At 6% inflation, prices double in about 12 years. Money kept idle loses half its buying power in that time.' },
  { emoji: '🏛️', kicker: 'India money history', big: '1935', text: 'The Reserve Bank of India was set up on 1 April 1935. It issues India\'s currency notes.' },
  { emoji: '₹', kicker: 'The rupee sign', big: '2010', text: 'India adopted the ₹ symbol in 2010, making the rupee one of the few currencies with its own sign.' },
  { emoji: '🪙', kicker: 'Paise went decimal', big: '1957', text: 'Before 1957, a rupee was 16 annas or 64 pice. Since 1 April 1957 it has been 100 paise.' },
  { emoji: '📱', kicker: 'UPI is young', big: '2016', text: 'UPI launched in 2016. In a few years it changed how India pays for everything from tea to rent.' },
  { emoji: '📜', kicker: 'Paper money began in China', big: '~1,000 years', text: 'The first widely used paper money appeared in China about a thousand years ago, during the Song dynasty.' },
  { emoji: '🧮', kicker: 'The 50-30-20 idea', big: '50 · 30 · 20', text: 'A simple budget split: about half of income for needs, 30% for wants, 20% for savings. Adjust it to your life.' },
  { emoji: '🛟', kicker: 'Emergency fund', big: '3 to 6 months', text: 'A common guideline is to keep three to six months of expenses aside for surprises, so a bad month never becomes debt.' },
  { emoji: '🎯', kicker: 'Pay yourself first', big: 'Save first', text: 'Moving savings out on payday, before spending begins, is one of the simplest habits that reliably builds wealth.' },
  { emoji: '💳', kicker: 'Credit card interest', big: '~3% a month', text: 'Unpaid card balances often cost around 3% a month, which is over 40% a year. Paying the full bill avoids it entirely.' },
  { emoji: '🧾', kicker: '₹20 twice a day', big: '₹14,600 a year', text: 'Two ₹20 spends every day add up to ₹14,600 a year. Small habits are big numbers in disguise.' },
];
const ENCOURAGE = QUOTES;
const daySpendOf = (book: Book, d: string) => book.txs.reduce((s, t) => (t.type === 'expense' && t.date === d ? s + t.amount : s), 0);
export function buildSparks(book: Book, now = today()): Spark[] {
  const out: Spark[] = [];
  const cycles = getCycles(book);
  const ci = currentCycleIndex(cycles, now);
  const c = cycles[ci];
  // Logging streak: consecutive days, ending today or yesterday, with at least one entry.
  const logged = new Set(book.txs.map(t => t.date));
  let streak = 0;
  for (let d = logged.has(now) ? now : addDays(now, -1); logged.has(d) && streak < 400; d = addDays(d, -1)) streak++;
  if (streak >= 3) out.push({ emoji: '🔥', kicker: 'Logging streak', big: `${streak} days`, text: `You have recorded something every day for ${streak} days. That habit is what makes every other number here honest.`, tone: 'sun', weight: Math.min(9, 3 + streak / 3) });
  // Light-day streak against your usual day.
  let light = 0;
  for (let d = addDays(now, -1); light < 60; d = addDays(d, -1)) { const u = usualDay(book, d); if (!u || daySpendOf(book, d) > u * 0.6) break; light++; }
  if (light >= 2) out.push({ emoji: '🌱', kicker: 'Light days in a row', big: `${light}`, text: `${light} days in a row below your usual spend. Keep it to one more and the streak grows.`, tone: 'mint', weight: 6 + light });
  if (c) {
    const txs = book.txs.filter(t => t.date >= c.start && t.date <= now);
    const t = totals(txs);
    const day = daysBetween(c.start, now) + 1;
    const noSpend = Array.from({ length: day }, (_, k) => addDays(c.start, k)).filter(d => d <= now && d < now && daySpendOf(book, d) === 0).length;
    if (noSpend >= 1) out.push({ emoji: '🛡️', kicker: 'No-spend days this cycle', big: `${noSpend}`, text: `${noSpend} full day${noSpend === 1 ? '' : 's'} this cycle without spending a rupee. Those days quietly fund your goals.`, tone: 'sky', weight: 4 + noSpend });
    if (t.income > 0 && t.savings > 0) {
      const rate = pct(t.savings, t.income);
      out.push({ emoji: '💰', kicker: 'Saved this cycle', big: fmtMoney(t.savings), text: `That is ${rate}% of this cycle's income set aside first. At this rate that is about ${fmtMoney(t.savings * 12)} in a year.`, tone: 'lime', weight: 5 + rate / 10 });
    }
    const spendable = t.income - t.savings;
    if (!c.end && spendable > 0 && t.expenses > 0) {
      const closed = cycles.slice(0, ci).map(x => daysBetween(x.start, x.end!) + 1);
      const len = Math.max(7, closed.length ? Math.round(closed.reduce((a, b) => a + b, 0) / closed.length) : 30);
      const ahead = Math.round(spendable * Math.min(1, day / len) - t.expenses);
      if (ahead > 0) out.push({ emoji: '🚀', kicker: 'Ahead of pace', big: fmtMoney(ahead), text: `You have spent ${fmtMoney(ahead)} less than an even pace would by day ${day}. That is room you have earned.`, tone: 'lime', weight: 7 });
    }
    // Wins against the same point of the previous cycle.
    const prev = cycles[ci - 1];
    if (prev) {
      const cut = addDays(prev.start, day - 1);
      const pTxs = book.txs.filter(x => x.date >= prev.start && x.date <= (cut < (prev.end || cut) ? cut : prev.end!));
      const pt = totals(pTxs);
      const diff = pt.expenses - t.expenses;
      if (pt.expenses > 0 && diff > 0) out.push({ emoji: '📉', kicker: 'Better than last cycle', big: fmtMoney(diff), text: `Less spent than at the same point of your previous cycle (${fmtMoney(pt.expenses)} by day ${day}).`, tone: 'mint', weight: 8 });
      const pc = new Map(spendByCategory(pTxs, book).map(x => [x.id, x.amount]));
      let best: { name: string; icon: string; d: number } | null = null;
      for (const [id, amt] of pc) { const now2 = spendByCategory(txs, book).find(x => x.id === id)?.amount || 0; const d = amt - now2; if (d > 0 && (!best || d > best.d)) { const cc = catOf(book, id); best = { name: cc.name, icon: cc.icon, d }; } }
      if (best && best.d >= 100) out.push({ emoji: best.icon, kicker: `${best.name} is down`, big: fmtMoney(best.d), text: `${fmtMoney(best.d)} less on ${best.name} than at this point last cycle. Whatever you changed, it is working.`, tone: 'sky', weight: 6 });
    }
  }
  const savedAll = book.txs.reduce((s, t) => (t.type === 'savings' ? s + t.amount : s), 0);
  if (savedAll > 0) out.push({ emoji: '🏦', kicker: 'Saved since you started', big: fmtMoney(savedAll), text: `Every savings entry adds up. This is money you chose to keep for your future self.`, tone: 'rose', weight: 4 });
  // A fact from your own spending: what a frequent small habit costs over a year.
  const habit = quickPicks(book, 6, now).filter(p => p.count >= 4 && p.amount <= 500)[0];
  if (habit) { const yr = Math.round(habit.amount * habit.count * (365 / 60) / 10) * 10; out.push({ kind: 'fact', emoji: catOf(book, habit.categoryId).icon, kicker: `Your ${habit.description} habit`, big: `${fmtMoney(yr)} a year`, text: `About ${habit.count} times in the last 60 days at ${fmtMoney(habit.amount)}. Worth it? Your call. Knowing the number is the power.`, tone: 'sky', weight: 5 }); }
  return out;
}

/** A random pick from a list, different each time the app opens. */
export const pickRandom = <T,>(list: T[], n: number): T[] => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
export const factSpark = (f: typeof FACTS[number]): Spark => ({ ...f, kind: 'fact', tone: 'rose', weight: 3 });
export const quoteSpark = (morning: boolean): Spark => ({ kind: 'quote', emoji: morning ? '🌅' : '✨', kicker: morning ? 'Morning thought' : 'Thought for now', big: '', text: pickRandom(QUOTES, 1)[0], tone: morning ? 'dawn' : 'night', weight: 10 });

// ---------- Daily average: how much a typical day costs in a period ----------
/** Single payments this size or more (rent, family support, big purchases) are left out of the everyday average. */
export const BIG_PAYMENT = 2000;
export interface DailyStats {
  days: number; total: number; avg: number; median: number; noSpend: number; everydayAvg: number; bigCount: number; bigTotal: number;
  top: { date: string; amount: number } | null;
  byDow: number[]; weekdayAvg: number; weekendAvg: number; from: string; to: string;
}
/** Expenses only. Counts every calendar day in the period up to today, including days with no spending. */
export function dailyStats(txs: Tx[], r: Range, now = today()): DailyStats | null {
  const exp = txs.filter(t => t.type === 'expense');
  if (r.empty || !exp.length) return null;
  const dates = exp.map(t => t.date).sort();
  const from = r.from.startsWith('0000') ? dates[0] : r.from;
  const end = r.to.startsWith('9999') || r.to > now ? (dates[dates.length - 1] > now ? dates[dates.length - 1] : now) : r.to;
  if (from > end) return null;
  const per = new Map<string, number>();
  for (const t of exp) if (t.date >= from && t.date <= end) per.set(t.date, (per.get(t.date) || 0) + t.amount);
  const all: { date: string; amount: number }[] = [];
  for (let d = from; d <= end && all.length < 3700; d = addDays(d, 1)) all.push({ date: d, amount: per.get(d) || 0 });
  const total = all.reduce((s, x) => s + x.amount, 0);
  const sorted = all.map(x => x.amount).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const dowSum = [0, 0, 0, 0, 0, 0, 0], dowN = [0, 0, 0, 0, 0, 0, 0];
  for (const x of all) { const w = parse(x.date).getDay(); dowSum[w] += x.amount; dowN[w]++; }
  const byDow = dowSum.map((s, i) => (dowN[i] ? s / dowN[i] : 0));
  const wk = all.filter(x => { const w = parse(x.date).getDay(); return w > 0 && w < 6; });
  const we = all.filter(x => { const w = parse(x.date).getDay(); return w === 0 || w === 6; });
  const avgOf = (a: { amount: number }[]) => (a.length ? a.reduce((s, x) => s + x.amount, 0) / a.length : 0);
  const top = all.reduce<{ date: string; amount: number } | null>((m, x) => (x.amount > (m?.amount || 0) ? x : m), null);
  const big = exp.filter(t => t.date >= from && t.date <= end && t.amount >= BIG_PAYMENT);
  const bigTotal = big.reduce((s2, t) => s2 + t.amount, 0);
  return { everydayAvg: (total - bigTotal) / all.length, bigCount: big.length, bigTotal, days: all.length, total, avg: total / all.length, median, noSpend: all.filter(x => x.amount === 0).length, top, byDow, weekdayAvg: avgOf(wk), weekendAvg: avgOf(we), from, to: end };
}


// ---------- Welcome: the money plant and the good news shown when the app opens ----------
export interface Plant { stage: number; name: string; rate: number; saved: number; income: number; streak: number; wateredToday: boolean; next: string; }
const STAGES = ['Seed', 'Sprout', 'Young plant', 'Leafy plant', 'Flowering', 'Money tree'];
const STEPS = [0, 0.0001, 0.05, 0.1, 0.2, 0.3];
/** The plant grows with the share of this cycle's income put into savings. Watering is a daily streak on top. */
export function moneyPlant(book: Book, now = today()): Plant {
  const cycles = getCycles(book), c = cycles[currentCycleIndex(cycles, now)];
  const t = c ? totals(book.txs.filter(x => x.date >= c.start && x.date <= now)) : { income: 0, savings: 0, expenses: 0, count: 0 };
  const rate = t.income > 0 ? t.savings / t.income : 0;
  let stage = 0; STEPS.forEach((v, i) => { if (t.income > 0 && rate >= v && (i > 0 ? t.savings > 0 : true)) stage = i; });
  const w = book.settings.water;
  const alive = !!w && (w.last === now || w.last === addDays(now, -1));
  const nextStep = STEPS[stage + 1];
  const next = !c ? 'Record your salary to plant your seed.'
    : nextStep === undefined ? 'Fully grown. Keep saving to keep it this way.'
    : `Save ${fmtMoney(Math.max(1, Math.ceil(nextStep * t.income - t.savings)))} more this cycle to reach ${STAGES[stage + 1]}.`;
  return { stage, name: STAGES[stage], rate, saved: t.savings, income: t.income, streak: alive ? w!.streak : 0, wateredToday: !!w && w.last === now, next };
}
export function waterPlant(book: Book, now = today()): Book {
  const w = book.settings.water;
  if (w && w.last === now) return book;
  const streak = w && w.last === addDays(now, -1) ? w.streak + 1 : 1;
  return { ...book, settings: { ...book.settings, water: { last: now, streak } } };
}
// ---------- Saving tips: a starter set, plus the ones the family adds ----------
export const STARTER_TIPS = [
  'Wait 24 hours before any non-essential buy over ₹1,000. Most of the urge passes.',
  'Move your savings on salary day, before you spend anything. Spend what is left, not save what is left.',
  'Cook one extra meal at home each week instead of ordering in. That alone can save ₹2,000 a month.',
  'Check your subscriptions today. Cancel the ones you did not open last month.',
  'Carry a water bottle. Small daily buys like bottled water and tea add up fast.',
  'Buy groceries with a list, and never shop hungry.',
  'Compare the price per kg, not the pack price. Bigger is not always cheaper.',
  'Pay credit card bills in full every month. Interest wipes out every discount you got.',
  'Set a weekly cash limit for small spends. When it is gone, wait for next week.',
  'Unsubscribe from shopping app notifications. Fewer sale alerts, fewer buys.',
  'Switch off lights, fans and the geyser when not needed. It shows up on the electricity bill.',
  'Plan festival and birthday spending at the start of the month so it does not surprise you.',
  'Before buying, ask: will I use this at least 10 times?',
  'Keep an emergency fund of 3 months of expenses, so a surprise never becomes a loan.',
  'Round up every expense in your head. The difference is your bonus savings.',
];
/** One tip per day, alternating between the family's own tips and the starter set. */
export function tipsFor(book: Book): { text: string; by?: string; own: boolean }[] {
  const own = (book.settings.tips || []).map(t => ({ text: t.text, by: t.by, own: true }));
  const base = STARTER_TIPS.map(text => ({ text, own: false }));
  const out: { text: string; by?: string; own: boolean }[] = [];
  for (let i = 0; i < Math.max(own.length, base.length); i++) { if (own[i]) out.push(own[i]); if (base[i]) out.push(base[i]); }
  return out;
}
export const dayIndex = (n: number, now = today()) => (n ? Math.floor(parse(now).getTime() / 864e5) % n : 0);
export function addTip(book: Book, text: string, by?: string, now = today()): Book {
  const t: Tip = { id: uid(), text: text.trim().slice(0, 160), at: now, ...(by ? { by } : {}) };
  return { ...book, settings: { ...book.settings, tips: [t, ...(book.settings.tips || [])].slice(0, 60) } };
}
