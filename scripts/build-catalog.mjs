// Builds public/catalog.json from optcgapi.com bulk exports. Prices in the source are deliberately dropped:
// the app never shows fetched prices.
// Usage: node scripts/build-catalog.mjs <allSetCards.json> <allSTCards.json> ... [--traits <cards_by_id.json>]
// --traits: punk-records english/index/cards_by_id.json (official card list data, github.com/buhbbl/punk-records),
// whose "types" keep the official trait split ("Giant" / "Elbaph" / "New Giant Pirates").
//
// Per card: n name, c colour(s), r rarity, t type, s set name, k cost, p power, ct counter, l life,
// a attribute, tr traits (array), plus deck-building rules printed on the card:
// u = any number of copies allowed, lr = leader restriction { maxCost } / { eventMaxCost },
// v = alternative versions printed with the same code { "p2": "Paralela · Mangá" }; their id is "<code>_p2"
// (the card image file uses the same id).
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ti = args.indexOf('--traits');
const official = ti >= 0 ? JSON.parse(readFileSync(args.splice(ti, 2)[1], 'utf8')) : {};
const raw = [];
for (const file of args) raw.push(...JSON.parse(readFileSync(file, 'utf8')));

// pt-BR names for the version tags in the source's card names ("Shanks (Parallel) (Manga)")
const TAG_PT = {
  'Alternate Art': 'Arte alternativa', Reprint: 'Reimpressão', Parallel: 'Paralela', Manga: 'Mangá',
  'Full Art': 'Arte completa', 'Pirate Foil': 'Foil pirata', 'Jolly Roger Foil': 'Foil Jolly Roger', 'Textured Foil': 'Foil texturizado',
  'Super Alternate Art': 'Super arte alternativa', 'Super Rare Alternate Art': 'Arte alternativa SR', 'Red Super Alternate Art': 'Super arte alternativa vermelha',
  'Super Leader Alternate Art': 'Arte alternativa de líder', Gold: 'Dourada', Silver: 'Prateada', 'Gold Stamped': 'Assinatura dourada',
  'Gold-Stamped Signature': 'Assinatura dourada', 'Wanted Poster': 'Cartaz de procurado', 'Box Topper': 'Box topper', 'Dash Pack': 'Dash pack',
  'Heroine Leader': 'Líder heroína',
};
function versionLabel(name) {
  const tags = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).filter((t) => !/^\d+$|^[A-Z]+\d*-\d+$/.test(t));
  return tags.length ? tags.map((t) => TAG_PT[t] ?? t).join(' · ') : 'Versão alternativa';
}

const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? undefined : +v);
const cards = {};
const variants = {};
const vidOf = (c) => (c.card_image_id?.includes('_') ? c.card_image_id.slice(c.card_image_id.indexOf('_') + 1) : '');
// normal prints first, so a card known only from an alternative print still gets its data from that print
for (const c of [...raw.filter((c) => !vidOf(c)), ...raw.filter((c) => vidOf(c))]) {
  const code = c.card_set_id;
  if (!code) continue;
  const vid = vidOf(c);
  if (vid) (variants[code] ??= {})[vid] = versionLabel(c.card_name); // alternative art, same card
  if (cards[code]) continue;
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
for (const [code, v] of Object.entries(variants)) if (cards[code]) cards[code].v = v;
writeFileSync('public/catalog.json', JSON.stringify(cards));
console.log(Object.keys(cards).length, 'cards');
