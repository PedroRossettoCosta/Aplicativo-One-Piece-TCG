// One Piece Card Game deck rules (Comprehensive Rules 5-1-2 + the official banned/restricted list) and the
// plain-text deck list format used by OPTCGSim, Limitless and most deck builders ("4xOP01-016", one per line).
import { colorsOf, type Catalog } from './cards';

export type Deck = { name: string; leader?: string; cards: Record<string, number>; at: number };
export type Decks = Record<string, Deck>;

export const DECK_SIZE = 50;
export const MAX_COPIES = 4;

/**
 * Official banned/restricted list (en.onepiece-cardgame.com/news/restriction.html, read 2026-11-19).
 * Update this block whenever Bandai changes the list.
 */
export const BANNED = ['OP06-047', 'OP03-040', 'OP06-086', 'ST10-001', 'OP06-116', 'OP14-020'];
export const RESTRICTED: Record<string, number> = {};
const BANNED_PAIRS: { a: string; b: string[]; from?: string }[] = [
  { a: 'OP07-115', b: ['EB04-058'] },
  { a: 'OP11-040', b: ['OP11-067', 'OP08-069'] },
  { a: 'EB05-001', b: ['OP13-001', 'OP01-002'], from: '2026-11-27' },
];

export type Issue = { level: 'error' | 'warn'; text: string; codes?: string[] };

export const deckCount = (d: Deck) => Object.values(d.cards).reduce((n, q) => n + q, 0);

/** Can `code` go in a deck led by `leader`? (colour, type, leader restrictions; not counting copies) */
export function fitsLeader(code: string, leader: string | undefined, catalog: Catalog): boolean {
  const info = catalog[code];
  if (!info || info.t === 'Leader') return false;
  if (!leader || !catalog[leader]) return true;
  const L = catalog[leader];
  const allowed = colorsOf(L);
  if (!colorsOf(info).some((c) => allowed.includes(c))) return false;
  if (L.lr?.maxCost != null && (info.k ?? 0) > L.lr.maxCost) return false;
  if (L.lr?.eventMaxCost != null && info.t === 'Event' && (info.k ?? 0) > L.lr.eventMaxCost) return false;
  return true;
}

/** Most copies of `code` a deck may hold. */
export const maxCopies = (code: string, catalog: Catalog) =>
  BANNED.includes(code) ? 0 : catalog[code]?.u ? Infinity : RESTRICTED[code] ?? MAX_COPIES;

