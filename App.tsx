import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Filters, Tx, computeBalances, defaultFilters, resolvePeriod } from './logic';
import { store } from './store';
import { AppCtx, ConfirmOpts, Ctx, Icon, Modal, Page } from './ui';
import { QuickExpense, SalaryFix, TxForm } from './forms';
import { VoiceEntry } from './voice';
import { Accounts, Categories, Cycles, Dashboard, Reports, Settings, Transactions } from './pages';

const NAV: { id: Page; label: string; title: string }[] = [
  { id: 'dashboard', label: 'Home', title: 'Home' },
  { id: 'transactions', label: 'Activity', title: 'Activity' },
  { id: 'reports', label: 'Insights', title: 'Insights' },
  { id: 'accounts', label: 'Accounts', title: 'Accounts' },
  { id: 'cycles', label: 'Salary cycles', title: 'Salary cycles' },
  { id: 'categories', label: 'Categories', title: 'Categories' },
  { id: 'settings', label: 'Settings', title: 'Settings' },
];
const TABS: Page[] = ['dashboard', 'transactions', 'reports'];
const MORE: Page[] = ['accounts', 'cycles', 'categories', 'settings'];
const STATUS: Record<string, string> = { demo: 'Demo mode, nothing is saved', syncing: 'Saving', synced: 'Saved online', error: 'Last change not saved' };

