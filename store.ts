// Data layer. Everything is stored in Cloud Firestore, never in browser storage.
//   users/{uid}                 which ledger this person is using
//   ledgers/{id}                owner, members, whether joining is open
//   ledgers/{id}/book/main      accounts, categories, settings
//   ledgers/{id}/txs/{txId}     one document per transaction
// A ledger is private to its members. A family shares one ledger; a single person has a ledger of one.
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, User, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { arrayRemove, arrayUnion, collection, deleteField, doc, getFirestore, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Book, Member, Tx } from './logic';
import { emptyBook, sampleBook } from './sample';
import { firebaseConfig } from './firebaseConfig';

export type SyncStatus = 'demo' | 'syncing' | 'synced' | 'error';
export type AuthState = 'loading' | 'out' | 'in' | 'demo';
export interface Session { auth: AuthState; ready: boolean; status: SyncStatus; uid: string; name: string; email: string; error: string; ledgerId: string; ownerId: string; inviteOpen: boolean; joinId: string; }

export function normalise(b: any): Book | null {
  if (!b || !Array.isArray(b.accounts) || !Array.isArray(b.categories) || !Array.isArray(b.txs)) return null;
  return { accounts: b.accounts, categories: b.categories, txs: b.txs, settings: { hasSample: !!b.settings?.hasSample, voiceLang: b.settings?.voiceLang === 'en' ? 'en' : 'ta', cycleBy: b.settings?.cycleBy || '' } };
}
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const configured = !firebaseConfig.apiKey.startsWith('PASTE');
const readJoin = () => { try { const m = location.hash.match(/join=([A-Za-z0-9]{10,40})/); if (m) history.replaceState(null, '', location.pathname + location.search); return m ? m[1] : ''; } catch { return ''; } };

let book: Book = configured ? emptyBook() : sampleBook();
const blank = { uid: '', name: '', email: '', error: '', ledgerId: '', ownerId: '', inviteOpen: false, joinId: '' };
let session: Session = configured ? { ...blank, auth: 'loading', ready: false, status: 'syncing', joinId: typeof location !== 'undefined' ? readJoin() : '' } : { ...blank, auth: 'demo', ready: true, status: 'demo' };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const patch = (p: Partial<Session>) => { session = { ...session, ...p }; emit(); };

let fb: { auth: ReturnType<typeof getAuth>; db: ReturnType<typeof getFirestore> } | null = null;
let me: User | null = null;
let ownLedgerId = '';
let stopUser: (() => void) | null = null;
let stopLedger: (() => void)[] = [];
let meta: any = null, txs: Tx[] | null = null, members: Member[] = [];
let pending = 0;
let creating = false;

const userRef = () => doc(fb!.db, 'users', me!.uid);
const ledgerRef = (id = session.ledgerId) => doc(fb!.db, 'ledgers', id);
const metaRef = () => doc(fb!.db, 'ledgers', session.ledgerId, 'book', 'main');
const txCol = () => collection(fb!.db, 'ledgers', session.ledgerId, 'txs');
const myName = () => me?.displayName || me?.email?.split('@')[0] || 'Member';

const rebuild = () => {
  if (!meta || !txs) return;
  const b = normalise({ ...meta, txs });
  if (b) book = { ...b, members };
  session = { ...session, ready: true, status: pending ? 'syncing' : session.status === 'error' ? 'error' : 'synced' };
  emit();
};

async function createOwnLedger() {
  if (creating) return;
  creating = true;
  try {
  const ref = doc(collection(fb!.db, 'ledgers'));
  await setDoc(ref, { owner: me!.uid, members: [me!.uid], names: { [me!.uid]: myName() }, inviteOpen: false, createdAt: Date.now() });
  await setDoc(userRef(), { ledgerId: ref.id, ownLedgerId: ref.id });
  } finally { creating = false; }
}

function openLedger(id: string) {
  stopLedger.forEach(f => f()); stopLedger = [];
  meta = null; txs = null; members = [];
  patch({ ledgerId: id, ready: false, ownerId: '', inviteOpen: false });
  const fail = (e: any) => patch({ status: 'error', error: e?.code === 'permission-denied' ? 'The database refused access. Check that the security rules from firestore.rules are published.' : 'Could not reach the database. Check your connection.' });
  stopLedger.push(onSnapshot(ledgerRef(id), s => {
    const d: any = s.data() || {};
    members = (d.members || []).map((m: string) => ({ id: m, name: d.names?.[m] || 'Member' }));
    session = { ...session, ownerId: d.owner || '', inviteOpen: !!d.inviteOpen };
    if (meta && txs) rebuild(); else emit();
  }, e => {
    // Removed from a family ledger: fall back to this person's own ledger.
    if (e?.code === 'permission-denied' && id !== ownLedgerId) { (ownLedgerId ? setDoc(userRef(), { ledgerId: ownLedgerId, ownLedgerId }) : createOwnLedger()).catch(fail); }
    else fail(e);
  }));
  stopLedger.push(onSnapshot(metaRef(), s => {
    if (!s.exists()) { const e = emptyBook(); setDoc(metaRef(), clean({ accounts: e.accounts, categories: e.categories, settings: e.settings })).catch(() => {}); return; }
    meta = s.data(); rebuild();
  }, () => {}));
  stopLedger.push(onSnapshot(txCol(), s => { txs = s.docs.map(d => d.data() as Tx); rebuild(); }, () => {}));
}

