// Builds public/catalog.json from optcgapi.com bulk exports. Prices in the source are deliberately dropped:
// the app never shows fetched prices.
// Usage: node scripts/build-catalog.mjs <allSetCards.json> <allSTCards.json> ... [--traits <cards_by_id.json>]
// --traits: punk-records english/index/cards_by_id.json (official card list data, github.com/buhbbl/punk-records),
// whose "types" keep the official trait split ("Giant" / "Elbaph" / "New Giant Pirates").
//
// Per card: n name, c colour(s), r rarity, t type, s set name, k cost, p power, ct counter, l life,
// a attribute, tr traits (array), plus deck-building rules printed on the card:
// u = any number of copies allowed, lr = leader restriction { maxCost } / { eventMaxCost }.
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ti = args.indexOf('--traits');
const official = ti >= 0 ? JSON.parse(readFileSync(args.splice(ti, 2)[1], 'utf8')) : {};
const raw = [];
for (const file of args) raw.push(...JSON.parse(readFileSync(file, 'utf8')));

const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? undefined : +v);
const cards = {};
for (const c of raw) {
  const code = c.card_set_id;
  if (!code || cards[code]) continue; // parallels share the code; keep the first entry
  const text = c.card_text ?? '';
  const card = {
    n: c.card_name.replace(/\s*\(.*$/, ''),
    c: c.card_color,               // e.g. "Red" or "Red Purple"
    r: c.rarity,                   // C, UC, R, SR, SEC, L, P...
    t: c.card_type,                // Leader, Character, Event, Stage
    s: c.set_name,
    k: num(c.card_cost), p: num(c.card_power), ct: num(c.counter_amount), l: num(c.life),
    a: c.attribute && c.attribute !== '?' ? c.attribute : undefined,
    // the official split when available; otherwise the source's space-joined string as one trait
    tr: official[code]?.types?.filter((t) => t && t !== '?') ?? (c.sub_types && c.sub_types !== '?' ? [c.sub_types] : []),
  };
  if (/rules of this game, you may have any number of this card/i.test(text)) card.u = 1;
  const maxCost = text.match(/rules of this game, you cannot include cards with a cost of (\d+) or more/i);
  const evCost = text.match(/rules of this game, you cannot include Events with a cost of (\d+) or more/i);
  if (maxCost) card.lr = { maxCost: +maxCost[1] - 1 };
  if (evCost) card.lr = { ...card.lr, eventMaxCost: +evCost[1] - 1 };
  if (!card.tr.length) delete card.tr;
  cards[code] = card;
}
writeFileSync('public/catalog.json', JSON.stringify(cards));
console.log(Object.keys(cards).length, 'cards');
