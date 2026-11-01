import { useEffect, useMemo, useRef, useState } from 'react';
import { Book, Plant, QuickPick, catOf, dayIndex, fmtMoney, memberName, moneyPlant, quickPicks, tipsFor, today, uid, waterPlant } from './logic';
import { methodFor } from './forms';
import { chime, coin, setSoundOn, soundOn, tick, water as pour } from './sounds';
import { enableReminders, remindBlocked, remindOn, remindSupported } from './reminders';
import { store } from './store';

// The welcome moment shown each time the app opens: a greeting, a money plant that grows with savings
// (watered once a day for a streak), one-tap logging of frequent spends, and a saving tip of the day.

const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const LEAVES = [0, 2, 4, 6, 8, 10];
const HEIGHT = [0, 60, 96, 126, 150, 170];

/** Point on the stem (a cubic curve from the pot up to the top). */
function stemAt(u: number, top: number) {
  const p0 = [100, 196], p1 = [92, 196 - top * 0.35], p2 = [110, 196 - top * 0.7], p3 = [100, 196 - top];
  const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
const LEAF = 'M0 0 C 6 -9 18 -13 25 -8 C 30 -4 28 3 22 6 C 26 9 24 15 18 15 C 10 15 3 8 0 0 Z';

function PlantArt({ plant, watering }: { plant: Plant; watering: boolean }) {
  const top = HEIGHT[plant.stage];
  const count = plant.stage === 0 ? 0 : Math.min(14, LEAVES[plant.stage] + Math.min(plant.streak, 4));
  const leaves = Array.from({ length: count }, (_, i) => {
    const u = 0.16 + (i / Math.max(1, count - 1)) * 0.8, [x, y] = stemAt(Math.min(u, 0.97), top), side = i % 2 ? 1 : -1;
    return { x, y, side, s: 1.25 - u * 0.45, rot: side > 0 ? -28 + (i % 3) * 16 : 208 - (i % 3) * 16, i };
  });
  const [tx, ty] = stemAt(1, top);
  return (
    <svg className={'wl-plant' + (watering ? ' drink' : '')} viewBox="0 -24 200 274" aria-hidden="true">
      <defs>
        <linearGradient id="wl-pot" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#23261C" /><stop offset="1" stopColor="#101209" /></linearGradient>
        <radialGradient id="wl-coin" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFF1A8" /><stop offset=".55" stopColor="#F2C230" /><stop offset="1" stopColor="#A8740A" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="242" rx="58" ry="6" fill="rgba(0,0,0,.35)" />
      <g className="wl-sway">
        {plant.stage === 0 ? (
          <g className="wl-seed"><ellipse cx="100" cy="194" rx="9" ry="6" fill="#8A5A2B" /><path d="M100 188 q2 -6 6 -8" stroke="#8CC70A" strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>
        ) : (
          <>
            <path className="wl-stem" d={`M100 196 C 92 ${196 - top * 0.35} 110 ${196 - top * 0.7} 100 ${196 - top}`} stroke="#5E8F12" strokeWidth="4" fill="none" strokeLinecap="round" pathLength={1} />
            {leaves.map(l => (
              <g key={l.i} transform={`translate(${l.x} ${l.y}) rotate(${l.rot}) scale(${l.s})`}>
                <line className="wl-leaf" style={{ animationDelay: `${0.35 + l.i * 0.07}s` }} x1="0" y1="0" x2="7" y2="0" stroke="#5E8F12" strokeWidth="1.6" />
                <g transform="translate(6 0)"><path className="wl-leaf" style={{ animationDelay: `${0.35 + l.i * 0.07}s` }} d={LEAF} fill={l.i % 3 === 1 ? '#8CC70A' : l.i % 3 === 2 ? '#6FA30C' : '#C6F432'} /></g>
              </g>
            ))}
            {plant.stage >= 4 && [0.5, 0.78, 1].map((u, k) => { const [x, y] = stemAt(u, top); return (
              <g key={'f' + k} transform={`translate(${x + (k % 2 ? 14 : -14)} ${y - 6})`}><g className="wl-pop" style={{ animationDelay: `${1.1 + k * 0.15}s` }}>
                {[0, 72, 144, 216, 288].map(a => <ellipse key={a} rx="4" ry="7" cy="-6" fill="#FFF6D0" transform={`rotate(${a})`} />)}<circle r="3.4" fill="#F2C230" />
              </g></g>); })}
            {plant.stage >= 5 && [0.4, 0.62, 0.86].map((u, k) => { const [x, y] = stemAt(u, top); const dx = k % 2 ? -26 : 26; return (
              <g key={'c' + k} transform={`translate(${x + dx} ${y + 4})`}><g className="wl-pop" style={{ animationDelay: `${1.4 + k * 0.15}s` }}>
                <line x1="0" y1="-10" x2="0" y2="-2" stroke="#5E8F12" strokeWidth="1.5" /><circle r="8" fill="url(#wl-coin)" /><text y="3.4" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#7A5205">₹</text>
              </g></g>); })}
            <circle cx={tx} cy={ty} r="3" fill="#C6F432" className="wl-bud" />
          </>
        )}
      </g>
      <path d="M58 196 H142 L132 240 H68 Z" fill="url(#wl-pot)" />
      <rect x="54" y="190" width="92" height="12" rx="4" fill="#2C3022" />
      <rect x="54" y="190" width="92" height="3" rx="1.5" fill="#C6F432" opacity=".8" />
      <ellipse cx="100" cy="192" rx="40" ry="3.4" fill="#3B2615" />
    </svg>
  );
}

/** A burst of confetti from a point. Returns a function that fires it. */
function useConfetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const fire = (x: number, y: number, n = 90) => {
    const cv = ref.current; if (!cv || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; const cx = cv.getContext('2d')!; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const C = ['#C6F432', '#F2C230', '#FFFFFF', '#FF7E98', '#6E9BFF'];
    const ps = Array.from({ length: n }, () => { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 5 + Math.random() * 7;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: C[Math.random() * C.length | 0], s: (Math.random() - 0.5) * 0.4, coin: Math.random() < 0.18 }; });
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = (t - t0) / 1000; cx.clearRect(0, 0, W, H);
      for (const p of ps) { p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.s;
        cx.save(); cx.globalAlpha = Math.max(0, 1 - k / 2.2); cx.translate(p.x, p.y); cx.rotate(p.r);
        if (p.coin) { cx.scale(Math.abs(Math.cos(p.r * 2)) + 0.15, 1); cx.fillStyle = '#F2C230'; cx.beginPath(); cx.arc(0, 0, 5, 0, 6.283); cx.fill(); }
        else { cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        cx.restore(); }
      if (k < 2.2) requestAnimationFrame(tick); else cx.clearRect(0, 0, W, H);
    };
    requestAnimationFrame(tick);
  };
  return { ref, fire };
}

