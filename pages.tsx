import React, { useMemo, useState } from 'react';
import {
  Account, Book, Gran, METHODS, Range, SALARY, OTHER, TYPES, Tx, accOf, addDays, applyFilters, buildInsights, catOf, computeBalances, currentCycleIndex,
  cycleLabel, daysBetween, buildPace, memberName, effect, fmtDate, fmtMoney, fmtMonth, getCycles, makeBuckets, monthEnd, monthKeys, pct, signedAmount, sortAsc, spendByAccount,
  spendByCategory, sumIn, today, totals, cycleStatus, quickPicks, salaryCandidates, earlyExpenses, buildSparks, Spark, isSalary, FACTS, factSpark, pickRandom, quoteSpark, dailyStats, previousRange, BIG_PAYMENT,
} from './logic';
import { store, normalise } from './store';
import { emptyBook, sampleBook } from './sample';
import { BarChart, Donut, HBars, PaceRing, colorAt } from './charts';
import { Empty, Field, FilterBar, Icon, Money, Panel, PeriodSelect, PeriodStepper, useApp, useCountUp } from './ui';
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
    run: () => { const b = store.get(); store.set({ ...b, txs: b.txs.filter(x => x.id !== t.id) }); toast('Transaction deleted', () => { const c = store.get(); store.set({ ...c, txs: [...c.txs, t] }); }); },
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

// ---------- Activity list: transactions grouped by day ----------
const dayTitle = (d: string) => { const n = today(); return d === n ? 'Today' : d === addDays(n, -1) ? 'Yesterday' : fmtDate(d, d.slice(0, 4) !== n.slice(0, 4)); };
export function ActivityList({ txs, limit }: { txs: Tx[]; limit?: number }) {
  const { book, filters, editTx, confirm, toast } = useApp();
  const [shown, setShown] = useState(limit || 60);
  const all = useMemo(() => sortAsc(txs).reverse(), [txs]);
  const rows = all.slice(0, shown);
  const view = filters.accountId !== 'all' ? filters.accountId : undefined;
  const family = (book.members || []).length > 1;
  const catIdx = useMemo(() => { const m: Record<string, number> = {}; spendByCategory(book.txs, book).forEach((c, i) => { m[c.id] = i; }); return m; }, [book]);
  const del = (t: Tx) => confirm({
    title: 'Delete this transaction?', body: `${t.description}, ${fmtMoney(Math.abs(t.amount))} on ${fmtDate(t.date, true)}. Balances will be recalculated.`, action: 'Delete transaction', danger: true,
    run: () => { const b = store.get(); store.set({ ...b, txs: b.txs.filter(x => x.id !== t.id) }); toast('Transaction deleted', () => { const c = store.get(); store.set({ ...c, txs: [...c.txs, t] }); }); },
  });
  if (!rows.length) return <Empty title="Nothing here yet" body="No transactions match this period and these filters." action={<button className="btn" onClick={() => editTx()}>Add transaction</button>} />;
  const groups: { date: string; items: Tx[] }[] = [];
  for (const t of rows) { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] }); }
  return (
    <div className="activity">
      {groups.map(g => {
        const out = g.items.reduce((s, t) => (t.type === 'expense' ? s + t.amount : s), 0);
        return (
          <section key={g.date} className="day">
            <header className="day-head"><span>{dayTitle(g.date)}</span>{out > 0 && <span className="num">{fmtMoney(out)} spent</span>}</header>
            <ul>{g.items.map(t => {
              const c = catOf(book, t.categoryId);
              const amt = signedAmount(t, view);
              const acct = t.type === 'transfer' ? `${accOf(book, t.accountId)?.name || '?'} → ${accOf(book, t.toAccountId)?.name || '?'}` : accOf(book, t.accountId)?.name || 'Deleted account';
              const tint = t.type === 'income' ? 'var(--pos)' : t.type === 'savings' ? 'var(--c2)' : t.type === 'transfer' ? 'var(--muted)' : colorAt(catIdx[t.categoryId] ?? 7);
              return (
                <li key={t.id} className="act">
                  <button className="act-main" onClick={() => editTx(t)} aria-label={`Edit ${t.description}`}>
                    <span className="act-icon" style={{ ['--tint' as any]: tint }}>{c.icon}</span>
                    <span className="act-text"><b>{t.description}</b><small>{[t.type === 'expense' ? c.name : typeLabel(t), acct, family ? memberName(book, t.by) : '', t.notes].filter(Boolean).join(' · ')}</small></span>
                    <span className={'act-amt num' + (amt > 0 ? ' pos' : '')}>{amt > 0 ? '+' : ''}{fmtMoney(Math.abs(amt))}</span>
                  </button>
                  <button className="icon-btn act-del" onClick={() => del(t)} aria-label={`Delete ${t.description}`}><Icon name="trash" size={16} /></button>
                </li>);
            })}</ul>
          </section>);
      })}
      {all.length > rows.length && !limit && <button className="btn wide-btn" onClick={() => setShown(s => s + 100)}>Show {Math.min(100, all.length - rows.length)} more</button>}
    </div>
  );
}

