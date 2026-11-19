// Card codes look like OP01-120, ST10-005, EB01-001, PRB01-001 or P-001.
const CODE = /^(?:(?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})$/;

/** Cleans user/OCR input ("op01 120" → "OP01-120"). Returns null if it isn't a valid code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s_–—]+/g, '-').replace(/^([A-Z]+\d{2})-?(\d{3})$/, '$1-$2');
  return CODE.test(code) ? code : null;
}

/**
 * Finds a card code in raw OCR text, fixing typical OCR slips (0↔O, 5↔S, 8↔B, 1↔I).
 * Only codes for which `known` returns true are accepted (use the catalog), so stray text never matches.
 */
export function findCode(text: string, known: (code: string) => boolean): string | null {
  const digits = (s: string) => s.replace(/O/g, '0').replace(/S/g, '5').replace(/B/g, '8').replace(/I/g, '1');
  const prefix: Record<string, string> = { '0P': 'OP', '5T': 'ST', E8: 'EB', PR8: 'PRB' };
  const upper = text.toUpperCase();
  const set = /(PRB|PR8|OP|0P|ST|5T|EB|E8)\s*([0-9OSBI]{2})[\s\-–—_~.]*([0-9OSBI]{3})/g;
  for (const t of [upper, upper.replace(/\s+/g, '')]) { // second pass: OCR sometimes spaces out every letter
    for (const m of t.matchAll(set)) {
      const code = `${prefix[m[1]] ?? m[1]}${digits(m[2])}-${digits(m[3])}`;
      if (known(code)) return code;
    }
    for (const m of t.matchAll(/P\s*[-–—_~]\s*([0-9OSBI]{3})/g)) {
      const code = `P-${digits(m[1])}`;
      if (known(code)) return code;
    }
  }
  return null;
}

// Digits OCR mixes up on the tiny printed code (e.g. 098 read as 006).
const LOOKALIKE: Record<string, string> = {
  '0': '8693', '1': '74', '2': '73', '3': '8952', '4': '1', '5': '638', '6': '8509', '7': '12', '8': '06935', '9': '8063',
};

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * How clearly the card name appears in text read from the bottom of the card (0..1).
 * Short names must appear exactly as a word; very short ones ("Mr.5") are ignored — too easy to see in noise.
 */
export function nameScore(text: string, name: string): number {
  const t = letters(text), n = letters(name);
  if (n.length < 4) return 0;
  if (n.length < 8) return text.toLowerCase().split(/[^a-z.]+/).some((w) => letters(w) === n) || t.includes(n) && new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[^a-z ]/g, '.?').replace(/ /g, '\\s*')}($|[^a-z])`).test(text.toLowerCase()) ? 1 : 0;
  let best = 0;
  for (let i = 0; i <= Math.max(0, t.length - n.length); i++)
    for (const len of [n.length - 1, n.length, n.length + 1]) best = Math.max(best, 1 - editDistance(t.slice(i, i + len), n) / n.length);
  return best;
}

/**
 * Among look-alike codes, the ones whose name was clearly read on the card (tested on real photos: 0 wrong picks
 * on the player's photos, 1 in 201 eBay photos). Empty when the name could not be read.
 */
export function codesByName(text: string, candidates: string[], catalog: Catalog): string[] {
  const scored = candidates.map((c) => ({ c, s: nameScore(text, catalog[c]?.n ?? '') }));
  const top = Math.max(0, ...scored.map((x) => x.s));
  if (top < 0.85) return [];
  const name = catalog[scored.find((x) => x.s === top)!.c].n;
  return candidates.filter((c) => catalog[c]?.n === name);
}

/** Real codes that differ from `code` by one or two look-alike digits, closest first (for "É uma destas?"). */
export function similarCodes(code: string, known: (c: string) => boolean, max = 8): string[] {
  const dash = code.indexOf('-');
  /** every string with one look-alike swap at a position in [from, to) */
  const swaps = (s: string, from: number, to: number) => {
    const res: string[] = [];
    for (let i = from; i < to; i++) for (const alt of LOOKALIKE[s[i]] ?? '') res.push(s.slice(0, i) + alt + s.slice(i + 1));
    return res;
  };
  const num1 = swaps(code, dash + 1, code.length);                         // card number, one digit off
  const num2 = num1.flatMap((c) => swaps(c, dash + 1, code.length));      // card number, two digits off
  const set1 = swaps(code, 0, dash).filter((c) => /^[A-Z]+\d{2}-/.test(c)); // set number, one digit off
  const out = new Set<string>();
  for (const c of [...num1, ...num2, ...set1]) if (c !== code && known(c)) out.add(c);
  return [...out].slice(0, max);
}

/** "OP01-120" → "OP01" */
export const setOf = (code: string) => code.split('-')[0];

// TODO: confirm this search URL works on ligaonepiece.com.br (it can't be checked automatically).
/** Liga lists every print of a card on the card's page, so alternative prints link to their code. */
export const ligaUrl = (code: string) =>
  `https://www.ligaonepiece.com.br/?view=cards/search&card=${encodeURIComponent(code.split('_')[0])}`;

