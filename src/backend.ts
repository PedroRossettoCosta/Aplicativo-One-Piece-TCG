// The ONLY file that talks to Firebase. To switch providers, rewrite this file;
// the rest of the app only uses the functions exported here.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, signOut, deleteUser, type User,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, doc, onSnapshot, setDoc, deleteDoc, increment, deleteField,
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

export const onUserChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);
export const signUp = (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password);
export const signIn = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);

const userDoc = (uid: string) => doc(db, 'users', uid);

/** Calls cb with the player's collection now and whenever it changes. Returns an unsubscribe function. */
export const watchCollection = (uid: string, cb: (cards: Collection) => void) =>
  onSnapshot(userDoc(uid), (snap) => cb(snap.data()?.cards ?? {}));

/** Adds (delta > 0) or removes (delta < 0) copies of a card. Drops the card when it reaches 0. */
export const changeQuantity = (uid: string, code: string, delta: number, current: number) =>
  setDoc(
    userDoc(uid),
    { cards: { [code]: current + delta <= 0 ? deleteField() : increment(delta) } },
    { merge: true },
  );

/** LGPD: permanently deletes the player's collection and account. */
export async function deleteAccount(user: User) {
  await deleteDoc(userDoc(user.uid));
  await deleteUser(user);
}
