import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Filters, Tx, computeBalances, defaultFilters, resolvePeriod } from './logic';
import { store } from './store';
import { AppCtx, ConfirmOpts, Ctx, Icon, Modal, Page } from './ui';
import { QuickExpense, TxForm } from './forms';
import { VoiceEntry } from './voice';
import { Accounts, Categories, Cycles, Dashboard, Reports, Settings, Transactions } from './pages';

const NAV: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' }, { id: 'transactions', label: 'Transactions' }, { id: 'accounts', label: 'Accounts' }, { id: 'categories', label: 'Categories' },
  { id: 'cycles', label: 'Salary cycles' }, { id: 'reports', label: 'Reports' }, { id: 'settings', label: 'Settings' },
];
const STATUS: Record<string, string> = { demo: 'Demo mode, nothing is saved', syncing: 'Saving', synced: 'Saved online', error: 'Last change not saved' };
const Mic = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;

export default function App() {
  const book = useSyncExternalStore(store.subscribe, store.get, store.get);
  const session = useSyncExternalStore(store.subscribe, store.session, store.session);
  const status = session.status;
  const [voice, setVoice] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [filters, setF] = useState<Filters>(defaultFilters);
  const [txForm, setTxForm] = useState<Partial<Tx> | null>(null);
  const [quick, setQuick] = useState(false);
  const [ask, setAsk] = useState<ConfirmOpts | null>(null);
  const [toastMsg, setToast] = useState('');
  const bal = useMemo(() => computeBalances(book), [book]);
  const range = useMemo(() => resolvePeriod(filters.period, book), [filters.period, book]);
  const toast = useCallback((s: string) => { setToast(s); window.setTimeout(() => setToast(t => (t === s ? '' : t)), 2600); }, []);
  const ctx: AppCtx = {
    book, bal, filters, range,
    setFilters: f => setF(old => ({ ...old, ...f })),
    go: p => { setPage(p); window.scrollTo(0, 0); },
    editTx: t => setTxForm(t || {}),
    quickAdd: () => setQuick(true),
    confirm: setAsk, toast,
  };
  const noAccounts = !book.accounts.length;
  if (session.auth === 'loading' || (session.auth === 'in' && !session.ready)) return <div className="gate"><p className="note">{session.error || 'Loading your ledger'}</p></div>;
  if (session.auth === 'out') return (
    <div className="gate"><div className="gate-card">
      <img className="gate-logo" src="./logo.png" alt="Grow with Jana" />
      <h1>Know where your salary went, from one payday to the next.</h1>
      <p className="note">{session.joinId ? 'You have been invited to a family ledger. Sign in to join it.' : 'Sign in to keep your accounts and transactions private to you and in step across your phone and laptop.'}</p>
      <button className="btn primary" onClick={() => store.signIn()}>Continue with Google</button>
      {session.error && <p className="error" role="alert">{session.error}</p>}
    </div></div>
  );
  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className="side" aria-label="Main">
          <div className="brand"><img src="./logo.png" alt="Grow with Jana" /></div>
          <ul>{NAV.map(n => <li key={n.id}><button className={page === n.id ? 'on' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => ctx.go(n.id)}><Icon name={n.id} /><span>{n.label}</span></button></li>)}</ul>
          <p className={'sync ' + status}><i />{STATUS[status]}</p>
        </nav>
        <main>
          {session.auth === 'demo' && <div className="banner"><span>Demo mode. Firebase is not connected, so nothing is saved. See the README to go live.</span></div>}
          {session.auth === 'in' && session.error && <div className="banner"><span className="neg">{session.error}</span></div>}
          <header className="top">
            <h1>{NAV.find(n => n.id === page)!.label}</h1>
            <div className="top-actions">
              <button className="btn" disabled={noAccounts} onClick={() => setVoice(true)}><Mic />Speak</button>
              <button className="btn" disabled={noAccounts} onClick={() => setQuick(true)}><Icon name="plus" size={16} />Expense</button>
              <button className="btn primary" disabled={noAccounts} onClick={() => setTxForm({})}><Icon name="plus" size={16} />Add transaction</button>
            </div>
          </header>
          {page === 'dashboard' && <Dashboard />}
          {page === 'transactions' && <Transactions />}
          {page === 'accounts' && <Accounts />}
          {page === 'categories' && <Categories />}
          {page === 'cycles' && <Cycles />}
          {page === 'reports' && <Reports />}
          {page === 'settings' && <Settings />}
        </main>
        {!noAccounts && <button className="fab mic-fab" onClick={() => setVoice(true)} aria-label="Add by voice"><Mic size={24} /></button>}
        {!noAccounts && <button className="fab" onClick={() => setQuick(true)} aria-label="Add expense"><Icon name="plus" size={24} /></button>}
      </div>
      {txForm && <TxForm key={txForm.id || 'new'} initial={txForm} onClose={() => setTxForm(null)} />}
      {quick && <QuickExpense onClose={() => setQuick(false)} />}
      {voice && <VoiceEntry onClose={() => setVoice(false)} />}
      {ask && <Modal title={ask.title} onClose={() => setAsk(null)} narrow>
        <p className="confirm-body">{ask.body}</p>
        <div className="form-actions"><button className="btn ghost" onClick={() => setAsk(null)}>Cancel</button><button className={'btn ' + (ask.danger ? 'danger' : 'primary')} autoFocus onClick={() => { const run = ask.run; setAsk(null); run(); }}>{ask.action}</button></div>
      </Modal>}
      {session.auth === 'in' && session.ready && session.joinId && session.joinId !== session.ledgerId && <Modal title="Join this family ledger?" onClose={() => store.dismissJoin()} narrow>
        <p className="confirm-body">You opened a family invite link. If you join, you will see and add to the family's shared accounts and transactions. Your current ledger is kept, and you can return to it by leaving the family later.</p>
        <div className="form-actions"><button className="btn ghost" onClick={() => store.dismissJoin()}>Not now</button><button className="btn primary" onClick={async () => { if (await store.join(session.joinId)) toast('You joined the family ledger'); }}>Join family ledger</button></div>
      </Modal>}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
