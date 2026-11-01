// Daily reminders to water the money plant and log expenses. They are shown by sw.js when Chrome wakes it
// (Periodic Background Sync: Android, app installed from Chrome; Chrome picks the time, about once a day).
// The page leaves a tiny note for sw.js saying what is already done today, so it can stay quiet or pick the right message.
import { Book, today } from './logic';

const KEY = 'gwj-remind';
const STATE = './__gwj-state';
type Reg = ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } };

export const remindSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype;
export const remindOn = () => { try { return localStorage.getItem(KEY) === 'on' && Notification.permission === 'granted'; } catch { return false; } };
export const remindBlocked = () => typeof Notification !== 'undefined' && Notification.permission === 'denied';

/** Ask for permission and set up the daily wake-up. Returns a message for the user. */
export async function enableReminders(): Promise<{ ok: boolean; text: string }> {
  if (!remindSupported()) return { ok: false, text: 'Daily reminders need the app installed from Chrome on Android.' };
  const p = await Notification.requestPermission();
  if (p !== 'granted') return { ok: false, text: 'Notifications are blocked. Allow them in your phone settings for this app.' };
  try {
    const reg = (await navigator.serviceWorker.ready) as Reg;
    const status = await (navigator.permissions as Permissions).query({ name: 'periodic-background-sync' as PermissionName }).catch(() => null);
    if (status && status.state === 'denied') return { ok: false, text: 'Chrome is not allowing background reminders. Install the app to your home screen first.' };
    await reg.periodicSync!.register('gwj-daily', { minInterval: 12 * 60 * 60 * 1000 });
    localStorage.setItem(KEY, 'on');
    reg.showNotification('Reminders are on 🌱', { body: 'Once a day we will nudge you to water your plant and log your spends. A different message each day.', icon: './icon-192.png', badge: './icon-192.png', tag: 'gwj' });
    return { ok: true, text: 'Daily reminders are on.' };
  } catch {
    return { ok: false, text: 'Could not set up reminders on this phone. Install the app from Chrome and try again.' };
  }
}

/** Tell sw.js what is already done today. Called whenever the ledger changes. */
export function noteState(book: Book, name: string) {
  if (!('caches' in window)) return;
  const now = today(), w = book.settings.water;
  const data = { day: now, name: name.split(' ')[0] || '', watered: w?.last || '', streak: w?.streak || 0, logged: book.txs.some(t => t.date === now) ? now : '' };
  caches.open('gwj-state').then(async c => {
    const old = await c.match(STATE).then(x => (x ? x.json() : {})).catch(() => ({}));
    await c.put(STATE, new Response(JSON.stringify({ ...old, ...data }), { headers: { 'content-type': 'application/json' } }));
  }).catch(() => {});
}
