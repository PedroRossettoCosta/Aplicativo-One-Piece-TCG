// The ONLY file that talks to Firebase. To switch providers, rewrite this file;
// the rest of the app only uses the functions exported here.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, signOut, deleteUser, type User,
  setPersistence, browserLocalPersistence, browserSessionPersistence, signInWithRedirect, getRedirectResult,
} from 'firebase/auth';
import type { Deck, Decks } from './deck';
import {
  initializeFirestore, persistentLocalCache, doc, onSnapshot, setDoc, deleteDoc, increment, deleteField, getDoc,
  getDocs, collection,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
// Local cache: the collection stays on the phone, so reopening the app costs few reads.
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

export type { User };
/** Card code → quantity, e.g. { "OP01-120": 2 } */
export type Collection = Record<string, number>;
/** A price the player copied from Liga by hand (R$), with when they noted it (ms since epoch). */
export type Price = { min?: number; avg?: number; max?: number; at: number };
export type Prices = Record<string, Price>;
/** Everything in the player's document. wish = cards they want to buy (code → copies); decks = planned decks. */
export type PlayerData = { cards: Collection; prices: Prices; wish: Collection; decks: Decks };

export const onUserChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);

/**
 * "Manter conectado": on = stay logged in on this device; off = only until the tab closes.
 * Set it when the checkbox changes, never inside the sign-in tap: iOS Safari only opens the Google
 * popup if it is opened immediately in the tap, so nothing may be awaited before signInWithPopup.
 */
export const setRemember = (on: boolean) =>
  setPersistence(auth, on ? browserLocalPersistence : browserSessionPersistence);
export const signUp = (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password);
export const signIn = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
/**
 * Google login: popup first; if the browser blocks it (some iOS/Android home-screen apps), fall back to a
 * full-page redirect. Login runs through the site's own domain (vercel.json proxies /__/auth to Firebase,
 * and VITE_FIREBASE_AUTH_DOMAIN is the site's domain), so no third-party storage is needed on any browser.
 */
export const signInWithGoogle = () =>
  signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => {
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')
      return signInWithRedirect(auth, new GoogleAuthProvider());
    throw e;
  });
/** Surfaces errors from a finished redirect login (success is picked up by onUserChange). */
export const redirectLoginResult = () => getRedirectResult(auth);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);

const userDoc = (uid: string) => doc(db, 'users', uid);

/** Calls cb with the player's data now and whenever it changes. Returns an unsubscribe function. */
export const watchPlayer = (uid: string, cb: (d: PlayerData) => void) =>
  onSnapshot(userDoc(uid), (snap) => {
    const d = snap.data() ?? {};
    cb({ cards: d.cards ?? {}, prices: d.prices ?? {}, wish: d.wish ?? {}, decks: d.decks ?? {} });
  });

/**
 * Adds (delta > 0) or removes (delta < 0) copies of a card in the collection (field "cards") or the wishlist
 * ("wish"). At 0 the card leaves that list; its noted price goes too unless the other list still has it.
 */
export const changeQuantity = (uid: string, code: string, delta: number, current: number, keepPrice = false, field: 'cards' | 'wish' = 'cards') =>
  setDoc(
    userDoc(uid),
    current + delta <= 0
      ? { [field]: { [code]: deleteField() }, ...(keepPrice ? {} : { prices: { [code]: deleteField() } }) }
      : { [field]: { [code]: increment(delta) } },
    { merge: true },
  );

/** Adds copies to the wishlist in one write (e.g. every card a deck is missing). */
export const addToWish = (uid: string, add: Record<string, number>) =>
  setDoc(userDoc(uid), { wish: Object.fromEntries(Object.entries(add).map(([c, q]) => [c, increment(q)])) }, { merge: true });

/** "Comprei": the bought copies join the collection and leave the wishlist, in one write. */
export const buyWished = (uid: string, bought: Record<string, number>) =>
  setDoc(userDoc(uid), {
    cards: Object.fromEntries(Object.entries(bought).map(([c, q]) => [c, increment(q)])),
    wish: Object.fromEntries(Object.keys(bought).map((c) => [c, deleteField()])),
  }, { merge: true });

/**
 * Saves (or, with null, deletes) one deck. mergeFields replaces the whole deck: a plain merge would keep cards
 * that were taken out of it.
 */
export const saveDeck = (uid: string, id: string, deck: Deck | null) =>
  deck
    ? setDoc(userDoc(uid), { decks: { [id]: deck } }, { mergeFields: [`decks.${id}`] })
    : setDoc(userDoc(uid), { decks: { [id]: deleteField() } }, { merge: true });

/** Saves the price the player noted from Liga for one card. */
export const savePrice = (uid: string, code: string, price: Price) =>
  setDoc(userDoc(uid), { prices: { [code]: price } }, { merge: true });

/** What the player taught the scanner: card code → up to EXAMPLES_PER_CARD artwork fingerprints from their own camera. */
export const EXAMPLES_PER_CARD = 6; // ~150 bytes each
export type Learned = Record<string, string[]>;
const learnedDoc = (uid: string) => doc(db, 'users', uid, 'private', 'learned');
export const loadLearned = async (uid: string): Promise<Learned> =>
  (await getDoc(learnedDoc(uid)).catch(() => null))?.data()?.ex ?? {};
export const saveLearned = (uid: string, code: string, examples: string[]) =>
  setDoc(learnedDoc(uid), { ex: { [code]: examples } }, { merge: true });
export const clearLearned = (uid: string) => deleteDoc(learnedDoc(uid));

/**
 * The "teacher" account: its confirmations and corrections become the shared base every player's scanner
 * starts from, and it learns only from itself. Must match the uid in firestore.rules.
 * The shared base lives in learned/{set} (one doc per set keeps each far below Firestore's 1 MB limit).
 */
export const TEACHER_UID = 'CEDVsWBICxWmAPjp7PPb1TaR2fh2';
const sharedDoc = (set: string) => doc(db, 'learned', set);
export const loadSharedLearned = async (set: string): Promise<Learned> =>
  (await getDoc(sharedDoc(set)).catch(() => null))?.data()?.ex ?? {};
export const saveSharedLearned = (set: string, code: string, examples: string[]) =>
  setDoc(sharedDoc(set), { ex: { [code]: examples } }, { merge: true });
/** The whole shared base, by set (teacher's account screen). */
export const loadAllSharedLearned = async (): Promise<Record<string, Learned>> =>
  Object.fromEntries((await getDocs(collection(db, 'learned'))).docs.map((d) => [d.id, d.data().ex ?? {}]));
export async function clearSharedLearned() {
  await Promise.all((await getDocs(collection(db, 'learned'))).docs.map((d) => deleteDoc(d.ref)));
}

/** LGPD: permanently deletes the player's collection, what they taught the scanner, and the account. */
export async function deleteAccount(user: User) {
  await deleteDoc(learnedDoc(user.uid));
  await deleteDoc(userDoc(user.uid));
  await deleteUser(user);
}
