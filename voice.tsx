// Voice entry: the app asks short questions aloud in Tamil or English, listens, and logs the transaction.
// Uses the browser's built-in speech recognition (Chrome on Android and desktop). Typing and tapping work at every step.
import React, { useEffect, useRef, useState } from 'react';
import { TxType, catOf, fmtMoney, today, uid } from './logic';
import { store } from './store';
import { Modal, useApp } from './ui';
import { defaultCat, methodFor } from './forms';
import { Heard, Lang, SAY, confirmText, isNo, isYes, parseUtterance } from './voiceParse';

type Step = 'amount' | 'what' | 'account' | 'confirm';
interface Draft { amount?: number; description?: string; categoryId?: string; accountId?: string; type: TxType; }
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
const CODE: Record<Lang, string> = { ta: 'ta-IN', en: 'en-IN' };

export function VoiceEntry({ onClose }: { onClose: () => void }) {
  const { book, toast } = useApp();
  const [lang, setLangState] = useState<Lang>(book.settings.voiceLang || 'ta');
  const [draft, setDraft] = useState<Draft>({ type: 'expense' });
  const [step, setStep] = useState<Step>('amount');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [msg, setMsg] = useState('');
  const [typed, setTyped] = useState('');
  const live = useRef({ draft, step, lang, book, closed: false, rec: null as any });
  live.current.draft = draft; live.current.step = step; live.current.lang = lang; live.current.book = book;

  const stopAll = () => { try { live.current.rec?.abort(); } catch { /* ignore */ } live.current.rec = null; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } setListening(false); };
  const listen = () => {
    if (!SR || live.current.closed) return;
    try { live.current.rec?.abort(); } catch { /* ignore */ }
    const rec = new SR(); live.current.rec = rec;
    rec.lang = CODE[live.current.lang]; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    let final = '';
    rec.onresult = (e: any) => { let t = ''; for (const r of e.results) t += r[0].transcript; setHeard(t); if (e.results[e.results.length - 1].isFinal) final = t; };
    rec.onerror = (e: any) => { setMsg(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow it in the browser settings, or type your answer.' : e.error === 'no-speech' ? 'Nothing heard. Tap the microphone and speak.' : e.error === 'network' ? 'Speech recognition needs an internet connection.' : ''); };
    rec.onend = () => { setListening(false); if (live.current.rec === rec) live.current.rec = null; if (final && !live.current.closed) answer(final); };
    try { rec.start(); setListening(true); setMsg(''); } catch { setListening(false); }
  };
  const say = (text: string, thenListen = true) => {
    const next = () => { if (thenListen) listen(); };
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return next();
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = CODE[live.current.lang]; u.rate = 1;
      const v = synth.getVoices().find(x => x.lang.replace('_', '-').toLowerCase().startsWith(live.current.lang));
      if (v) u.voice = v;
      let done = false; const fin = () => { if (!done) { done = true; next(); } };
      u.onend = fin; u.onerror = fin;
      window.setTimeout(fin, 900 + text.length * 110); // some phones never fire onend
      synth.speak(u);
    } catch { next(); }
  };
  const nextStep = (d: Draft): Step => (!d.amount ? 'amount' : !d.description ? 'what' : !d.accountId ? 'account' : 'confirm');
  const ask = (d: Draft, s: Step) => {
    setStep(s); setHeard(''); setTyped('');
    const L = live.current.lang, b = live.current.book;
    if (s === 'confirm') say(confirmText(L, d.type, d.amount!, d.description!, b.accounts.find(a => a.id === d.accountId)?.name || ''));
    else say(SAY[L][s]);
  };
  const merge = (d: Draft, h: Heard, s: Step, raw: string): Draft => {
    const b = live.current.book;
    const n: Draft = { ...d };
    if (h.amount && (!n.amount || s === 'amount')) n.amount = h.amount;
    if (h.accountId && (!n.accountId || s === 'account')) n.accountId = h.accountId;
    if (h.type) n.type = h.type;
    if (s !== 'account' && !(s === 'amount' && !h.amount) && h.description && (!n.description || s === 'what')) { n.description = h.description; n.categoryId = h.categoryId; }
    if (s === 'what' && !n.description && raw.trim()) n.description = raw.trim();
    if (!n.accountId && b.accounts.length === 1) n.accountId = b.accounts[0].id;
    if (n.description && (!n.categoryId || !b.categories.some(c => c.id === n.categoryId))) n.categoryId = defaultCat(b, n.type);
    return n;
  };
  const save = (d: Draft) => {
    const b = store.get();
    store.set({ ...b, txs: [...b.txs, { id: uid(), date: today(), accountId: d.accountId!, type: d.type, method: methodFor(b, d.accountId!), description: d.description!, categoryId: d.categoryId || defaultCat(b, d.type), amount: d.amount!, createdAt: Date.now(), notes: 'Added by voice' }] });
    toast(`Saved: ${fmtMoney(d.amount!)} ${d.description}`);
    const fresh: Draft = { type: 'expense' };
    setDraft(fresh); setStep('amount'); setHeard(''); setMsg(live.current.lang === 'ta' ? 'சேமிக்கப்பட்டது. அடுத்ததைச் சொல்லலாம், அல்லது மூடலாம்.' : 'Saved. Say the next one, or close.');
    say(SAY[live.current.lang].saved, false);
  };
  function answer(raw: string) {
    const { draft: d, step: s, lang: L } = live.current;
    if (s === 'confirm') {
      if (isNo(raw)) { const fresh: Draft = { type: 'expense' }; setDraft(fresh); setMsg(SAY[L].cancelled); return ask(fresh, 'amount'); }
      if (isYes(raw)) return save(d);
      setMsg(SAY[L].retry); return say(SAY[L].yes);
    }
    const n = merge(d, parseUtterance(raw, live.current.book), s, raw);
    setDraft(n);
    const ns = nextStep(n);
    if (ns === s) { setMsg(SAY[L].retry); return say(SAY[L].retry + ' ' + SAY[L][s]); }
    setMsg(''); ask(n, ns);
  }
  const setLang = (l: Lang) => {
    stopAll(); setLangState(l); live.current.lang = l;
    const b = store.get(); if (b.settings.voiceLang !== l) store.set({ ...b, settings: { ...b.settings, voiceLang: l } });
    ask(live.current.draft, live.current.step);
  };
  useEffect(() => { live.current.closed = false; ask(draft, 'amount'); return () => { live.current.closed = true; stopAll(); }; }, []); // eslint-disable-line

  const acc = book.accounts.find(a => a.id === draft.accountId);
  const cat = draft.categoryId ? catOf(book, draft.categoryId) : null;
  const q = step === 'confirm' ? (lang === 'ta' ? 'சேமிக்கலாமா?' : 'Save this?') : SAY[lang][step];
  return (
    <Modal title="Voice entry" onClose={onClose} narrow>
      <div className="voice">
        <div className="seg" role="group" aria-label="Language"><button className={lang === 'ta' ? 'on' : ''} onClick={() => setLang('ta')}>தமிழ்</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
        <p className="voice-q" lang={lang}>{q}</p>
        <button className={'mic' + (listening ? ' live' : '')} onClick={() => (listening ? stopAll() : listen())} disabled={!SR} aria-label={listening ? 'Stop listening' : 'Start listening'}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </button>
        <p className="voice-heard" aria-live="polite">{heard || (listening ? (lang === 'ta' ? 'கேட்கிறேன்…' : 'Listening…') : SR ? (lang === 'ta' ? 'பேச மைக்கைத் தொடவும்' : 'Tap the microphone to speak') : 'This browser has no speech recognition. Use Chrome, or type below.')}</p>
        {msg && <p className="hint">{msg}</p>}
        <dl className="voice-draft">
          <div><dt>Amount</dt><dd className="num">{draft.amount ? fmtMoney(draft.amount) : '…'}</dd></div>
          <div><dt>For</dt><dd>{draft.description ? <>{cat && <span className="emoji">{cat.icon}</span>}{draft.description}{cat && <em> ({cat.name}, {draft.type})</em>}</> : '…'}</dd></div>
          <div><dt>Account</dt><dd>{acc?.name || '…'}</dd></div>
        </dl>
        {step === 'account' && <div className="chips">{book.accounts.map(a => <button key={a.id} className="chip" onClick={() => { stopAll(); const n = { ...draft, accountId: a.id }; setDraft(n); ask(n, nextStep(n)); }}>{a.name}</button>)}</div>}
        {step === 'confirm'
          ? <div className="form-actions"><button className="btn ghost" onClick={() => { stopAll(); answer('no'); }}>Start again</button><button className="btn primary" onClick={() => { stopAll(); save(draft); }}>Save</button></div>
          : <form className="voice-type" onSubmit={e => { e.preventDefault(); if (typed.trim()) { stopAll(); answer(typed); } }}><input value={typed} onChange={e => setTyped(e.target.value)} placeholder={lang === 'ta' ? 'அல்லது இங்கே தட்டச்சு செய்யவும்' : 'Or type your answer'} /><button className="btn" type="submit">OK</button></form>}
        <p className="note">{lang === 'ta' ? 'ஒரே வாக்கியத்திலும் சொல்லலாம்: "பஸ் 120 கனரா"' : 'You can also say it in one go: "bus 120 canara"'}</p>
      </div>
    </Modal>
  );
}