export default function App() {
  const book = useSyncExternalStore(store.subscribe, store.get, store.get);
  const session = useSyncExternalStore(store.subscribe, store.session, store.session);
  const status = session.status;
  const [voice, setVoice] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [filters, setF] = useState<Filters>(defaultFilters);
  const [txForm, setTxForm] = useState<Partial<Tx> | null>(null);
  const [quick, setQuick] = useState<Partial<Tx> | null>(null);
  const [more, setMore] = useState(false);
  const [fix, setFix] = useState<Tx | null>(null);
  const [ask, setAsk] = useState<ConfirmOpts | null>(null);
  const [toastMsg, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef(0);
  const bal = useMemo(() => computeBalances(book), [book]);
  const range = useMemo(() => resolvePeriod(filters.period, book), [filters.period, book]);
  const toast = useCallback((text: string, undo?: () => void) => {
    setToast({ text, undo });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 2600);
  }, []);
  const go = (p: Page) => { setPage(p); setMore(false); window.scrollTo(0, 0); };
  const ctx: AppCtx = {
    book, bal, filters, range,
    setFilters: f => setF(old => ({ ...old, ...f })),
    go,
    editTx: t => setTxForm(t || {}),
    quickAdd: p => setQuick(p || {}),
    voice: () => setVoice(true),
    fixSalary: t => setFix(t),
    confirm: setAsk, toast,
  };
  const noAccounts = !book.accounts.length;
  if (session.auth === 'loading' || (session.auth === 'in' && !session.ready)) return <div className="gate"><div className="loader" aria-hidden="true" /><p className="note">{session.error || 'Loading your ledger'}</p></div>;
  if (session.auth === 'out') return (
    <div className="gate"><div className="gate-card">
      <img className="gate-logo" src="./logo.png" alt="Grow with Jana" />
      <h1>Know where your salary went, from one payday to the next.</h1>
      <p className="note">{session.joinId ? 'You have been invited to a family ledger. Sign in to join it.' : 'Sign in to keep your accounts and transactions private to you and in step across your phone and laptop.'}</p>
      <button className="btn primary big" onClick={() => store.signIn()}>Continue with Google</button>
      {session.error && <p className="error" role="alert">{session.error}</p>}
    </div></div>
  );
  const cur = NAV.find(n => n.id === page)!;
  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className="side" aria-label="Main">
          <div className="brand"><span className="brand-mark"><img src="./icon-192.png" alt="" /></span><span className="brand-word">grow<em>with jana</em></span></div>
          <button className="btn primary side-add" disabled={noAccounts} onClick={() => setQuick({})}><Icon name="plus" size={18} />Add expense</button>
          <ul>{NAV.map(n => <li key={n.id}><button className={page === n.id ? 'on' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => go(n.id)}><Icon name={n.id === 'dashboard' ? 'home' : n.id === 'transactions' ? 'activity' : n.id === 'reports' ? 'insights' : n.id} /><span>{n.label}</span></button></li>)}</ul>
          <p className={'sync ' + status}><i />{STATUS[status]}</p>
        </nav>
        <main>
          {session.auth === 'demo' && <div className="banner"><span>Demo mode. Firebase is not connected, so nothing is saved.</span></div>}
          {session.auth === 'in' && session.error && <div className="banner bad"><span>{session.error}</span></div>}
          <header className="top">
            <h1>{cur.title}</h1>
            <div className="top-actions">
              <span className={'sync-dot ' + status} title={STATUS[status]} aria-label={STATUS[status]} />
              <button className="btn ghost-line" disabled={noAccounts} onClick={() => setVoice(true)} aria-label="Add by voice"><Icon name="mic" size={17} /><span>Speak</span></button>
              <button className="btn ghost-line hide-sm" disabled={noAccounts} onClick={() => setTxForm({})}><Icon name="plus" size={16} />Income, savings, transfer</button>
            </div>
          </header>
          <div className="page" key={page}>
            {page === 'dashboard' && <Dashboard />}
            {page === 'transactions' && <Transactions />}
            {page === 'accounts' && <Accounts />}
            {page === 'categories' && <Categories />}
            {page === 'cycles' && <Cycles />}
            {page === 'reports' && <Reports />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
        <nav className="tabbar" aria-label="Main">
          {TABS.slice(0, 2).map(id => <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}><Icon name={id === 'dashboard' ? 'home' : 'activity'} size={22} /><span>{NAV.find(n => n.id === id)!.label}</span></button>)}
          <button className="tab-add" disabled={noAccounts} onClick={() => setQuick({})} aria-label="Add expense"><Icon name="plus" size={26} /></button>
          <button className={page === 'reports' ? 'on' : ''} onClick={() => go('reports')} aria-current={page === 'reports' ? 'page' : undefined}><Icon name="insights" size={22} /><span>Insights</span></button>
          <button className={MORE.includes(page) ? 'on' : ''} onClick={() => setMore(true)}><Icon name="more" size={22} /><span>More</span></button>
        </nav>
      </div>
      {more && <Modal title="More" onClose={() => setMore(false)} narrow>
        <div className="more-grid">
          {MORE.map(id => <button key={id} className={'more-tile' + (page === id ? ' on' : '')} onClick={() => go(id)}><Icon name={id} size={22} /><span>{NAV.find(n => n.id === id)!.label}</span></button>)}
          <button className="more-tile" disabled={noAccounts} onClick={() => { setMore(false); setTxForm({ type: 'income' }); }}><Icon name="plus" size={22} /><span>Income, savings, transfer</span></button>
          <button className="more-tile" disabled={noAccounts} onClick={() => { setMore(false); setVoice(true); }}><Icon name="mic" size={22} /><span>Add by voice</span></button>
        </div>
        <p className={'sync ' + status}><i />{STATUS[status]}</p>
      </Modal>}
      {txForm && <TxForm key={txForm.id || 'new'} initial={txForm} onClose={() => setTxForm(null)} />}
      {quick && <QuickExpense preset={quick} onClose={() => setQuick(null)} />}
      {fix && <SalaryFix tx={fix} onClose={() => setFix(null)} />}
      {voice && <VoiceEntry onClose={() => setVoice(false)} />}
      {ask && <Modal title={ask.title} onClose={() => setAsk(null)} narrow>
        <p className="confirm-body">{ask.body}</p>
        <div className="form-actions"><button className="btn ghost" onClick={() => setAsk(null)}>Cancel</button><button className={'btn ' + (ask.danger ? 'danger' : 'primary')} autoFocus onClick={() => { const run = ask.run; setAsk(null); run(); }}>{ask.action}</button></div>
      </Modal>}
      {session.auth === 'in' && session.ready && session.joinId && session.joinId !== session.ledgerId && <Modal title="Join this family ledger?" onClose={() => store.dismissJoin()} narrow>
        <p className="confirm-body">You opened a family invite link. If you join, you will see and add to the family's shared accounts and transactions. Your current ledger is kept, and you can return to it by leaving the family later.</p>
        <div className="form-actions"><button className="btn ghost" onClick={() => store.dismissJoin()}>Not now</button><button className="btn primary" onClick={async () => { if (await store.join(session.joinId)) toast('You joined the family ledger'); }}>Join family ledger</button></div>
      </Modal>}
      {toastMsg && <div className="toast" role="status"><span>{toastMsg.text}</span>{toastMsg.undo && <button onClick={() => { toastMsg.undo!(); setToast(null); }}>Undo</button>}</div>}
    </Ctx.Provider>
  );
}