/**
 * Card art = Bandai's "SAMPLE"-watermarked images, mirrored by optcgapi.com (bandai's own server blocks
 * embedding). Kill switch: set VITE_CARD_IMAGES=off in the environment and every card becomes a colour block.
 */
export const SHOW_IMAGES = import.meta.env?.VITE_CARD_IMAGES !== 'off';
export const imageUrl = (code: string) => `https://optcgapi.com/media/static/Card_Images/${code}.jpg`;

/**
 * Built by scripts/build-catalog.mjs. n name, c colour(s) e.g. "Red Purple", r rarity, t type, s set name,
 * k cost, p power, ct counter, l life (leaders), a attribute, tr traits ("Straw Hat Crew"…),
 * u = any number of copies allowed in a deck, lr = what a leader forbids in its deck.
 */
export type CardInfo = {
  n: string; c: string; r: string; t: string; s: string;
  k?: number; p?: number; ct?: number; l?: number; a?: string; tr?: string[];
  u?: 1; lr?: { maxCost?: number; eventMaxCost?: number };
  /** alternative prints in catalog.json: version id → label */
  v?: Record<string, string>;
  /** set on an alternative print's own entry ("OP01-120_p2"): the normal card's code and the print's label */
  b?: string; vl?: string;
};
export type Catalog = Record<string, CardInfo>;

let catalog: Promise<Catalog> | undefined;
/**
 * The catalog, with every alternative print as its own entry ("OP01-120_p2" → the card's data + b/vl), so the
 * collection, wishlist and prices can count each print separately while rules use the normal code.
 */
export const loadCatalog = () =>
  (catalog ??= fetch('/catalog.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((cat: Catalog) => {
    for (const [code, info] of Object.entries(cat))
      for (const [vid, label] of Object.entries(info.v ?? {})) cat[`${code}_${vid}`] = { ...info, v: undefined, b: code, vl: label };
    return cat;
  }));
/** "OP01-120_p2" → "OP01-120" (a normal code stays as is). */
export const baseOf = (id: string) => id.split('_')[0];
/** Normal prints first, then each card's alternative prints. */
export const byPrint = (a: string, b: string) => baseOf(a).localeCompare(baseOf(b)) || (a.includes('_') ? 1 : 0) - (b.includes('_') ? 1 : 0) || a.localeCompare(b);
/** Every print of a card: the normal one first. */
export const printsOf = (code: string, cat: Catalog) => [code, ...Object.keys(cat[code]?.v ?? {}).map((v) => `${code}_${v}`)];
/** Adds up quantities per card code across its prints ({ "OP01-120": 1, "OP01-120_p2": 1 } → { "OP01-120": 2 }). */
export function perCode(list: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, q] of Object.entries(list)) out[baseOf(id)] = (out[baseOf(id)] ?? 0) + q;
  return out;
}

const COLOR_PT: Record<string, string> = {
  Red: 'Vermelho', Green: 'Verde', Blue: 'Azul', Purple: 'Roxo', Black: 'Preto', Yellow: 'Amarelo',
};
export const colorsPt = (c = '') => c.split(' ').map((x) => COLOR_PT[x] ?? x).join(' e ');
export const COLORS = Object.keys(COLOR_PT);
export const colorPt = (c: string) => COLOR_PT[c] ?? c;
export const TYPE_PT: Record<string, string> = { Leader: 'Líder', Character: 'Personagem', Event: 'Evento', Stage: 'Palco' };
export const RARITIES = ['C', 'UC', 'R', 'SR', 'SEC', 'L', 'PR', 'TR', 'P']; // display order
/** A card's colours as a list ("Red Purple" → ["Red", "Purple"]). */
export const colorsOf = (info?: CardInfo) => (info?.c ?? '').split(' ').filter(Boolean);
export const colorKeys = (c = '') => c.split(' ').filter((x) => x in COLOR_PT).map((x) => x.toLowerCase());