const STAGE_KEY = 'gwj-stage';
const STAGE_TEXT = ['', 'Your seed has sprouted!', 'Your money plant is growing!', 'Your money plant is leafy now!', 'Your money plant is flowering!', 'It is a money tree!'];

export function Welcome({ book, name, onDone, onVoice }: { book: Book; name: string; onDone: () => void; onVoice: () => void }) {
  const plant = useMemo(() => moneyPlant(book), [book]);
  const tips = useMemo(() => tipsFor(book), [book]);
  const picks = useMemo(() => quickPicks(book, 12).filter(p => p.count >= 3 && p.amount <= 2000).slice(0, 6), [book]); // small, frequent spends only: no accidental one-tap rent
  const [i, setI] = useState(() => dayIndex(tipsFor(book).length));
  const [watering, setWatering] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [poke, setPoke] = useState(0);
  const [logged, setLogged] = useState<{ id: string; text: string } | null>(null);
  const [levelUp, setLevelUp] = useState(0);
  const [how, setHow] = useState(false);
  const [sound, setSound] = useState(soundOn());
  const [remind, setRemind] = useState<{ show: boolean; msg: string }>(() => ({ show: remindSupported() && !remindOn() && !remindBlocked(), msg: '' }));
  const { ref, fire } = useConfetti();
  const tip = tips[i % Math.max(1, tips.length)];
  const first = name.trim().split(' ')[0];
  const me = store.session().uid;
  const who = (by?: string) => (by && by === me ? 'you' : memberName(book, by) || 'your family');
  const center = () => fire(window.innerWidth / 2, window.innerHeight * 0.35, 140);

  // Celebrate when the plant has grown to a new stage since it was last seen on this phone.
  useEffect(() => {
    const key = STAGE_KEY + ':' + (store.session().ledgerId || 'local');
    let prev: number | null = null;
    try { const v = localStorage.getItem(key); prev = v === null ? null : Number(v); localStorage.setItem(key, String(plant.stage)); } catch { /* storage blocked */ }
    if (prev !== null && plant.stage > prev) { const t = window.setTimeout(() => { setLevelUp(plant.stage); center(); chime(); }, 900); return () => window.clearTimeout(t); }
  }, [plant.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const water = (e: React.MouseEvent) => {
    if (plant.wateredToday || watering) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setWatering(true); pour();
    try { navigator.vibrate?.(15); } catch { /* not supported */ }
    window.setTimeout(() => { store.set(waterPlant(store.get(), me || undefined)); fire(r.left + r.width / 2, r.top - 120, 110); chime(); }, 900);
    window.setTimeout(() => setWatering(false), 1700);
  };
  const log = (p: QuickPick, e: React.MouseEvent) => {
    const b = store.get();
    const accountId = b.accounts.some(a => a.id === p.accountId) ? p.accountId : b.accounts[0]?.id;
    if (!accountId) return;
    const id = uid();
    store.set({ ...b, txs: [...b.txs, { id, date: today(), accountId, type: 'expense', method: methodFor(b, accountId), description: p.description, categoryId: p.categoryId, amount: p.amount, createdAt: Date.now() }] });
    setLogged({ id, text: `Logged ${fmtMoney(p.amount)} ${p.description}` });
    setPoke(n => n + 1); coin();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); fire(r.left + r.width / 2, r.top, 26);
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
  };
  const undo = () => { if (!logged) return; const b = store.get(); store.set({ ...b, txs: b.txs.filter(t => t.id !== logged.id) }); setLogged(null); };
  const close = () => { setLeaving(true); window.setTimeout(onDone, 380); };
  const wateredLabel = plant.wateredBy && plant.wateredBy !== me ? `Watered today by ${who(plant.wateredBy)} ✓` : 'Watered today ✓ See you tomorrow';

  return (
    <div className={'welcome' + (leaving ? ' out' : '')} role="dialog" aria-label="Welcome">
      <canvas ref={ref} className="wl-confetti" aria-hidden="true" />
      <header className="wl-head">
        <button className="wl-sound" onClick={() => { const v = !sound; setSoundOn(v); setSound(v); if (v) tick(); }} aria-label={sound ? 'Turn sounds off' : 'Turn sounds on'}>{sound ? '🔊' : '🔇'}</button>
        <p className="wl-hello">{greet()}{first ? ',' : ''}</p>
        {first && <h1>{first}</h1>}
      </header>

      <section className="wl-garden">
        <div className={'wl-can' + (watering ? ' pour' : '')} aria-hidden="true">
          <svg viewBox="0 0 64 48"><path d="M10 14 h28 a4 4 0 0 1 4 4 v20 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 v-20 a4 4 0 0 1 4 -4z" fill="#6E9BFF" /><path d="M42 22 L60 10 L62 13 L44 28 Z" fill="#6E9BFF" /><path d="M14 14 q10 -14 22 0" stroke="#6E9BFF" strokeWidth="4" fill="none" /></svg>
          <i /><i /><i /><i />
        </div>
        <div key={poke} className={poke ? 'wl-wiggle' : ''}><PlantArt plant={plant} watering={watering} /></div>
        <div className="wl-plant-info">
          <span className="wl-chip">{plant.name}{plant.income > 0 ? ` · ${Math.round(plant.rate * 100)}% saved` : ''}</span>
          {plant.streak > 0 && <span className="wl-chip streak">🔥 {plant.streak}-day streak</span>}
        </div>
        <p className="wl-next">{plant.next} <button className="wl-how" onClick={() => setHow(!how)}>{how ? 'Hide' : 'How it grows'}</button></p>
        {how && <p className="wl-how-text">Your plant grows with the share of this cycle's income you save. Entries of type Savings count, and so do transfers into an account marked "This is a savings account" (Accounts → edit). Water it once a day to keep your streak. Each streak day adds a leaf, up to 4.</p>}
        <button className={'wl-water' + (plant.wateredToday ? ' done' : '')} onClick={water} disabled={plant.wateredToday || watering}>
          {plant.wateredToday ? wateredLabel : watering ? 'Watering…' : '💧 Water your money plant'}
        </button>
      </section>

      <section className="wl-log">
        <div className="wl-log-head"><span className="wl-tag green">Spent something today?</span><button className="wl-mic" onClick={onVoice} aria-label="Say an expense">🎙 Say it</button></div>
        {picks.length ? <div className="wl-picks">{picks.map(p => { const c = catOf(book, p.categoryId); return (
          <button key={p.description} className="wl-pick" onClick={e => log(p, e)}><span>{c.icon}</span>{p.description}<b>{fmtMoney(p.amount)}</b></button>); })}</div>
          : <p className="wl-sub">Tap 🎙 and say it, like "tea 20 rupees". Your frequent spends will appear here for one-tap logging.</p>}
        {logged && <div className="wl-logged" role="status"><span>✓ {logged.text}</span><button onClick={undo}>Undo</button></div>}
      </section>

      {remind.show && (
        <div className="wl-remind">
          <span>🔔</span>
          <p><b>Daily nudge</b>{remind.msg || 'A different reminder each day to water your plant and log your spends.'}</p>
          <button onClick={async () => { const r = await enableReminders(); setRemind({ show: !r.ok, msg: r.text }); if (r.ok) coin(); }}>Turn on</button>
        </div>
      )}

      <div className="wl-tip">
        <span className="wl-tag">💡 Saving tip of the day</span>
        {tip && <p className="wl-tip-text" key={i}>{tip.text}</p>}
        {tip && <span className="wl-tip-by">{tip.own ? `Added by ${who(tip.by)}` : 'From Grow with Jana'}</span>}
        {tips.length > 1 && <div className="wl-add-row"><button className="wl-ghost" onClick={() => { tick(); setI((i + 1) % tips.length); }}>Next tip</button></div>}
      </div>

      <button className="wl-go" onClick={close}>Open my ledger</button>

      {levelUp > 0 && (
        <div className="wl-level" onClick={() => setLevelUp(0)} role="alertdialog" aria-label="Your plant grew">
          <div className="wl-level-card">
            <span className="wl-tag">Level up · {plant.name}</span>
            <h2>{STAGE_TEXT[levelUp]}</h2>
            <p>You have saved {fmtMoney(plant.saved)} this cycle, {Math.round(plant.rate * 100)}% of what came in.</p>
            <button className="wl-water">Keep growing 🌱</button>
          </div>
        </div>
      )}
    </div>
  );
}
