// Turns what was said (Tamil or English) into transaction fields. Pure functions, no browser APIs.
import { Book, TxType } from './logic';

export type Lang = 'ta' | 'en';
export interface Heard { amount?: number; accountId?: string; type?: TxType; categoryId?: string; description?: string; }

const CATEGORY_WORDS: Record<string, string[]> = {
  food: ['food', 'lunch', 'dinner', 'breakfast', 'tea', 'coffee', 'snack', 'hotel', 'tiffin', 'grocery', 'groceries', 'milk', 'சாப்பாடு', 'உணவு', 'டீ', 'காபி', 'டிபன்', 'மளிகை', 'பால்', 'ஹோட்டல்', 'சாப்பிட'],
  transport: ['bus', 'auto', 'petrol', 'diesel', 'train', 'cab', 'taxi', 'metro', 'fuel', 'பஸ்', 'பேருந்து', 'ஆட்டோ', 'பெட்ரோல்', 'டீசல்', 'ரயில்', 'டாக்ஸி'],
  rent: ['rent', 'வாடகை'],
  family: ['family', 'home', 'mother', 'father', 'குடும்ப', 'வீட்டு', 'அம்மா', 'அப்பா'],
  recharge: ['recharge', 'ரீசார்ஜ்', 'ரீசார்ச்'],
  utilities: ['electricity', 'current bill', 'water', 'gas', 'bulb', 'மின்', 'கரண்ட்', 'தண்ணீர்', 'கேஸ்'],
  bills: ['bill', 'பில்'],
  health: ['medicine', 'hospital', 'doctor', 'tablet', 'மருந்து', 'மருத்துவ', 'டாக்டர்', 'மாத்திரை'],
  shopping: ['shopping', 'dress', 'clothes', 'shirt', 'ஷாப்பிங்', 'துணி', 'சட்டை', 'டிரஸ்'],
  entertainment: ['movie', 'cinema', 'சினிமா', 'படம்'],
  education: ['fees', 'school', 'book', 'college', 'கட்டணம்', 'பள்ளி', 'புத்தக', 'கல்லூரி'],
  subscriptions: ['subscription', 'netflix', 'சந்தா'],
  interest: ['interest', 'வட்டி'],
  salary: ['salary', 'சம்பளம்', 'சம்பள'],
  savings: ['saving', 'savings', 'சேமிப்பு', 'சேமி'],
};
// How common account names sound when transcribed in Tamil script.
const ACCOUNT_SOUNDS: Record<string, string[]> = {
  canara: ['கனரா', 'கெனரா', 'கேனரா', 'kanara', 'kenara', 'canera'],
  kotak: ['கோடக்', 'கோட்டக்', 'கோடாக்', 'kodak', 'kotek'],
  personal: ['பர்சனல்', 'பெர்சனல்', 'கையில்', 'கேஷ்', 'ரொக்க', 'cash', 'hand'],
  cash: ['கேஷ்', 'ரொக்க', 'கையில்', 'hand'],
  sbi: ['எஸ்பிஐ', 'எஸ் பி ஐ', 'state bank'], hdfc: ['எச்டிஎஃப்சி'], icici: ['ஐசிஐசிஐ'], indian: ['இந்தியன்'], iob: ['ஐஓபி'], axis: ['ஆக்சிஸ்'],
  gpay: ['ஜிபே', 'ஜி பே', 'google pay'], paytm: ['பேடிஎம்'],
};
const MULT: [RegExp, number][] = [[/(lakhs?|lacs?|லட்சம்|இலட்சம்)/, 100000], [/(thousand|ஆயிரம்|\bk\b)/, 1000], [/(hundred|நூறு)/, 100]];
const FILLER = /\b(rupees?|rs\.?|inr|for|from|in|on|to|the|a|an|spent|paid|pay|add|expense|account|bank|of)\b|ரூபாய்|ரூபா|ரூ\.?|₹|கணக்கு|கணக்கில்|செலவு|இருந்து|வங்கி|க்கு|ல்\b/gi;

export const isYes = (s: string) => /\b(yes|yeah|ok|okay|save|correct|right|confirm)\b|சரி|ஆம்|ஆமா|ஓகே|சேமி|சேவ்|போடு/i.test(s);
export const isNo = (s: string) => /\b(no|cancel|wrong|stop|again)\b|இல்லை|வேண்டாம்|வேணாம்|தவறு|ரத்து/i.test(s);

