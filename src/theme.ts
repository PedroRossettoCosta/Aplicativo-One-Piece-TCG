// Light / dark theme. "auto" follows the phone; the player can pin one in Conta (saved on this device).
export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'theme';

export function getTheme(): ThemeChoice {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

/** Applies the choice: <html data-theme> (absent = follow the phone) and the browser bar colour. */
export function applyTheme(choice: ThemeChoice = getTheme()) {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = choice;
  const dark = choice === 'dark' || (choice === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1014' : '#f4f5f7');
}

export function setTheme(choice: ThemeChoice) {
  try { if (choice === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { /* storage blocked */ }
  applyTheme(choice);
}

if (typeof window !== 'undefined') {
  applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme());
}