function listen(user: User) {
  me = user;
  patch({ auth: 'in', ready: false, uid: user.uid, name: user.displayName || '', email: user.email || '', error: '' });
  stopUser = onSnapshot(userRef(), s => {
    const d: any = s.data();
    if (!d?.ledgerId) { createOwnLedger().catch(() => patch({ status: 'error', error: 'Could not set up your ledger. Check that the security rules from firestore.rules are published.' })); return; }
    ownLedgerId = d.ownLedgerId || '';
    if (d.ledgerId !== session.ledgerId) openLedger(d.ledgerId);
  }, () => patch({ status: 'error', error: 'Could not reach the database. Check your connection and the security rules.' }));
}

if (configured) {
  const app = initializeApp(firebaseConfig);
  fb = { auth: getAuth(app), db: getFirestore(app) }; // Firestore's default cache is memory-only: no data is left on the device
  onAuthStateChanged(fb.auth, user => {
    stopUser?.(); stopUser = null; stopLedger.forEach(f => f()); stopLedger = [];
    if (user) listen(user);
    else { me = null; book = emptyBook(); patch({ ...blank, joinId: session.joinId, auth: 'out', ready: false }); }
  });
}

async function write(prev: Book, next: Book) {
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  const before = new Map(prev.txs.map(t => [t.id, JSON.stringify(t)]));
  const after = new Set<string>();
  for (const t of next.txs) { after.add(t.id); if (before.get(t.id) !== JSON.stringify(t)) ops.push(b => b.set(doc(txCol(), t.id), clean(t))); }
  for (const id of before.keys()) if (!after.has(id)) ops.push(b => b.delete(doc(txCol(), id)));
  const m = (b: Book) => ({ accounts: b.accounts, categories: b.categories, settings: b.settings });
  if (JSON.stringify(m(prev)) !== JSON.stringify(m(next))) ops.push(b => b.set(metaRef(), clean(m(next))));
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(fb!.db); ops.slice(i, i + 400).forEach(f => f(b)); await b.commit(); }
}
const run = (p: Promise<any>, failMsg: string) => p.then(() => true).catch(() => { patch({ error: failMsg }); return false; });

export const store = {
  get: () => book,
  session: () => session,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  /** Replace the whole book. Only the documents that changed are written. New transactions are stamped with who entered them. */
  set(next: Book) {
    const prev = book;
    if (me) { const had = new Set(prev.txs.map(t => t.id)); next = { ...next, txs: next.txs.map(t => (t.by || had.has(t.id) ? t : { ...t, by: me!.uid })) }; }
    book = { ...next, members: prev.members };
    if (!fb || !me || !session.ledgerId) { emit(); return; } // demo mode: memory only
    pending++; patch({ status: 'syncing' });
    write(prev, book)
      .then(() => { pending--; patch({ status: pending ? 'syncing' : 'synced', error: '' }); })
      .catch(() => { pending--; patch({ status: 'error', error: 'The last change did not reach the database. Check your connection and try again.' }); });
  },
  async signIn() {
    if (!fb) return;
    const p = new GoogleAuthProvider();
    try { await signInWithPopup(fb.auth, p); }
    catch (e: any) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(fb.auth, p);
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') patch({ error: e?.code === 'auth/unauthorized-domain' ? 'This web address is not allowed yet. Add it under Authentication > Settings > Authorized domains in Firebase.' : 'Sign-in failed. Try again.' });
    }
  },
  signOut() { if (fb) signOut(fb.auth); },

  // ----- Family sharing -----
  inviteLink: () => (typeof location !== 'undefined' ? `${location.origin}${location.pathname}#join=${session.ledgerId}` : ''),
  setInviteOpen: (open: boolean) => run(updateDoc(ledgerRef(), { inviteOpen: open }), 'Could not change the invite setting.'),
  dismissJoin() { patch({ joinId: '' }); },
  /** Join the family ledger from an invite link. Works only while its owner has joining switched on. */
  async join(id: string) {
    patch({ joinId: '' });
    const ok = await run(updateDoc(ledgerRef(id), { members: arrayUnion(me!.uid), [`names.${me!.uid}`]: myName() }), 'This invite link is closed or not valid. Ask the owner to switch on "Allow joining" and send the link again.');
    if (ok) await run(setDoc(userRef(), { ledgerId: id, ownLedgerId }), 'Joined, but could not switch ledgers. Reload the page.');
    return ok;
  },
  /** Leave the family ledger and go back to your own. */
  async leave() {
    const id = session.ledgerId;
    if (!ownLedgerId || ownLedgerId === id) await createOwnLedger(); else await setDoc(userRef(), { ledgerId: ownLedgerId, ownLedgerId });
    await updateDoc(ledgerRef(id), { members: arrayRemove(me!.uid), [`names.${me!.uid}`]: deleteField() }).catch(() => {});
  },
  removeMember: (id: string) => run(updateDoc(ledgerRef(), { members: arrayRemove(id), [`names.${id}`]: deleteField() }), 'Could not remove that member.'),
};
