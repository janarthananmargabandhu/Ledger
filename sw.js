// Grow with Jana: keeps the app's own files on the phone so it opens fast and still opens on weak signal.
// Only the app's code, styles, icons and fonts are kept. Ledger data is never stored here: it always comes from Firebase.
const CACHE = 'gwj-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './icon-192.png', './icon-512.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'gwj-state').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return; // Firebase and everything else go straight to the network

  // The page itself: try the network for 2.5 seconds so updates arrive, else open the saved copy at once.
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match('./').then(r => { if (!done && r) { done = true; resolve(r); } });
      const timer = setTimeout(fallback, 2500);
      fetch(req).then(res => { clearTimeout(timer); put('./', res); if (!done) { done = true; resolve(res); } })
        .catch(() => { clearTimeout(timer); caches.match('./').then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
    }));
    return;
  }

  // Built files have a unique name per version, so a saved copy is always correct: use it, else fetch and save.
  if (url.pathname.includes('/assets/') || fonts) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
    return;
  }
  // Icons and the manifest keep their names: answer from the saved copy, and refresh it in the background.
  if (/\.(png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(res => put(req, res)).catch(() => hit); return hit || net; }));
  }
});

// ---------- Daily reminder (Periodic Background Sync) ----------
// Picks a message from what is still left to do today, and a different one each day. Stays quiet if both are done.
const MSG = {
  both: [
    ['Your money plant is thirsty 🌱', 'Water it and log today\'s spends. Two taps, done.'],
    ['{n}, a quick check-in? 💧', 'Your plant wants water, and your ledger wants today\'s expenses.'],
    ['Small habits, big savings 🪴', 'Water your plant and note what you spent today.'],
    ['Where did today\'s money go? 🤔', 'Log it while you remember, then give your plant a drink.'],
    ['Tea, auto, groceries? ☕', 'Tap them in from the welcome screen and water your plant.'],
    ['Your plant is waiting 🌿', 'One drop of water, one line of expenses. That is today sorted.'],
    ['Money check, 30 seconds ⏱', 'Log today\'s spends and keep your plant growing.'],
  ],
  water: [
    ['Don\'t let it wilt! 🥀', 'You logged today. Now water your money plant.'],
    ['Thirsty plant alert 💧', '{n}, one tap to water it before the day ends.'],
    ['Almost done for today ✅', 'Expenses are logged. Just water your plant.'],
  ],
  streak: [
    ['🔥 Your {s}-day streak is at risk!', 'Water your money plant today to keep it going.'],
    ['Day {s1} is waiting 🔥', 'Keep the streak alive: one tap to water your plant.'],
    ['{n}, don\'t break the chain 🔗', '{s} days in a row. Make it {s1} today.'],
  ],
  log: [
    ['Plant watered, ledger empty 📒', 'What did you spend today? Log it in a few taps.'],
    ['Quick one, {n} ✍️', 'Add today\'s expenses before you forget them.'],
    ['Every rupee counts 🪙', 'Log today\'s spends so your plan stays true.'],
    ['Tomorrow-you will thank you 🙏', 'Note today\'s expenses now. It takes a minute.'],
  ],
};
const dayNo = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);
const iso = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');

async function nudge() {
  const now = iso(new Date());
  const yest = iso(new Date(Date.now() - 864e5));
  let st = {};
  try { const r = await (await caches.open('gwj-state')).match('./__gwj-state'); if (r) st = await r.json(); } catch (e) { /* first run */ }
  if (st.shown === now) return;                                // once a day at most
  const watered = st.watered === now, logged = st.logged === now;
  if (watered && logged) return;                               // nothing to do: stay quiet
  const streak = st.watered === yest ? st.streak || 0 : 0;
  const pool = !watered && streak >= 2 ? MSG.streak : !watered && !logged ? MSG.both : !watered ? MSG.water : MSG.log;
  const [title, body] = pool[dayNo(now) % pool.length];
  const fill = t => t.replace('{n}', st.name || 'Hey').replace('{s1}', streak + 1).replace('{s}', streak);
  await self.registration.showNotification(fill(title), { body: fill(body), icon: './icon-192.png', badge: './icon-192.png', tag: 'gwj', renotify: true, data: { url: './' } });
  try { await (await caches.open('gwj-state')).put('./__gwj-state', new Response(JSON.stringify({ ...st, shown: now }), { headers: { 'content-type': 'application/json' } })); } catch (e) { /* ignore */ }
}

self.addEventListener('periodicsync', e => { if (e.tag === 'gwj-daily') e.waitUntil(nudge()); });

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
