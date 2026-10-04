import { Book, Category, Tx, TxType, Method } from './logic';

export const defaultCategories = (): Category[] => [
  { id: 'food', name: 'Food', icon: '🍔', kind: 'expense' },
  { id: 'rent', name: 'Rent', icon: '🏠', kind: 'expense' },
  { id: 'family', name: 'Family', icon: '👨‍👩‍👦', kind: 'expense' },
  { id: 'transport', name: 'Transport', icon: '🚌', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: '🛍', kind: 'expense' },
  { id: 'bills', name: 'Bills', icon: '🧾', kind: 'expense' },
  { id: 'utilities', name: 'Utilities', icon: '💡', kind: 'expense' },
  { id: 'recharge', name: 'Recharge', icon: '📱', kind: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', kind: 'expense' },
  { id: 'health', name: 'Health', icon: '🩺', kind: 'expense' },
  { id: 'education', name: 'Education', icon: '🎓', kind: 'expense' },
  { id: 'subscriptions', name: 'Subscriptions', icon: '🔁', kind: 'expense' },
  { id: 'savings', name: 'Savings', icon: '💰', kind: 'savings' },
  { id: 'salary', name: 'Salary', icon: '💼', kind: 'income', system: true },
  { id: 'interest', name: 'Interest', icon: '🏦', kind: 'income' },
  { id: 'other', name: 'Other', icon: '📦', kind: 'any', system: true },
];

export const emptyBook = (): Book => ({ accounts: [], categories: defaultCategories(), txs: [], settings: { hasSample: false } });

/** Demo data: September 2026, matching the closing balances of the original spreadsheet. */
export function sampleBook(): Book {
  let n = 0;
  const tx = (date: string, accountId: string, description: string, categoryId: string, type: TxType, amount: number, method: Method): Tx =>
    ({ id: 's' + (++n), date: '2026-09-' + date, accountId, description, categoryId, type, amount, method, createdAt: n, sample: true });
  return {
    accounts: [
      { id: 'personal', name: 'Personal', opening: 0, sample: true },
      { id: 'canara', name: 'Canara', opening: 71564, sample: true },
      { id: 'kotak', name: 'Kotak', opening: 16195, sample: true },
    ],
    categories: defaultCategories(),
    settings: { hasSample: true },
    txs: [
      tx('16', 'personal', 'Salary', 'salary', 'income', 30000, 'cash'),
      tx('16', 'personal', 'Savings', 'savings', 'savings', 10000, 'cash'),
      tx('17', 'personal', 'Family', 'family', 'expense', 10000, 'cash'),
      tx('17', 'personal', 'Rent', 'rent', 'expense', 5600, 'cash'),
      tx('18', 'personal', 'Tally for left', 'other', 'expense', 3050, 'cash'),
      tx('20', 'personal', 'Tally for ullasa visit', 'other', 'expense', 380, 'cash'),
      tx('21', 'personal', 'Haircut', 'other', 'expense', 80, 'cash'),
      tx('22', 'personal', 'Bus', 'transport', 'expense', 15, 'cash'),
      tx('22', 'personal', 'Auto', 'transport', 'expense', 30, 'cash'),
      tx('24', 'personal', 'Bulb', 'utilities', 'expense', 160, 'cash'),
      tx('26', 'personal', 'Bus', 'transport', 'expense', 120, 'cash'),
      tx('17', 'canara', 'Saravanan', 'other', 'income', 30000, 'bank'),
      tx('19', 'canara', 'Saravanan', 'other', 'income', 10000, 'bank'),
      tx('20', 'canara', 'Interest', 'interest', 'income', 484, 'bank'),
      tx('21', 'canara', 'Recharge', 'recharge', 'expense', 349, 'upi'),
      tx('22', 'canara', 'Auto', 'transport', 'expense', 30, 'upi'),
      tx('23', 'canara', 'Maggie', 'food', 'expense', 30, 'upi'),
      tx('24', 'canara', 'Bus', 'transport', 'expense', 22, 'upi'),
      tx('25', 'canara', 'Water bottle', 'food', 'expense', 20, 'upi'),
      tx('27', 'canara', 'Bus', 'transport', 'expense', 39, 'upi'),
      tx('19', 'kotak', 'Rajan', 'other', 'income', 5600, 'bank'),
      tx('30', 'kotak', 'Interest', 'interest', 'income', 55, 'bank'),
    ],
  };
}
