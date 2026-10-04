import React, { useMemo, useState } from 'react';
import {
  Account, Book, Gran, METHODS, Range, SALARY, OTHER, TYPES, Tx, accOf, addDays, applyFilters, buildInsights, catOf, computeBalances, currentCycleIndex,
  cycleLabel, daysBetween, buildPace, memberName, effect, fmtDate, fmtMoney, fmtMonth, getCycles, makeBuckets, monthEnd, monthKeys, pct, signedAmount, sortAsc, spendByAccount,
  spendByCategory, sumIn, today, totals,
} from './logic';
import { store, normalise } from './store';
import { emptyBook, sampleBook } from './sample';
import { BarChart, Donut, HBars, colorAt, Series } from './charts';
import { Empty, Field, FilterBar, Icon, Money, Panel, PeriodSelect, PeriodStepper, useApp } from './ui';
import { AccountForm, CategoryForm } from './forms';

const typeLabel = (t: Tx) => TYPES.find(x => x.id === t.type)!.label;
const methodLabel = (t: Tx) => METHODS.find(x => x.id === t.method)?.label || 'Other';

// ---------- Transaction table ----------
export function TxTable({ txs, limit, compact }: { txs: Tx[]; limit?: number; compact?: boolean }) {
  const { book, bal, filters, editTx, confirm, toast } = useApp();
  const rows = useMemo(() => sortAsc(txs).reverse().slice(0, limit), [txs, limit]);
  const view = filters.accountId !== 'all' ? filters.accountId : undefined;
  const family = (book.members || []).length > 1;
  const del = (t: Tx) => confirm({
    title: 'Delete this transaction?', body: `${t.description}, ${fmtMoney(Math.abs(t.amount))} on ${fmtDate(t.date, true)}. Balances will be recalculated.`, action: 'Delete transaction', danger: true,
    run: () => { const b = store.get(); store.set({ ...b, txs: b.txs.filter(x => x.id !== t.id) }); toast('Transaction deleted'); },
  });
  if (!rows.length) return <Empty title="No transactions here" body="Nothing matches this period and these filters. Change the filters, or add a transaction." action={<button className="btn" onClick={() => editTx()}>Add transaction</button>} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th>{!compact && <><th>Type</th><th>Method</th></>}<th className="r">Amount</th><th className="r">Balance</th>{!compact && <th className="r">Actions</th>}</tr></thead>
        <tbody>
          {rows.map(t => {
            const c = catOf(book, t.categoryId);
            const toView = t.type === 'transfer' && view === t.toAccountId;
            const amt = signedAmount(t, view);
            const balance = toView ? bal.afterTo[t.id] : bal.after[t.id];
            const acct = t.type === 'transfer' ? `${accOf(book, t.accountId)?.name || '?'} → ${accOf(book, t.toAccountId)?.name || '?'}` : accOf(book, t.accountId)?.name || 'Deleted account';
            return (
              <tr key={t.id}>
                <td className="nowrap">{fmtDate(t.date, t.date.slice(0, 4) !== today().slice(0, 4))}</td>
                <td><span className="desc">{t.description}</span>{(t.notes || (family && t.by)) && <span className="sub">{[family ? memberName(book, t.by) : '', t.notes].filter(Boolean).join(', ')}</span>}</td>
                <td className="nowrap">{acct}</td>
                <td className="nowrap"><span className="emoji">{c.icon}</span>{c.name}</td>
                {!compact && <><td><span className={'tag ' + t.type}>{typeLabel(t)}</span></td><td className="nowrap muted">{methodLabel(t)}</td></>}
                <td className="r"><Money n={amt} signed /></td>
                <td className="r">{balance !== undefined ? <Money n={balance} plain /> : ''}</td>
                {!compact && <td className="r nowrap">
                  <button className="icon-btn" onClick={() => editTx(t)} aria-label={`Edit ${t.description}`}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn" onClick={() => del(t)} aria-label={`Delete ${t.description}`}><Icon name="trash" size={16} /></button>
                </td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Spreadsheet-style account sheet ----------
export function Sheet({ account, range, actions }: { account: Account; range: Range; actions?: React.ReactNode }) {
  const { book, bal, editTx } = useApp();
  const rows = sortAsc(book.txs.filter(t => (t.accountId === account.id || t.toAccountId === account.id) && t.date >= range.from && t.date <= range.to));
  const allTime = range.from.startsWith('0000') || !!range.empty;
  const start = allTime ? account.opening : computeBalances(book, addDays(range.from, -1)).byAccount[account.id];
  let run = start;
  return (
    <div className="sheet">
      <div className="sheet-head"><div><h4>{account.name}</h4><span className="num">{fmtMoney(bal.byAccount[account.id])}</span></div>{actions}</div>
      <div className="sheet-body">
        <table>
          <thead><tr><th>Entry</th><th className="r">Money</th><th className="r">Balance</th></tr></thead>
          <tbody>
            <tr className="carry"><td>{allTime ? 'Opening balance' : `Balance on ${fmtDate(range.from)}`}</td><td /><td className="r num">{fmtMoney(start)}</td></tr>
            {rows.map(t => {
              const e = effect(t, account.id); run += e;
              const label = t.type === 'transfer' ? `${t.description} (${t.accountId === account.id ? 'to ' + (accOf(book, t.toAccountId)?.name || '?') : 'from ' + (accOf(book, t.accountId)?.name || '?')})` : t.description;
              return <tr key={t.id} onClick={() => editTx(t)} title="Edit this transaction"><td><span className="when">{fmtDate(t.date)}</span>{label}</td><td className="r"><Money n={e} signed /></td><td className="r num">{fmtMoney(run)}</td></tr>;
            })}
            {!rows.length && <tr className="none"><td colSpan={3}>No entries in this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function TrendPanel({ txs }: { txs: Tx[] }) {
  const { book, range } = useApp();
  const [gran, setGran] = useState<Gran>('day');
  const [compare, setCompare] = useState<string[]>([]);
  const spend = txs.filter(t => t.type === 'expense');
  const buckets = makeBuckets(range, gran, book, spend);
  const cats = spendByCategory(spend, book);
  const picked = compare.filter(id => cats.some(c => c.id === id));
  const series: Series[] = picked.length
    ? picked.map(id => ({ name: catOf(book, id).name, color: colorAt(cats.findIndex(c => c.id === id)), values: buckets.map(b => sumIn(spend, b, t => t.categoryId === id)) }))
    : [{ name: 'Spending', color: 'var(--accent)', values: buckets.map(b => sumIn(spend, b, () => true)) }];
  const toggle = (id: string) => setCompare(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id].slice(-4)));
  return (
    <Panel title="Spending trend" note={picked.length ? 'Comparing the selected categories' : 'All expenses. Pick categories below to compare them.'}
      right={<div className="seg" role="group" aria-label="Group by">{(['day', 'week', 'month', 'cycle'] as Gran[]).map(g => <button key={g} className={gran === g ? 'on' : ''} onClick={() => setGran(g)}>{g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : g === 'month' ? 'Monthly' : 'Salary cycle'}</button>)}</div>}>
      {spend.length && buckets.length ? <>
        <BarChart labels={buckets.map(b => b.label)} series={series} />
        <div className="chips">{cats.slice(0, 8).map((c, i) => <button key={c.id} className={'chip' + (picked.includes(c.id) ? ' on' : '')} onClick={() => toggle(c.id)}><i style={{ background: colorAt(i) }} />{c.name}</button>)}</div>
      </> : <Empty title="No spending to chart" body="Expenses in this period will appear here as you record them." />}
    </Panel>
  );
}

export function Dashboard() {
  const { book, bal, filters, range, setFilters, go, editTx, quickAdd, confirm, toast } = useApp();
  const txs = useMemo(() => applyFilters(book, filters, range), [book, filters, range]);
  const t = totals(txs);
  const cats = spendByCategory(txs, book);
  const insights = useMemo(() => buildInsights(book, filters, range), [book, filters, range]);
  const now = today();
  const ended = !range.empty && range.to < now;
  const endBal = ended ? computeBalances(book, range.to) : bal;
  const balance = filters.accountId === 'all' ? endBal.total : endBal.byAccount[filters.accountId] ?? 0;
  const acctName = filters.accountId === 'all' ? 'all accounts' : accOf(book, filters.accountId)?.name;
  const dayN = range.cycleIndex !== undefined && !ended && range.from <= now ? daysBetween(range.from, now) + 1 : null;
  const left = t.income - t.expenses - t.savings;
  const pace = useMemo(() => buildPace(book), [book]);
  const members = book.members || [];
  const perMember = members.length > 1 ? members.map(m => { const mt = totals(txs.filter(x => x.by === m.id)); return { ...m, ...mt, salary: txs.filter(x => x.by === m.id && x.type === 'income' && x.categoryId === SALARY).reduce((a, x) => a + x.amount, 0) }; }) : [];

  if (!book.accounts.length) return (
    <Empty title="Start with your accounts" body="Add each place your money sits (cash, Canara, Kotak) with its current balance. Then record your salary to begin your first salary cycle."
      action={<button className="btn primary" onClick={() => go('accounts')}>Add your first account</button>} />
  );
  const clearSample = () => confirm({
    title: 'Delete the sample data?', body: 'This removes the demo transactions and the three demo accounts so you can start with your own numbers. Anything you added yourself is kept.', action: 'Delete sample data', danger: true,
    run: () => { removeSample(); toast('Sample data deleted'); },
  });
  return (
    <>
      {book.settings.hasSample && <div className="banner"><span>You are looking at sample data from September 2026.</span><button className="btn small" onClick={clearSample}>Delete sample data and start fresh</button></div>}
      <div className="hero">
        <div className="hero-period">
          <p className="hero-title">{range.title}</p>
          <div className="hero-range"><h2>{range.label}</h2><PeriodStepper /></div>
          {range.empty
            ? <p className="note">Record an income in the Salary category and its date starts your first cycle. <button className="link" onClick={() => editTx({ type: 'income', categoryId: SALARY, description: 'Salary' })}>Record salary</button></p>
            : <p className="note">{dayN ? `Day ${dayN} of this cycle. It stays open until you record your next salary.` : `${t.count} transaction${t.count === 1 ? '' : 's'} in this period`}</p>}
        </div>
        <div className="hero-balance">
          <p className="hero-title">{ended ? `Balance on ${fmtDate(range.to)}` : 'Balance now'}, {acctName}</p>
          <p className="hero-num num">{fmtMoney(balance)}</p>
        </div>
      </div>
      {pace.length > 0 && <div className="pace">{pace.map((p, k) => <div key={k} className={'pace-card ' + p.tone}><strong>{p.title}</strong><p>{p.text}</p></div>)}</div>}
      <FilterBar />
      <div className="stats">
        <div className="stat"><p>Income</p><strong className="num pos">{fmtMoney(t.income)}</strong></div>
        <div className="stat"><p>Expenses</p><strong className="num neg">{fmtMoney(t.expenses)}</strong>{t.income > 0 && <span>{pct(t.expenses, t.income)}% of income</span>}</div>
        <div className="stat"><p>Savings</p><strong className="num">{fmtMoney(t.savings)}</strong>{t.income > 0 && t.savings > 0 && <span>{pct(t.savings, t.income)}% of income</span>}</div>
        <div className="stat"><p>Left from income</p><strong className={'num' + (left < 0 ? ' neg' : '')}>{fmtMoney(left)}</strong><span>after expenses and savings</span></div>
        <div className="stat"><p>Transactions</p><strong className="num">{t.count}</strong></div>
      </div>
      {insights.length > 0 && <Panel title="What stands out"><ul className="insights">{insights.map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}</ul></Panel>}
      {perMember.length > 0 && <Panel title="Family" note={`Everyone's salaries add up to the family income for this period: ${perMember.filter(m => m.salary > 0).map(m => `${m.name} ${fmtMoney(m.salary)}`).join(' + ') || 'no salary recorded yet'}${perMember.filter(m => m.salary > 0).length > 1 ? ` = ${fmtMoney(perMember.reduce((a, m) => a + m.salary, 0))}` : ''}.`} className="flush-body">
        <div className="table-wrap"><table className="table"><thead><tr><th>Member</th><th className="r">Income brought in</th><th className="r">Expenses entered</th><th className="r">Savings</th><th className="r">Entries</th></tr></thead>
          <tbody>{perMember.map(m => <tr key={m.id}><td>{m.name}</td><td className="r num pos">{fmtMoney(m.income)}</td><td className="r num neg">{fmtMoney(m.expenses)}</td><td className="r num">{fmtMoney(m.savings)}</td><td className="r num">{m.count}</td></tr>)}</tbody></table></div>
      </Panel>}
      <div className="grid two">
        <Panel title="Spending by category" note="Expenses only. Savings and transfers are not counted as spending.">
          {cats.length ? <div className="donut-row"><Donut items={cats} total={t.expenses} />
            <ul className="donut-key">{cats.slice(0, 7).map((c, i) => <li key={c.id}><i style={{ background: colorAt(i) }} />{c.name}<span className="num">{c.pct}%</span></li>)}{cats.length > 7 && <li><i style={{ background: colorAt(7) }} />{cats.length - 7} more</li>}</ul></div>
            : <Empty title="No expenses yet" body="Add an expense and you will see where the money goes." action={<button className="btn" onClick={quickAdd}>Add expense</button>} />}
        </Panel>
        <Panel title="Top spending categories" note="Highest first. Select one to filter everything by it.">
          {cats.length ? <HBars items={cats.slice(0, 8)} onPick={id => setFilters({ categoryId: filters.categoryId === id ? 'all' : id })} /> : <Empty title="Nothing to rank" body="Your biggest categories will be listed here." />}
        </Panel>
      </div>
      <TrendPanel txs={txs} />
      <Panel title="Recent transactions" right={<button className="btn small" onClick={() => go('transactions')}>See all {txs.length}</button>}><TxTable txs={txs} limit={8} compact /></Panel>
      <Panel title="Accounts" note="Each account as a sheet: every entry in this period with its running balance. Select a row to edit it.">
        <div className="sheets">{book.accounts.filter(a => filters.accountId === 'all' || a.id === filters.accountId).map(a => <Sheet key={a.id} account={a} range={range} />)}</div>
        <div className="total-row"><span>Total across all accounts</span><strong className="num">{fmtMoney(bal.total)}</strong></div>
      </Panel>
    </>
  );
}

export function removeSample() {
  const b = store.get();
  const txs = b.txs.filter(t => !t.sample);
  const used = new Set(txs.flatMap(t => [t.accountId, t.toAccountId]));
  store.set({ ...b, txs, accounts: b.accounts.filter(a => !a.sample || used.has(a.id)).map(a => (a.sample ? { ...a, sample: undefined } : a)), settings: { hasSample: false } });
}

// ---------- Transactions ----------
export function Transactions() {
  const { book, filters, range } = useApp();
  const txs = useMemo(() => applyFilters(book, filters, range), [book, filters, range]);
  const t = totals(txs);
  return (
    <>
      <FilterBar search />
      <div className="summary-line"><span>{range.label}</span><span>{t.count} transactions</span><span>Income <b className="num pos">{fmtMoney(t.income)}</b></span><span>Expenses <b className="num neg">{fmtMoney(t.expenses)}</b></span><span>Savings <b className="num">{fmtMoney(t.savings)}</b></span></div>
      <Panel className="flush"><TxTable txs={txs} /></Panel>
    </>
  );
}

// ---------- Accounts ----------
export function Accounts() {
  const { book, bal, range, confirm, toast } = useApp();
  const [form, setForm] = useState<{ account?: Account } | null>(null);
  const del = (a: Account) => {
    const n = book.txs.filter(t => t.accountId === a.id || t.toAccountId === a.id).length;
    confirm({
      title: `Delete ${a.name}?`, body: n ? `This also deletes its ${n} transaction${n === 1 ? '' : 's'}, including transfers to or from other accounts. This cannot be undone.` : 'This account has no transactions.', action: 'Delete account', danger: true,
      run: () => { const b = store.get(); store.set({ ...b, accounts: b.accounts.filter(x => x.id !== a.id), txs: b.txs.filter(t => t.accountId !== a.id && t.toAccountId !== a.id) }); toast('Account deleted'); },
    });
  };
  return (
    <>
      <div className="toolbar"><div className="filters"><PeriodSelect /></div><button className="btn primary" onClick={() => setForm({})}><Icon name="plus" size={16} />Add account</button></div>
      {book.accounts.length ? <>
        <div className="total-row top"><span>Total across all accounts</span><strong className="num">{fmtMoney(bal.total)}</strong></div>
        <div className="sheets">{book.accounts.map(a => <Sheet key={a.id} account={a} range={range} actions={<div className="nowrap">
          <button className="icon-btn" onClick={() => setForm({ account: a })} aria-label={`Edit ${a.name}`}><Icon name="edit" size={16} /></button>
          <button className="icon-btn" onClick={() => del(a)} aria-label={`Delete ${a.name}`}><Icon name="trash" size={16} /></button></div>} />)}</div>
        <p className="note pad">Opening balances: {book.accounts.map(a => `${a.name} ${fmtMoney(a.opening)}`).join(', ')}. Edit an account to change its opening balance.</p>
      </> : <Empty title="No accounts yet" body="Add each place your money sits, with what it holds today as the opening balance." action={<button className="btn primary" onClick={() => setForm({})}>Add account</button>} />}
      {form && <AccountForm initial={form.account} onClose={() => setForm(null)} />}
    </>
  );
}

// ---------- Categories ----------
export function Categories() {
  const { book, confirm, toast, setFilters, go } = useApp();
  const [form, setForm] = useState<{ cat?: Book['categories'][number] } | null>(null);
  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const t of book.txs) m[t.categoryId] = (m[t.categoryId] || 0) + 1; return m; }, [book]);
  const del = (id: string, name: string) => confirm({
    title: `Delete ${name}?`, body: counts[id] ? `Its ${counts[id]} transaction${counts[id] === 1 ? '' : 's'} will move to Other.` : 'No transactions use this category.', action: 'Delete category', danger: true,
    run: () => { const b = store.get(); store.set({ ...b, categories: b.categories.filter(c => c.id !== id), txs: b.txs.map(t => (t.categoryId === id ? { ...t, categoryId: OTHER } : t)) }); toast('Category deleted'); },
  });
  const kinds = { expense: 'Expenses', income: 'Income', savings: 'Savings', any: 'Any type' };
  return (
    <>
      <div className="toolbar"><p className="note">Income recorded under Salary starts a new salary cycle.</p><button className="btn primary" onClick={() => setForm({})}><Icon name="plus" size={16} />Add category</button></div>
      <Panel className="flush"><div className="table-wrap"><table className="table">
        <thead><tr><th>Category</th><th>Used for</th><th className="r">Transactions</th><th className="r">Actions</th></tr></thead>
        <tbody>{book.categories.map(c => (
          <tr key={c.id}>
            <td><span className="emoji">{c.icon}</span>{c.name}</td><td className="muted">{kinds[c.kind]}</td>
            <td className="r">{counts[c.id] ? <button className="link num" onClick={() => { setFilters({ categoryId: c.id, period: { kind: 'all' } }); go('transactions'); }}>{counts[c.id]}</button> : <span className="muted">0</span>}</td>
            <td className="r nowrap"><button className="icon-btn" onClick={() => setForm({ cat: c })} aria-label={`Edit ${c.name}`}><Icon name="edit" size={16} /></button>
              <button className="icon-btn" disabled={c.system} title={c.system ? 'This category is needed by the app' : undefined} onClick={() => del(c.id, c.name)} aria-label={`Delete ${c.name}`}><Icon name="trash" size={16} /></button></td>
          </tr>))}</tbody>
      </table></div></Panel>
      {form && <CategoryForm initial={form.cat} onClose={() => setForm(null)} />}
    </>
  );
}

// ---------- Salary cycles / months ----------
interface Row { key: string; label: string; from: string; to: string; current: boolean; period: any; }
function periodRows(book: Book, mode: 'cycle' | 'month'): Row[] {
  if (mode === 'cycle') {
    const cycles = getCycles(book); const cur = currentCycleIndex(cycles);
    return cycles.map((c, i) => ({ key: c.start, label: cycleLabel(c), from: c.start, to: c.end || '9999-12-31', current: i === cur, period: i === cur ? { kind: 'currentCycle' } : { kind: 'cycle', key: c.start } })).reverse();
  }
  const m = today().slice(0, 7);
  return monthKeys(book).map(k => ({ key: k, label: fmtMonth(k), from: k + '-01', to: monthEnd(k + '-01'), current: k === m, period: { kind: 'month', key: k } })).reverse();
}
function PeriodTable({ mode, withView }: { mode: 'cycle' | 'month'; withView?: boolean }) {
  const { book, filters, range, setFilters, go, editTx } = useApp();
  const base = useMemo(() => applyFilters(book, filters, range, true), [book, filters, range]);
  const rows = periodRows(book, mode);
  if (!rows.length) return <Empty title="No salary cycles yet" body="A cycle starts on the date you record an income in the Salary category, whatever day of the month that is." action={<button className="btn primary" onClick={() => editTx({ type: 'income', categoryId: SALARY, description: 'Salary' })}>Record salary</button>} />;
  return (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>{mode === 'cycle' ? 'Salary cycle' : 'Month'}</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">Savings</th><th className="r">Left</th><th className="r">Entries</th>{withView && <th />}</tr></thead>
      <tbody>{rows.map(r => {
        const t = totals(base.filter(x => x.date >= r.from && x.date <= r.to));
        return (
          <tr key={r.key}>
            <td className="nowrap">{r.label}{r.current && <span className="tag income">Current</span>}</td>
            <td className="r num">{fmtMoney(t.income)}</td><td className="r num">{fmtMoney(t.expenses)}</td><td className="r num">{fmtMoney(t.savings)}</td>
            <td className="r"><Money n={t.income - t.expenses - t.savings} /></td><td className="r num">{t.count}</td>
            {withView && <td className="r"><button className="btn small" onClick={() => { setFilters({ period: r.period }); go('dashboard'); }}>Open</button></td>}
          </tr>);
      })}</tbody>
    </table></div>
  );
}
export function Cycles() {
  const [mode, setMode] = useState<'cycle' | 'month'>('cycle');
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="View"><button className={mode === 'cycle' ? 'on' : ''} onClick={() => setMode('cycle')}>Salary cycle view</button><button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Month view</button></div>
        <p className="note">{mode === 'cycle' ? 'Each cycle runs from one salary date to the day before the next. The latest stays open until the next salary is recorded.' : 'Calendar months, regardless of when salary arrived.'}</p>
      </div>
      <Panel className="flush"><PeriodTable mode={mode} withView /></Panel>
    </>
  );
}

// ---------- Reports ----------
export function Reports() {
  const { book, filters, range } = useApp();
  const txs = useMemo(() => applyFilters(book, filters, range), [book, filters, range]);
  const all = useMemo(() => applyFilters(book, filters, range, true), [book, filters, range]);
  const cats = spendByCategory(txs, book);
  const accts = spendByAccount(txs, book);
  const long = range.from.startsWith('0000') || range.to.startsWith('9999') ? true : daysBetween(range.from, range.to) > 62;
  const buckets = makeBuckets(range, long ? 'month' : 'week', book, txs);
  const months = makeBuckets({ ...range, from: '0000-01-01', to: '9999-12-31', empty: false }, 'month', book, all).slice(-12);
  const top = txs.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 10);
  const is = (type: string) => (t: Tx) => t.type === type;
  return (
    <>
      <FilterBar />
      <p className="note pad">Showing {range.label}. Comparisons across cycles and months use every period, with the other filters applied.</p>
      <div className="grid two">
        <Panel title="Spending by category">{cats.length ? <HBars items={cats} /> : <Empty title="No expenses" body="Nothing was spent in this period with these filters." />}</Panel>
        <Panel title="Spending by account">{accts.length ? <HBars items={accts} /> : <Empty title="No expenses" body="Nothing was spent in this period with these filters." />}</Panel>
        <Panel title="Income vs expenses" note={long ? 'By month' : 'By week'}>
          {buckets.length ? <BarChart labels={buckets.map(b => b.label)} series={[{ name: 'Income', color: 'var(--pos)', values: buckets.map(b => sumIn(txs, b, is('income'))) }, { name: 'Expenses', color: 'var(--neg)', values: buckets.map(b => sumIn(txs, b, is('expense'))) }]} /> : <Empty title="Nothing to compare" body="Record income and expenses to see them side by side." />}
        </Panel>
        <Panel title="Savings trend" note="By month, all time">
          {all.some(is('savings')) ? <BarChart labels={months.map(b => b.label)} series={[{ name: 'Savings', color: 'var(--accent)', values: months.map(b => sumIn(all, b, is('savings'))) }]} /> : <Empty title="No savings recorded" body="Record a Savings transaction to start the trend." />}
        </Panel>
      </div>
      <Panel title="Salary-cycle comparison" className="flush-body"><PeriodTable mode="cycle" /></Panel>
      <Panel title="Monthly comparison" className="flush-body"><PeriodTable mode="month" /></Panel>
      <div className="grid two">
        <Panel title="Top expenses" note="Largest single payments in this period">
          {top.length ? <ol className="rank">{top.map(t => <li key={t.id}><span>{t.description}<em>{fmtDate(t.date)}, {catOf(book, t.categoryId).name}, {accOf(book, t.accountId)?.name}</em></span><b className="num">{fmtMoney(t.amount)}</b></li>)}</ol> : <Empty title="No expenses" body="The biggest payments will be listed here." />}
        </Panel>
        <Panel title="Top categories" note="With number of payments">
          {cats.length ? <ol className="rank">{cats.slice(0, 10).map(c => <li key={c.id}><span><span className="emoji">{c.icon}</span>{c.name}<em>{c.count} payment{c.count === 1 ? '' : 's'}, {c.pct}% of expenses</em></span><b className="num">{fmtMoney(c.amount)}</b></li>)}</ol> : <Empty title="No expenses" body="Your biggest categories will be listed here." />}
        </Panel>
      </div>
    </>
  );
}

// ---------- Settings ----------
export function Settings() {
  const { book, confirm, toast } = useApp();
  const session = React.useSyncExternalStore(store.subscribe, store.session, store.session);
  const save = (filename: string, data: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const csv = () => {
    const q = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Description', 'Account', 'To account', 'Category', 'Type', 'Payment method', 'Amount', 'Notes'].join(',')];
    for (const t of sortAsc(book.txs)) lines.push([t.date, q(t.description), q(accOf(book, t.accountId)?.name), q(accOf(book, t.toAccountId)?.name), q(catOf(book, t.categoryId).name), typeLabel(t), methodLabel(t), signedAmount(t), q(t.notes)].join(','));
    save('transactions.csv', '\ufeff' + lines.join('\n'), 'text/csv');
  };
  const restore = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let b: Book | null = null;
      try { b = normalise(JSON.parse(String(r.result))); } catch { /* invalid */ }
      if (!b) return toast('That file is not a backup from this app');
      const ok = b;
      confirm({ title: 'Replace everything with this backup?', body: `The backup holds ${ok.accounts.length} accounts and ${ok.txs.length} transactions. Your current data will be replaced.`, action: 'Restore backup', danger: true, run: () => { store.set(ok); toast('Backup restored'); } });
    };
    r.readAsText(file);
  };
  const demo = session.auth === 'demo';
  return (
    <div className="settings">
      <Panel title={demo ? 'Demo mode' : 'Your account'}>
        {demo ? <p>Firebase is not connected yet, so nothing you enter is saved. Follow the README to connect it.</p>
          : <><p>Signed in as {session.name || session.email}{session.name && session.email ? ` (${session.email})` : ''}. Your data is stored online under this account only, so every device you sign in on shows the same numbers. Nothing is stored in this browser.</p>
            {session.error && <p className="error">{session.error}</p>}
            <button className="btn" onClick={() => store.signOut()}>Sign out</button></>}
      </Panel>
      {!demo && <FamilyPanel />}
      <Panel title="Voice language" note="The language the app speaks and listens in during voice entry">
        <div className="seg" role="group" aria-label="Voice language">{(['ta', 'en'] as const).map(l => <button key={l} className={(book.settings.voiceLang || 'ta') === l ? 'on' : ''} onClick={() => store.set({ ...book, settings: { ...book.settings, voiceLang: l } })}>{l === 'ta' ? 'தமிழ்' : 'English'}</button>)}</div>
      </Panel>
      <Panel title="Backup and export" note={`${book.txs.length} transactions, ${book.accounts.length} accounts, ${book.categories.length} categories`}>
        <div className="row">
          <button className="btn" onClick={() => save('ledger-backup.json', JSON.stringify(book, null, 1), 'application/json')}>Download backup file</button>
          <button className="btn" onClick={csv}>Export transactions as CSV</button>
          <label className="btn">Restore from backup<input type="file" accept=".json,application/json" hidden onChange={e => { restore(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
      </Panel>
      <Panel title="Sample data">
        {book.settings.hasSample ? <><p>Demo entries from September 2026 are loaded. Delete them when you are ready to enter your own.</p>
          <button className="btn" onClick={() => confirm({ title: 'Delete the sample data?', body: 'Removes the demo transactions and demo accounts. Anything you added yourself is kept.', action: 'Delete sample data', danger: true, run: () => { removeSample(); toast('Sample data deleted'); } })}>Delete sample data and start fresh</button></>
          : <><p>Want to see how the app looks when it is full? Load a month of demo entries.</p><button className="btn" onClick={() => confirm({ title: 'Load the sample data?', body: 'This replaces everything currently in the app with the September 2026 demo.', action: 'Load sample data', danger: true, run: () => { store.set(sampleBook()); toast('Sample data loaded'); } })}>Load sample data</button></>}
      </Panel>
      <Panel title="Erase everything"><p>Deletes all accounts and transactions. Your categories go back to the defaults.</p>
        <button className="btn danger" onClick={() => confirm({ title: 'Erase all data?', body: 'Every account and transaction will be deleted from every device. This cannot be undone unless you have a backup file.', action: 'Erase everything', danger: true, run: () => { store.set(emptyBook()); toast('Everything erased'); } })}>Erase everything</button>
      </Panel>
    </div>
  );
}

function FamilyPanel() {
  const { book, confirm, toast } = useApp();
  const session = React.useSyncExternalStore(store.subscribe, store.session, store.session);
  const members = book.members || [];
  const owner = session.ownerId === session.uid;
  const link = store.inviteLink();
  const copy = async () => {
    try { if ((navigator as any).share) await (navigator as any).share({ title: 'Join our family ledger', text: 'Open this link and sign in with Google to join our family ledger:', url: link }); else { await navigator.clipboard.writeText(link); toast('Invite link copied'); } }
    catch { /* share sheet dismissed */ }
  };
  return (
    <Panel title="Family" note={members.length > 1 ? 'Everyone here sees and adds to the same accounts and transactions. Salaries from all members add up to the family income.' : 'Share this ledger with your family so everyone logs into the same accounts and all salaries add up.'}>
      <ul className="members">{members.map(m => <li key={m.id}><span>{m.name}{m.id === session.uid && <em> (you)</em>}{m.id === session.ownerId && <span className="tag">Owner</span>}</span>
        {owner && m.id !== session.uid && <button className="btn small" onClick={() => confirm({ title: `Remove ${m.name}?`, body: 'They lose access to this ledger immediately. Entries they made stay.', action: 'Remove member', danger: true, run: () => { store.removeMember(m.id); } })}>Remove</button>}</li>)}</ul>
      {owner ? <>
        <label className="check"><input type="checkbox" checked={session.inviteOpen} onChange={e => store.setInviteOpen(e.target.checked)} /><span>Allow joining with the invite link</span></label>
        {session.inviteOpen ? <><p className="hint">Send this link only to family. Anyone who opens it and signs in can see and change everything in this ledger. Switch joining off once everyone is in.</p>
          <div className="voice-type"><input readOnly value={link} onFocus={e => e.target.select()} /><button className="btn" onClick={copy}>Share link</button></div></>
          : <p className="hint">Joining is off, so the invite link does not work for anyone.</p>}
      </> : <button className="btn" onClick={() => confirm({ title: 'Leave this family ledger?', body: 'You go back to your own private ledger. Entries you made here stay with the family.', action: 'Leave ledger', danger: true, run: () => { store.leave(); } })}>Leave this family ledger</button>}
      {members.length > 1 && <Field label="A new salary cycle starts when">
        <select value={book.settings.cycleBy || ''} disabled={!owner} onChange={e => store.set({ ...book, settings: { ...book.settings, cycleBy: e.target.value } })}>
          <option value="">anyone's salary arrives</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}'s salary arrives</option>)}
        </select></Field>}
      {members.length > 1 && <p className="hint">With two or more earners paid on different dates, pick the main earner. The other salaries still count as income in whichever cycle they land.</p>}
    </Panel>
  );
}
