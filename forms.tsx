import React, { useState } from 'react';
import { Account, Book, Category, CatKind, METHODS, Method, OTHER, TYPES, Tx, TxType, today, uid } from './logic';
import { store } from './store';
import { Field, Modal, useApp } from './ui';

export const catsFor = (book: Book, type: TxType) =>
  book.categories.filter(c => type === 'adjustment' || c.kind === 'any' || c.kind === (type as CatKind));
export const defaultCat = (book: Book, type: TxType) => {
  const list = catsFor(book, type);
  if (type === 'income') return (list.find(c => c.id === 'salary') || list[0])?.id || OTHER;
  if (type === 'adjustment') return OTHER;
  return list[0]?.id || OTHER;
};
/** Reuse the category of the last transaction with the same description. */
export const guessCat = (book: Book, desc: string, type: TxType) => {
  const d = desc.trim().toLowerCase(); if (!d) return '';
  const hit = [...book.txs].reverse().find(t => t.type === type && t.description.trim().toLowerCase() === d);
  return hit && book.categories.some(c => c.id === hit.categoryId) ? hit.categoryId : '';
};
/** The account used by the most recently entered transaction. */
export const defaultAccount = (book: Book) => { const last = [...book.txs].sort((a, b) => b.createdAt - a.createdAt)[0]?.accountId; return book.accounts.some(a => a.id === last) ? last! : book.accounts[0]?.id || ''; };
export const methodFor = (book: Book, accountId: string): Method => {
  const hit = [...book.txs].reverse().find(t => t.accountId === accountId && t.type === 'expense');
  return hit ? hit.method : 'upi';
};