/** Everything that makes a deck illegal (errors) or worth a look (warnings), in pt-BR. */
export function checkDeck(d: Deck, catalog: Catalog, today = new Date().toISOString().slice(0, 10)): Issue[] {
  const issues: Issue[] = [];
  const codes = Object.keys(d.cards).filter((c) => d.cards[c] > 0);
  const total = deckCount(d);
  if (!d.leader) issues.push({ level: 'error', text: 'Escolha um líder.' });
  else if (BANNED.includes(d.leader)) issues.push({ level: 'error', text: `O líder ${d.leader} está banido.`, codes: [d.leader] });
  if (total !== DECK_SIZE) issues.push({ level: 'error', text: total < DECK_SIZE ? `${DECK_SIZE - total === 1 ? 'Falta 1 carta' : `Faltam ${DECK_SIZE - total} cartas`} (o deck tem ${DECK_SIZE}).` : `${total - DECK_SIZE === 1 ? 'Sobra 1 carta' : `Sobram ${total - DECK_SIZE} cartas`} (o deck tem ${DECK_SIZE}).` });

  const banned = codes.filter((c) => BANNED.includes(c));
  if (banned.length) issues.push({ level: 'error', text: `Cartas banidas: ${banned.join(', ')}.`, codes: banned });
  const tooMany = codes.filter((c) => d.cards[c] > maxCopies(c, catalog) && !BANNED.includes(c));
  if (tooMany.length) issues.push({ level: 'error', text: `Mais de ${MAX_COPIES} cópias: ${tooMany.join(', ')}.`, codes: tooMany });
  const leaders = codes.filter((c) => catalog[c]?.t === 'Leader');
  if (leaders.length) issues.push({ level: 'error', text: `Líder não entra no deck principal: ${leaders.join(', ')}.`, codes: leaders });

  if (d.leader && catalog[d.leader]) {
    const L = catalog[d.leader];
    const wrongColor = codes.filter((c) => catalog[c] && catalog[c].t !== 'Leader' && !colorsOf(catalog[c]).some((x) => colorsOf(L).includes(x)));
    if (wrongColor.length) issues.push({ level: 'error', text: `Cor diferente do líder: ${wrongColor.join(', ')}.`, codes: wrongColor });
    if (L.lr?.maxCost != null) {
      const bad = codes.filter((c) => (catalog[c]?.k ?? 0) > L.lr!.maxCost!);
      if (bad.length) issues.push({ level: 'error', text: `Este líder não permite custo ${L.lr.maxCost + 1} ou mais: ${bad.join(', ')}.`, codes: bad });
    }
    if (L.lr?.eventMaxCost != null) {
      const bad = codes.filter((c) => catalog[c]?.t === 'Event' && (catalog[c]?.k ?? 0) > L.lr!.eventMaxCost!);
      if (bad.length) issues.push({ level: 'error', text: `Este líder não permite eventos de custo ${L.lr.eventMaxCost + 1} ou mais: ${bad.join(', ')}.`, codes: bad });
    }
  }

  const all = d.leader ? [d.leader, ...codes] : codes;
  for (const pair of BANNED_PAIRS) {
    if (!all.includes(pair.a)) continue;
    const with_ = pair.b.filter((b) => all.includes(b));
    if (!with_.length) continue;
    const upcoming = pair.from && today < pair.from;
    issues.push({
      level: upcoming ? 'warn' : 'error',
      text: `${pair.a} não pode ficar no mesmo deck que ${with_.join(' / ')}${upcoming ? ` (a partir de ${pair.from!.split('-').reverse().join('/')})` : ''}.`,
      codes: [pair.a, ...with_],
    });
  }
  const unknown = codes.filter((c) => !catalog[c]);
  if (unknown.length) issues.push({ level: 'warn', text: `Cartas fora do catálogo: ${unknown.join(', ')}.`, codes: unknown });
  return issues;
}

/** "1xOP01-001\n4xOP01-016…" (leader first), the format OPTCGSim and most deck sites import. */
export function exportDeck(d: Deck): string {
  const lines = d.leader ? [`1x${d.leader}`] : [];
  for (const c of Object.keys(d.cards).sort()) if (d.cards[c] > 0) lines.push(`${d.cards[c]}x${c}`);
  return lines.join('\n');
}

/**
 * Reads a pasted deck list: "4xOP01-016", "4 OP01-016", "OP01-016 x4", one card per line, any extra text ignored.
 * The first Leader found becomes the leader.
 */
export function importDeck(text: string, catalog: Catalog): { leader?: string; cards: Record<string, number>; unknown: string[] } {
  const cards: Record<string, number> = {};
  const unknown: string[] = [];
  let leader: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const m = line.toUpperCase().match(/((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})/);
    if (!m) continue;
    const code = m[1];
    const q = line.match(/(\d+)\s*[x×]\s*[A-Z]|^\s*(\d+)\s+[A-Z]|[x×]\s*(\d+)\s*$/i);
    const qty = Math.max(1, Math.min(50, Number(q?.[1] ?? q?.[2] ?? q?.[3] ?? 1)));
    if (!catalog[code]) { unknown.push(code); continue; }
    if (catalog[code].t === 'Leader' && !leader) { leader = code; continue; }
    cards[code] = (cards[code] ?? 0) + qty;
  }
  return { leader, cards, unknown };
}
