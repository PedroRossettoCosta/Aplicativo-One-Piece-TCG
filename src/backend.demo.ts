// Development only (`npm run demo`): the same functions as backend.ts, with an in-memory player saved in this
// browser's localStorage and no Firebase at all. Lets the UI be checked without signing in to a real account.
import type { Deck, Decks } from './deck';

export type User = { uid: string; email: string };
export type Collection = Record<string, number>;
export type Price = { min?: number; avg?: number; max?: number; at: number };
export type Prices = Record<string, Price>;
export type PlayerData = { cards: Collection; prices: Prices; wish: Collection; decks: Decks };
export type Learned = Record<string, string[]>;
export const EXAMPLES_PER_CARD = 6;
export const TEACHER_UID = 'demo';

const KEY = 'demoPlayer';
const day = 86_400_000;
const seed = (): PlayerData => ({
  cards: { 'OP01-001': 1, 'OP01-016': 3, 'OP01-025': 4, 'OP01-006': 2, 'OP01-013': 1, 'OP17-088': 2, 'OP17-086': 1, 'OP17-084': 1, 'OP16-109': 1, 'ST10-002': 2, 'EB03-044': 1 },
  prices: { 'OP01-016': { min: 2.5, avg: 4, max: 9, at: Date.now() - 2 * day }, 'OP01-120': { min: 180, avg: 230, max: 320, at: Date.now() - 9 * day } },
  wish: { 'OP01-120': 1, 'OP01-024': 2 },
  decks: {
    d1: { name: 'Zoro vermelho', leader: 'OP01-001', cards: { 'OP01-016': 4, 'OP01-025': 4, 'OP01-006': 4, 'OP01-013': 4, 'OP01-024': 2, 'OP01-120': 2 }, at: Date.now() },
  },
});
let data: PlayerData = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? seed(); } catch { return seed(); } })();
const listeners = new Set<(d: PlayerData) => void>();
const commit = (next: PlayerData) => {
  data = next;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
  listeners.forEach((cb) => cb(data));
  return Promise.resolve();
};

const demoUser: User = { uid: 'demo', email: 'demo@exemplo.test' };
export const onUserChange = (cb: (u: User | null) => void) => { setTimeout(() => cb(demoUser)); return () => {}; };
const noop = () => Promise.resolve();
export const setRemember = noop, signUp = noop, signIn = noop, signInWithGoogle = noop, resetPassword = noop, logOut = noop;
export const redirectLoginResult = noop;
export const deleteAccount = () => commit(seed());

export const watchPlayer = (_uid: string, cb: (d: PlayerData) => void) => {
  listeners.add(cb); setTimeout(() => cb(data));
  return () => { listeners.delete(cb); };
};
export const changeQuantity = (_uid: string, code: string, delta: number, current: number, keepPrice = false, field: 'cards' | 'wish' = 'cards') => {
  const list = { ...data[field] };
  const prices = { ...data.prices };
  if (current + delta <= 0) { delete list[code]; if (!keepPrice) delete prices[code]; } else list[code] = (list[code] ?? 0) + delta;
  return commit({ ...data, [field]: list, prices });
};
export const collect = (_uid: string, code: string, delta: number, wished: number) => {
  const cards = { ...data.cards, [code]: (data.cards[code] ?? 0) + delta }, wish = { ...data.wish };
  if (wished > 0) { if (wished <= delta) delete wish[code]; else wish[code] = wished - delta; }
  return commit({ ...data, cards, wish });
};
export const savePrice = (_uid: string, code: string, price: Price) => commit({ ...data, prices: { ...data.prices, [code]: price } });
export const addToWish = (_uid: string, add: Record<string, number>) => {
  const wish = { ...data.wish };
  for (const [c, q] of Object.entries(add)) wish[c] = (wish[c] ?? 0) + q;
  return commit({ ...data, wish });
};
export const buyWished = (_uid: string, bought: Record<string, number>) => {
  const cards = { ...data.cards }, wish = { ...data.wish };
  for (const [c, q] of Object.entries(bought)) { cards[c] = (cards[c] ?? 0) + q; delete wish[c]; }
  return commit({ ...data, cards, wish });
};
export const saveDeck = (_uid: string, id: string, deck: Deck | null) => {
  const decks = { ...data.decks };
  if (deck) decks[id] = deck; else delete decks[id];
  return commit({ ...data, decks });
};

export const loadLearned = async (): Promise<Learned> => ({});
export const saveLearned = noop, clearLearned = noop, saveSharedLearned = noop, clearSharedLearned = noop;
export const loadSharedLearned = async (): Promise<Learned> => ({});
export const loadAllSharedLearned = async (): Promise<Record<string, Learned>> => ({});