export function findAmount(text: string): { amount?: number; rest: string } {
  const m = text.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return { rest: text };
  let amount = parseFloat(m[1].replace(/,/g, ''));
  let rest = text.replace(m[1], ' ');
  const tail = text.slice((m.index || 0) + m[1].length, (m.index || 0) + m[1].length + 12).toLowerCase();
  for (const [re, k] of MULT) { const hit = tail.match(re); if (hit && tail.trimStart().startsWith(hit[0])) { amount *= k; rest = rest.replace(hit[0], ' '); break; } }
  return { amount: amount > 0 ? amount : undefined, rest };
}
export function findAccount(text: string, book: Book): { accountId?: string; matched?: string } {
  const t = text.toLowerCase();
  for (const a of book.accounts) {
    const name = a.name.toLowerCase();
    if (t.includes(name)) return { accountId: a.id, matched: name };
    for (const word of name.split(/[\s/]+/)) for (const s of ACCOUNT_SOUNDS[word] || []) if (t.includes(s.toLowerCase())) return { accountId: a.id, matched: s.toLowerCase() };
  }
  return {};
}
export function findCategory(text: string, book: Book): string | undefined {
  const t = text.toLowerCase();
  for (const c of book.categories) if (c.name.length > 2 && t.includes(c.name.toLowerCase())) return c.id;
  for (const [id, words] of Object.entries(CATEGORY_WORDS)) if (book.categories.some(c => c.id === id) && words.some(w => t.includes(w.toLowerCase()))) return id;
  const hit = [...book.txs].reverse().find(x => x.description && t.includes(x.description.toLowerCase()) && book.categories.some(c => c.id === x.categoryId));
  return hit?.categoryId;
}
/** Pull every field we can out of one utterance, so "bus 120 canara" needs no further questions. */
export function parseUtterance(text: string, book: Book): Heard {
  const out: Heard = {};
  const { amount, rest } = findAmount(text);
  out.amount = amount;
  const acc = findAccount(rest, book);
  out.accountId = acc.accountId;
  let desc = acc.matched ? rest.replace(new RegExp(acc.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') : rest;
  desc = desc.replace(FILLER, ' ').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const cat = findCategory(desc || text, book);
  out.categoryId = cat;
  if (cat === 'salary' || cat === 'interest') out.type = 'income';
  else if (cat === 'savings') out.type = 'savings';
  if (/\b(income|received|got)\b|வந்தது|வரவு|கிடைத்த/i.test(text)) out.type = 'income';
  if (desc && /\p{L}/u.test(desc)) out.description = desc.charAt(0).toUpperCase() + desc.slice(1);
  return out;
}

export const SAY: Record<Lang, Record<string, string>> = {
  en: { amount: 'How much?', what: 'What was it for?', account: 'Which account?', saved: 'Saved.', retry: 'I did not catch that. Please say it again.', cancelled: 'Cancelled. Starting again.', yes: 'Say yes to save, or no to start again.' },
  ta: { amount: 'எவ்வளவு தொகை?', what: 'எதற்காக?', account: 'எந்தக் கணக்கு?', saved: 'சேமிக்கப்பட்டது.', retry: 'புரியவில்லை. மீண்டும் சொல்லுங்கள்.', cancelled: 'ரத்து செய்யப்பட்டது. மீண்டும் தொடங்கலாம்.', yes: 'சேமிக்க சரி என்று சொல்லுங்கள். மாற்ற இல்லை என்று சொல்லுங்கள்.' },
};
export const confirmText = (lang: Lang, type: TxType, amount: number, desc: string, account: string) => {
  const n = amount.toLocaleString('en-IN');
  if (lang === 'ta') { const k = type === 'income' ? 'வரவு' : type === 'savings' ? 'சேமிப்பு' : 'செலவு'; return `${k}: ${n} ரூபாய், ${desc}, ${account} கணக்கு. ${SAY.ta.yes}`; }
  return `${type === 'income' ? 'Income' : type === 'savings' ? 'Savings' : 'Expense'}: ${n} rupees, ${desc}, ${account}. ${SAY.en.yes}`;
};