// ---------- Home ----------
function Hero() {
  const { book, bal, editTx, fixSalary } = useApp();
  const cs = cycleStatus(book);
  const left = useCountUp(cs ? cs.left : bal.total);
  if (!cs) {
    const cands = salaryCandidates(book);
    return (
      <section className="card hero">
        <div className="hero-main">
          <p className="eyebrow">Balance across all accounts</p>
          <p className="hero-num num">{fmtMoney(Math.round(left))}</p>
          {cands.length > 0 ? <>
            <p className="hero-sub">No salary recorded yet. If you already entered it another way, tap it to make it your salary.</p>
            <div className="hero-cands">{cands.map(t => <button key={t.id} className="cand" onClick={() => fixSalary(t)}><span><b>{t.description}</b><small>{fmtDate(t.date)} · {t.type === 'income' ? catOf(book, t.categoryId).name : `recorded as ${t.type}`}</small></span><b className="num">{fmtMoney(Math.abs(t.amount))}</b><em>This was my salary</em></button>)}</div>
            <button className="link" onClick={() => editTx({ type: 'income', categoryId: SALARY, description: 'Salary' })}>Or record a new salary</button>
          </> : <>
            <p className="hero-sub">Record your salary and the app starts tracking how much is left until the next one.</p>
            <button className="btn primary" onClick={() => editTx({ type: 'income', categoryId: SALARY, description: 'Salary' })}>Record salary</button>
          </>}
        </div>
      </section>
    );
  }
  const early = getCycles(book).length === 1 ? earlyExpenses(book) : null;
  const salaryTx = early ? book.txs.find(t => isSalary(t) && t.date === cs.start) : undefined;
  const fast = cs.spentShare > cs.timeShare + 0.15;
  return (
    <section className="card hero">
      <div className="hero-main">
        <p className="eyebrow">Left to spend this salary cycle</p>
        <p className={'hero-num num' + (cs.left < 0 ? ' over' : '')}>{fmtMoney(Math.round(left))}</p>
        <p className="hero-sub">{cs.left > 0
          ? <>About <b className="num">{fmtMoney(cs.perDay)}</b> a day for the next {cs.daysLeft} day{cs.daysLeft === 1 ? '' : 's'}. Next salary expected around {fmtDate(cs.nextSalary)}.</>
          : <>This cycle's income is used up. Anything more comes out of older balances.</>}</p>
        {early && salaryTx && <button className="hero-fix" onClick={() => fixSalary(salaryTx)}>{early.count} expense{early.count === 1 ? '' : 's'} ({fmtMoney(early.total)}) from before {fmtDate(cs.start)} are not in this cycle. <b>Count them</b></button>}
        <div className="hero-stats">
          <div><span>Income</span><b className="num">{fmtMoney(cs.income)}</b></div>
          <div><span>Spent</span><b className="num">{fmtMoney(cs.expenses)}</b></div>
          <div><span>Saved</span><b className="num">{fmtMoney(cs.savings)}</b></div>
        </div>
      </div>
      <div className="hero-ring">
        <PaceRing money={cs.spentShare} time={cs.timeShare} />
        <p className="ring-key"><span><i className={'k-money' + (fast ? ' fast' : '')} />Money used</span><span><i className="k-time" />Day {cs.day} of ~{cs.len}</span></p>
      </div>
    </section>
  );
}

const GREET = () => { const h = new Date().getHours(); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
function Sparks() {
  const { book } = useApp();
  const session = React.useSyncExternalStore(store.subscribe, store.session, store.session);
  // A fresh order every time the app opens: the strongest few, shuffled, with a thought for the day at the end.
  const sparks = useMemo(() => {
    // Fresh every open: your strongest wins, a money fact or two, and a quote. Mornings open with the quote.
    const h = new Date().getHours(); const morning = h >= 5 && h < 12;
    const all = buildSparks(book);
    const stats = pickRandom(all.filter(x => x.kind !== 'fact').sort((a, b) => b.weight - a.weight).slice(0, 5), 4);
    const facts = [...all.filter(x => x.kind === 'fact'), ...pickRandom(FACTS, 2).map(factSpark)].slice(0, 2);
    const mixed: Spark[] = [];
    stats.forEach((x, k) => { mixed.push(x); if (k % 2 === 1 && facts.length) mixed.push(facts.shift()!); });
    mixed.push(...facts);
    const q = quoteSpark(morning);
    return morning ? [q, ...mixed] : [...mixed.slice(0, 2), q, ...mixed.slice(2)];
  }, [book.txs.length]); // eslint-disable-line
  const [i, setI] = useState(0);
  const track = React.useRef<HTMLDivElement>(null);
  const paused = React.useRef(false);
  React.useEffect(() => {
    const t = window.setInterval(() => { if (paused.current || !track.current) return; const n = (Math.round(track.current.scrollLeft / track.current.clientWidth) + 1) % sparks.length; track.current.scrollTo({ left: n * track.current.clientWidth, behavior: 'smooth' }); }, 6000);
    return () => window.clearInterval(t);
  }, [sparks.length]);
  const name = (session.name || '').split(' ')[0];
  if (!sparks.length) return null;
  return (
    <section className="sparks" aria-label="Your wins" onPointerDown={() => { paused.current = true; }} onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}>
      <p className="greet">{GREET()}{name ? `, ${name}` : ''} <span className="wave">👋</span></p>
      <div className="spark-track" ref={track} onScroll={e => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {sparks.map((sp: Spark, k) => (
          <article key={k} className={'spark ' + sp.tone}>
            <span className="spark-emoji" aria-hidden="true">{sp.emoji}</span>
            <div className="spark-body">
              <p className="spark-kicker">{sp.kind === 'fact' ? 'Money fact · ' : ''}{sp.kicker}</p>
              {sp.kind === 'quote' ? <blockquote className="spark-quote">{sp.text}</blockquote> : <>
                {sp.big && <p className="spark-big num">{sp.big}</p>}
                <p className="spark-text">{sp.text}</p></>}
              {sp.kind === 'quote' && <p className="spark-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
            </div>
            <i className="spark-orb" aria-hidden="true" />
          </article>
        ))}
      </div>
      {sparks.length > 1 && <div className="spark-dots" role="tablist">{sparks.map((_, k) => <button key={k} role="tab" aria-selected={k === i} aria-label={`Insight ${k + 1}`} className={k === i ? 'on' : ''} onClick={() => { paused.current = true; track.current?.scrollTo({ left: k * track.current.clientWidth, behavior: 'smooth' }); }} />)}</div>}
    </section>
  );
}

function TodayCard() {
  const { book, quickAdd, voice } = useApp();
  const cs = cycleStatus(book);
  const spent = book.txs.reduce((s, x) => (x.type === 'expense' && x.date === today() ? s + x.amount : s), 0);
  const budget = cs && cs.perDay > 0 ? cs.perDay : null;
  const share = budget ? Math.min(1, spent / budget) : 0;
  return (
    <section className="card today">
      <p className="eyebrow">Today</p>
      <p className="today-num num">{fmtMoney(spent)}<small>{budget ? ` of ${fmtMoney(budget)}` : ' spent'}</small></p>
      {budget && <div className="meter" aria-hidden="true"><span style={{ width: `${share * 100}%` }} className={spent > budget ? 'over' : ''} /></div>}
      <p className="note">{budget ? (spent > budget ? `${fmtMoney(spent - budget)} over today's share. Tomorrow's share shrinks a little.` : `${fmtMoney(budget - spent)} left in today's share.`) : 'Your daily share appears once a salary is recorded.'}</p>
      <div className="today-actions"><button className="btn primary" onClick={() => quickAdd()}><Icon name="plus" size={16} />Expense</button><button className="btn ghost-line" onClick={voice}><Icon name="mic" size={16} />Speak</button></div>
    </section>
  );
}

function QuickTiles() {
  const { book, quickAdd } = useApp();
  const picks = quickPicks(book, 6);
  if (!picks.length) return null;
  return (
    <section className="card tiles-card">
      <header className="card-head"><h3>Log again in one tap</h3><p className="note">Your most frequent expenses</p></header>
      <div className="tiles">{picks.map(p => { const c = catOf(book, p.categoryId); return (
        <button key={p.description} className="tile" onClick={() => quickAdd({ description: p.description, categoryId: p.categoryId, amount: p.amount, accountId: p.accountId })}>
          <span className="tile-icon">{c.icon}</span><b>{p.description}</b><span className="num">{fmtMoney(p.amount)}</span>
        </button>); })}</div>
    </section>
  );
}

function AccountsCard() {
  const { book, bal, go } = useApp();
  const max = Math.max(1, ...book.accounts.map(a => Math.abs(bal.byAccount[a.id] || 0)));
  return (
    <section className="card accts-card">
      <header className="card-head"><h3>Balance now</h3><button className="link-btn" onClick={() => go('accounts')}>Accounts<Icon name="arrow" size={15} /></button></header>
      <p className="accts-total num">{fmtMoney(bal.total)}</p>
      <ul className="accts">{book.accounts.map((a, i) => <li key={a.id}><span>{a.name}</span><span className="num">{fmtMoney(bal.byAccount[a.id] || 0)}</span><i style={{ width: `${(Math.abs(bal.byAccount[a.id] || 0) / max) * 100}%`, background: colorAt(i + 1) }} /></li>)}</ul>
    </section>
  );
}

function WhereItWent() {
  const { book, filters, range, setFilters, go } = useApp();
  const [active, setActive] = useState<number | null>(null);
  const txs = useMemo(() => applyFilters(book, { ...filters, categoryId: 'all' }, range), [book, filters, range]);
  const cats = spendByCategory(txs, book);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const open = (id: string) => { setFilters({ categoryId: id }); go('transactions'); };
  return (
    <section className="card where">
      <header className="card-head"><div><h3>Where it went</h3><p className="note">{range.label}</p></div><PeriodStepper /></header>
      {cats.length ? <div className="donut-row">
        <Donut items={cats} total={total} active={active} onActive={setActive} />
        <ul className="donut-key">{cats.slice(0, 7).map((c, i) => <li key={c.id} className={active === i ? 'on' : active !== null ? 'dim' : ''} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
          <button onClick={() => open(c.id)} title={`See every ${c.name} transaction`}><i style={{ background: colorAt(i) }} /><span className="k-name"><span className="emoji">{c.icon}</span>{c.name}</span><span className="num">{fmtMoney(c.amount)}</span><em className="num">{c.pct}%</em></button></li>)}
          {cats.length > 7 && <li className="more-cats"><i style={{ background: colorAt(7) }} />{cats.length - 7} more categories</li>}</ul>
      </div> : <Empty title="No spending yet" body="Expenses in this period will show up here." />}
    </section>
  );
}

export function Dashboard() {
  const { book, filters, range, go, confirm, toast } = useApp();
  const txs = useMemo(() => applyFilters(book, filters, range), [book, filters, range]);
  const pace = useMemo(() => buildPace(book).slice(1), [book]);
  if (!book.accounts.length) return (
    <Empty title="Start with your accounts" body="Add each place your money sits (cash, Canara, Kotak) with its current balance. Then record your salary to begin your first salary cycle."
      action={<button className="btn primary" onClick={() => go('accounts')}>Add your first account</button>} />
  );
  const clearSample = () => confirm({
    title: 'Delete the sample data?', body: 'This removes the demo transactions and the three demo accounts so you can start with your own numbers. Anything you added yourself is kept.', action: 'Delete sample data', danger: true,
    run: () => { removeSample(); toast('Sample data deleted'); },
  });
  const spend = txs.filter(t => t.type === 'expense');
  const buckets = makeBuckets(range, 'day', book, spend);
  return (
    <>
      {book.settings.hasSample && <div className="banner"><span>You are looking at sample data.</span><button className="btn small" onClick={clearSample}>Delete sample data</button></div>}
      <div className="bento">
        <Sparks />
        <Hero />
        <TodayCard />
        {pace.length > 0 && <div className="nudges">{pace.map((p, k) => <div key={k} className={'nudge ' + p.tone}><strong>{p.title}</strong><p>{p.text}</p></div>)}</div>}
        <QuickTiles />
        <AccountsCard />
        <WhereItWent />
        <section className="card trend">
          <header className="card-head"><h3>Day by day</h3></header>
          {spend.length && buckets.length ? <BarChart labels={buckets.map(b => b.label)} series={[{ name: 'Spending', color: 'var(--bar)', values: buckets.map(b => sumIn(spend, b, () => true)) }]} height={190} /> : <Empty title="No spending to chart" body="Daily spending appears here as you record it." />}
        </section>
        <section className="card recent">
          <header className="card-head"><h3>Recent</h3><button className="link-btn" onClick={() => go('transactions')}>See all {txs.length}<Icon name="arrow" size={15} /></button></header>
          <ActivityList txs={txs} limit={6} />
        </section>
      </div>
    </>
  );
}

export function removeSample() {
  const b = store.get();
  const txs = b.txs.filter(t => !t.sample);
  const used = new Set(txs.flatMap(t => [t.accountId, t.toAccountId]));
  store.set({ ...b, txs, accounts: b.accounts.filter(a => !a.sample || used.has(a.id)).map(a => (a.sample ? { ...a, sample: undefined } : a)), settings: { ...b.settings, hasSample: false } });
}

// ---------- Transactions ----------
export function Transactions() {
  const { book, filters, range, setFilters } = useApp();
  const [open, setOpen] = useState(false);
  const txs = useMemo(() => applyFilters(book, filters, range), [book, filters, range]);
  const t = totals(txs);
  const active = [filters.accountId, filters.categoryId, filters.type, filters.method].filter(v => v !== 'all').length;
  return (
    <>
      <div className="act-tools">
        <label className="search"><Icon name="search" size={18} /><input type="search" placeholder="Search" value={filters.search} onChange={e => setFilters({ search: e.target.value })} /></label>
        <button className={'btn ghost-line' + (open || active ? ' on' : '')} onClick={() => setOpen(o => !o)} aria-expanded={open}><Icon name="filter" size={16} />Filters{active > 0 && <span className="count">{active}</span>}</button>
      </div>
      {open && <div className="card filter-card"><FilterBar /></div>}
      <div className="summary">
        <div><span>{range.title}</span><b>{range.label}</b></div>
        <div><span>In</span><b className="num pos">{fmtMoney(t.income)}</b></div>
        <div><span>Out</span><b className="num">{fmtMoney(t.expenses)}</b></div>
        <div><span>Saved</span><b className="num">{fmtMoney(t.savings)}</b></div>
      </div>
      <ActivityList txs={txs} />
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

// ---------- Daily average ----------
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function DailyAverage() {
  const { book, filters, range } = useApp();
  const txs = useMemo(() => applyFilters(book, filters, range), [book, filters, range]);
  const ds = dailyStats(txs, range);
  // Compare like with like: while this period is still running, cut the previous one at the same day count.
  const prevFull = previousRange(range, book);
  const running = range.open || range.to > today();
  const prevR = prevFull && ds && running ? { ...prevFull, to: addDays(prevFull.from, ds.days - 1) < prevFull.to ? addDays(prevFull.from, ds.days - 1) : prevFull.to } : prevFull;
  const prev = prevR ? dailyStats(applyFilters(book, filters, prevR), prevR) : null;
  const avg = useCountUp(ds ? ds.avg : 0);
  if (!ds) return <section className="card daily"><header className="card-head"><h3>Average daily spend</h3></header><Empty title="No expenses in this period" body="Record expenses and your daily average appears here." /></section>;
  const diff = prev ? ds.avg - prev.avg : 0;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const maxDow = Math.max(1, ...ds.byDow);
  const peak = ds.byDow.indexOf(Math.max(...ds.byDow));
  return (
    <section className="card daily">
      <div className="daily-main">
        <p className="eyebrow">Average daily spend · {range.label}</p>
        <p className="daily-num num">{fmtMoney(Math.round(avg))}<small> a day</small></p>
        <p className="note">{fmtMoney(ds.total)} spent over {ds.days} day{ds.days === 1 ? '' : 's'}, counting days with no spending. Expenses only, savings and transfers are left out.</p>
        {prev && Math.abs(diff) >= 1 && <p className={'daily-vs ' + (diff > 0 ? 'up' : 'down')}>{diff > 0 ? '▲' : '▼'} {fmtMoney(Math.round(Math.abs(diff)))} a day {diff > 0 ? 'more' : 'less'} than {running ? `the first ${ds.days} days of the ${prevFull!.title}` : `the ${prevFull!.title}`} ({fmtMoney(Math.round(prev.avg))} a day)</p>}
        {ds.bigCount > 0 && <div className="daily-every"><span>Everyday spending</span><b className="num">{fmtMoney(Math.round(ds.everydayAvg))} a day</b><small>Leaves out {ds.bigCount} big payment{ds.bigCount === 1 ? '' : 's'} of {fmtMoney(BIG_PAYMENT)} or more ({fmtMoney(ds.bigTotal)}), like rent or family. This is what a normal day costs you.</small></div>}
      </div>
      <div className="daily-facts">
        <div><span>Usual day</span><b className="num">{fmtMoney(Math.round(ds.median))}</b><small>half of days cost less</small></div>
        <div><span>Weekdays</span><b className="num">{fmtMoney(Math.round(ds.weekdayAvg))}</b><small>Mon to Fri, a day</small></div>
        <div><span>Weekends</span><b className="num">{fmtMoney(Math.round(ds.weekendAvg))}</b><small>Sat and Sun, a day</small></div>
        <div><span>No-spend days</span><b className="num">{ds.noSpend}</b><small>of {ds.days}</small></div>
        {ds.top && <div><span>Highest day</span><b className="num">{fmtMoney(ds.top.amount)}</b><small>{fmtDate(ds.top.date)}</small></div>}
      </div>
      <div className="dow" aria-label="Average spend by day of the week">
        {order.map(w => <div key={w} className={'dow-col' + (w === peak ? ' peak' : '')} title={`${DOW[w]}: ${fmtMoney(Math.round(ds.byDow[w]))} a day on average`}>
          <span className="dow-val num">{ds.byDow[w] >= 1000 ? `₹${(ds.byDow[w] / 1000).toFixed(1)}k` : fmtMoney(Math.round(ds.byDow[w]))}</span>
          <span className="dow-bar"><i style={{ height: `${Math.max(3, (ds.byDow[w] / maxDow) * 100)}%` }} /></span>
          <span className="dow-name">{DOW[w]}</span>
        </div>)}
      </div>
      <p className="note">Your costliest day of the week is {DOW[peak]}, at about {fmtMoney(Math.round(ds.byDow[peak]))} on average.</p>
    </section>
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
  const insights = useMemo(() => buildInsights(book, filters, range), [book, filters, range]);
  return (
    <>
      <div className="card filter-card"><FilterBar /></div>
      <p className="note pad">Showing {range.label}. Comparisons across cycles and months use every period, with the other filters applied.</p>
      <DailyAverage />
      {insights.length > 0 && <Panel title="What stands out"><ul className="insights">{insights.map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}</ul></Panel>}
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
