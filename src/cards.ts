// Card codes look like OP01-120, ST10-005, EB01-001, PRB01-001 or P-001.
const CODE = /^(?:(?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})$/;

/** Cleans user/OCR input ("op01 120" → "OP01-120"). Returns null if it isn't a valid code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s_–—]+/g, '-').replace(/^([A-Z]+\d{2})-?(\d{3})$/, '$1-$2');
  return CODE.test(code) ? code : null;
}

/** "OP01-120" → "OP01" */
export const setOf = (code: string) => code.split('-')[0];

// TODO: confirm this search URL works on ligaonepiece.com.br (it can't be checked automatically).
export const ligaUrl = (code: string) =>
  `https://www.ligaonepiece.com.br/?view=cards/search&card=${encodeURIComponent(code)}`;

/**
 * Card art = Bandai's "SAMPLE"-watermarked images, mirrored by optcgapi.com (bandai's own server blocks
 * embedding). Kill switch: set VITE_CARD_IMAGES=off in the environment and every card becomes a colour block.
 */
export const SHOW_IMAGES = import.meta.env.VITE_CARD_IMAGES !== 'off';
export const imageUrl = (code: string) => `https://optcgapi.com/media/static/Card_Images/${code}.jpg`;

/** n = name, c = colour(s) e.g. "Red Purple", r = rarity, t = type, s = set name. Built by scripts/build-catalog.mjs. */
export type CardInfo = { n: string; c: string; r: string; t: string; s: string };
export type Catalog = Record<string, CardInfo>;

let catalog: Promise<Catalog> | undefined;
export const loadCatalog = () =>
  (catalog ??= fetch('/catalog.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

const COLOR_PT: Record<string, string> = {
  Red: 'Vermelho', Green: 'Verde', Blue: 'Azul', Purple: 'Roxo', Black: 'Preto', Yellow: 'Amarelo',
};
export const colorsPt = (c = '') => c.split(' ').map((x) => COLOR_PT[x] ?? x).join(' e ');
export const colorKeys = (c = '') => c.split(' ').filter((x) => x in COLOR_PT).map((x) => x.toLowerCase());
