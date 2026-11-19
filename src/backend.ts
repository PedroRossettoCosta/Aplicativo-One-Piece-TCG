// The ONLY file that talks to Firebase. To switch providers, rewrite this file;
// the rest of the app only uses the functions exported here.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, signOut, deleteUser, type User,
  setPersistence, browserLocalPersistence, browserSessionPersistence, signInWithRedirect, getRedirectResult,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, doc, onSnapshot, setDoc, deleteDoc, increment, deleteField, getDoc,
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

/** Calls cb with the player's collection and noted prices now and whenever they change. Returns an unsubscribe function. */
export const watchCollection = (uid: string, cb: (cards: Collection, prices: Prices) => void) =>
  onSnapshot(userDoc(uid), (snap) => cb(snap.data()?.cards ?? {}, snap.data()?.prices ?? {}));

/** Adds (delta > 0) or removes (delta < 0) copies of a card. Drops the card (and its noted price) at 0. */
export const changeQuantity = (uid: string, code: string, delta: number, current: number) =>
  setDoc(
    userDoc(uid),
    current + delta <= 0
      ? { cards: { [code]: deleteField() }, prices: { [code]: deleteField() } }
      : { cards: { [code]: increment(delta) } },
    { merge: true },
  );

/** Saves the price the player noted from Liga for one card. */
export const savePrice = (uid: string, code: string, price: Price) =>
  setDoc(userDoc(uid), { prices: { [code]: price } }, { merge: true });

/** What the player taught the scanner: card code → up to 4 artwork fingerprints from their own camera. */
export type Learned = Record<string, string[]>;
const learnedDoc = (uid: string) => doc(db, 'users', uid, 'private', 'learned');
export const loadLearned = async (uid: string): Promise<Learned> =>
  (await getDoc(learnedDoc(uid)).catch(() => null))?.data()?.ex ?? {};
export const saveLearned = (uid: string, code: string, examples: string[]) =>
  setDoc(learnedDoc(uid), { ex: { [code]: examples } }, { merge: true });
export const clearLearned = (uid: string) => deleteDoc(learnedDoc(uid));

/** LGPD: permanently deletes the player's collection, what they taught the scanner, and the account. */
export async function deleteAccount(user: User) {
  await deleteDoc(learnedDoc(user.uid));
  await deleteDoc(userDoc(user.uid));
  await deleteUser(user);
}