export function TxForm({ initial, onClose }: { initial: Partial<Tx>; onClose: () => void }) {
  const { book, toast } = useApp();
  const editing = !!initial.id;
  const [type, setType] = useState<TxType>(initial.type || 'expense');
  const [date, setDate] = useState(initial.date || today());
  const [accountId, setAccountId] = useState(initial.accountId || defaultAccount(book));
  const [toAccountId, setTo] = useState(initial.toAccountId || book.accounts.find(a => a.id !== (initial.accountId || defaultAccount(book)))?.id || '');
  const [description, setDesc] = useState(initial.description || '');
  const [categoryId, setCat] = useState(initial.categoryId || defaultCat(book, initial.type || 'expense'));
  const [catTouched, setCatTouched] = useState(editing);
  const [amount, setAmount] = useState(initial.amount !== undefined ? String(Math.abs(initial.amount)) : '');
  const [dir, setDir] = useState<'up' | 'down'>(initial.amount !== undefined && initial.amount < 0 ? 'down' : 'up');
  const [method, setMethod] = useState<Method>(initial.method || methodFor(book, initial.accountId || defaultAccount(book)));
  const [notes, setNotes] = useState(initial.notes || '');
  const [err, setErr] = useState('');

  const changeType = (t: TxType) => {
    setType(t);
    if (t !== 'transfer' && !catsFor(book, t).some(c => c.id === categoryId)) setCat(defaultCat(book, t));
    if (t === 'transfer') setMethod('bank');
  };
  const changeDesc = (v: string) => {
    setDesc(v);
    if (!catTouched && type !== 'transfer') { const g = guessCat(book, v, type); if (g) setCat(g); }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!accountId) return setErr('Choose an account. Add one on the Accounts page if you have none.');
    if (!(n > 0)) return setErr('Enter an amount greater than zero.');
    if (!date) return setErr('Choose a date.');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setErr('Choose two different accounts for a transfer.');
    const b = store.get();
    const tx: Tx = {
      id: initial.id || uid(), date, accountId, type, method,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      description: description.trim() || (type === 'transfer' ? 'Transfer' : book.categories.find(c => c.id === categoryId)?.name || 'Transaction'),
      categoryId: type === 'transfer' ? '' : categoryId,
      amount: type === 'adjustment' && dir === 'down' ? -n : n,
      notes: notes.trim() || undefined,
      createdAt: initial.createdAt || Date.now(),
    };
    store.set({ ...b, txs: editing ? b.txs.map(t => (t.id === tx.id ? tx : t)) : [...b.txs, tx] });
    toast(editing ? 'Transaction updated' : 'Transaction added');
    onClose();
  };
  const cats = catsFor(book, type);
  return (
    <Modal title={editing ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
      <form onSubmit={save} className="form">
        <div className="seg wide" role="group" aria-label="Transaction type">
          {TYPES.map(t => <button type="button" key={t.id} className={type === t.id ? 'on' : ''} onClick={() => changeType(t.id)}>{t.label}</button>)}
        </div>
        <Field label="Amount (₹)"><input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus required /></Field>
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></Field>
        <Field label={type === 'transfer' ? 'From account' : 'Account'}>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>{book.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        {type === 'transfer'
          ? <Field label="To account"><select value={toAccountId} onChange={e => setTo(e.target.value)}>{book.accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          : <Field label="Category"><select value={categoryId} onChange={e => { setCat(e.target.value); setCatTouched(true); }}>{cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>}
        {type === 'adjustment' && <Field label="Effect on balance"><select value={dir} onChange={e => setDir(e.target.value as any)}><option value="up">Increase balance</option><option value="down">Decrease balance</option></select></Field>}
        <Field label="Description" wide={type !== 'adjustment'}><input value={description} onChange={e => changeDesc(e.target.value)} placeholder={type === 'income' ? 'Salary' : type === 'transfer' ? 'Transfer' : 'Bus, rent, groceries'} /></Field>
        <Field label="Payment method"><select value={method} onChange={e => setMethod(e.target.value as Method)}>{METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
        <Field label="Notes (optional)"><input value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        {type === 'income' && categoryId === 'salary' && !editing && <p className="hint wide">{book.settings.cycleBy && (book.members || []).length > 1 ? 'Counts as family income. The cycle follows the main earner chosen in Settings.' : `Saving this starts a new salary cycle on ${date || 'this date'}.`}</p>}
        {type === 'transfer' && <p className="hint wide">A transfer moves money between your accounts. It is never counted as income or spending.</p>}
        {err && <p className="error wide" role="alert">{err}</p>}
        <div className="form-actions wide">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{editing ? 'Save changes' : 'Add transaction'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function QuickExpense({ onClose }: { onClose: () => void }) {
  const { book, toast } = useApp();
  const [amount, setAmount] = useState('');
  const [description, setDesc] = useState('');
  const [categoryId, setCat] = useState(defaultCat(book, 'expense'));
  const [catTouched, setCatTouched] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccount(book));
  const [date, setDate] = useState(today());
  const [err, setErr] = useState('');
  const save = (again: boolean) => {
    const n = parseFloat(amount);
    if (!accountId) return setErr('Add an account first, on the Accounts page.');
    if (!(n > 0)) return setErr('Enter an amount greater than zero.');
    const b = store.get();
    const name = book.categories.find(c => c.id === categoryId)?.name || 'Expense';
    store.set({ ...b, txs: [...b.txs, { id: uid(), date, accountId, type: 'expense', method: methodFor(b, accountId), description: description.trim() || name, categoryId, amount: n, createdAt: Date.now() }] });
    toast(`Expense saved: ₹${n.toLocaleString('en-IN')} ${description.trim() || name}`);
    if (again) { setAmount(''); setDesc(''); setCatTouched(false); setErr(''); (document.getElementById('quick-amount') as HTMLInputElement | null)?.focus(); }
    else onClose();
  };
  return (
    <Modal title="Add expense" onClose={onClose} narrow>
      <form onSubmit={e => { e.preventDefault(); save(false); }} className="form quick">
        <Field label="Amount (₹)" wide><input id="quick-amount" className="big" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus required /></Field>
        <Field label="Description" wide><input value={description} placeholder="Bus" onChange={e => { setDesc(e.target.value); if (!catTouched) { const g = guessCat(book, e.target.value, 'expense'); if (g) setCat(g); } }} /></Field>
        <Field label="Category"><select value={categoryId} onChange={e => { setCat(e.target.value); setCatTouched(true); }}>{catsFor(book, 'expense').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
        <Field label="Account"><select value={accountId} onChange={e => setAccountId(e.target.value)}>{book.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Date" wide><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></Field>
        {err && <p className="error wide" role="alert">{err}</p>}
        <div className="form-actions wide">
          <button type="button" className="btn ghost" onClick={() => save(true)}>Save and add another</button>
          <button type="submit" className="btn primary">Save expense</button>
        </div>
      </form>
    </Modal>
  );
}

export function AccountForm({ initial, onClose }: { initial?: Account; onClose: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(initial?.name || '');
  const [opening, setOpening] = useState(initial ? String(initial.opening) : '0');
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const b = store.get();
    const a: Account = { id: initial?.id || uid(), name: name.trim(), opening: parseFloat(opening) || 0, sample: initial?.sample };
    store.set({ ...b, accounts: initial ? b.accounts.map(x => (x.id === a.id ? a : x)) : [...b.accounts, a] });
    toast(initial ? 'Account updated' : 'Account added');
    onClose();
  };
  return (
    <Modal title={initial ? 'Edit account' : 'Add account'} onClose={onClose} narrow>
      <form onSubmit={save} className="form quick">
        <Field label="Account name" wide><input value={name} onChange={e => setName(e.target.value)} placeholder="Canara, Kotak, Cash" autoFocus required /></Field>
        <Field label="Opening balance (₹)" wide><input type="number" step="0.01" value={opening} onChange={e => setOpening(e.target.value)} /></Field>
        <p className="hint wide">The opening balance is what the account held before the first transaction you record here.</p>
        <div className="form-actions wide"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">{initial ? 'Save changes' : 'Add account'}</button></div>
      </form>
    </Modal>
  );
}

export function CategoryForm({ initial, onClose }: { initial?: Category; onClose: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '🏷');
  const [kind, setKind] = useState<CatKind>(initial?.kind || 'expense');
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const b = store.get();
    const c: Category = { id: initial?.id || uid(), name: name.trim(), icon: icon.trim() || '🏷', kind: initial?.system ? initial.kind : kind, system: initial?.system };
    store.set({ ...b, categories: initial ? b.categories.map(x => (x.id === c.id ? c : x)) : [...b.categories, c] });
    toast(initial ? 'Category updated' : 'Category added');
    onClose();
  };
  return (
    <Modal title={initial ? 'Edit category' : 'Add category'} onClose={onClose} narrow>
      <form onSubmit={save} className="form quick">
        <Field label="Name" wide><input value={name} onChange={e => setName(e.target.value)} autoFocus required /></Field>
        <Field label="Icon (emoji)"><input value={icon} onChange={e => setIcon(e.target.value)} maxLength={8} /></Field>
        <Field label="Used for"><select value={kind} disabled={initial?.system} onChange={e => setKind(e.target.value as CatKind)}><option value="expense">Expenses</option><option value="income">Income</option><option value="savings">Savings</option><option value="any">Any type</option></select></Field>
        <div className="form-actions wide"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">{initial ? 'Save changes' : 'Add category'}</button></div>
      </form>
    </Modal>
  );
}
