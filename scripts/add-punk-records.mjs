// Adds to public/catalog.json the cards optcgapi.com does not have yet (new sets such as OP18, recent promos),
// taken from punk-records (github.com/buhbbl/punk-records), a mirror of Bandai's official English card list.
// Cards already in the catalog are never touched, so variant ids and the player's collection keys stay stable.
// Usage: node scripts/add-punk-records.mjs <punk-records/english dir>   (needs packs.json and data/<pack>.json)
// Download: https://raw.githubusercontent.com/buhbbl/punk-records/main/english/packs.json
//           https://raw.githubusercontent.com/buhbbl/punk-records/main/english/data/<pack id>.json
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/add-punk-records.mjs <punk-records/english dir>');
const packs = JSON.parse(readFileSync(join(dir, 'packs.json'), 'utf8'));
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8'));

const RARITY = { Leader: 'L', Common: 'C', Uncommon: 'UC', Rare: 'R', SuperRare: 'SR', SecretRare: 'SEC', Special: 'SP', TreasureRare: 'TR', Promo: 'P' };
const SMALL = new Set(['of', 'the', 'in', 'on', 'and', 'a', 'to', 'vs']);
const titleCase = (s) => s.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
function setName(packId) {
  const p = packs[packId];
  if (!p) return 'Promo';
  if (packId === '569901' || packId === '569801') return 'Promo';
  const { prefix = '', title = '' } = p.title_parts ?? {};
  const name = titleCase(title.replace(/^-|-$/g, '').trim());
  return /EXTRA BOOSTER/i.test(prefix) ? `Extra Booster: ${name}` : /PREMIUM/i.test(prefix) ? `Premium Booster: ${name}` : name;
}

const raw = [];
for (const f of readdirSync(join(dir, 'data')).filter((f) => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
  raw.push(...(Array.isArray(d) ? d : Object.values(d)));
}

const isVariant = (c) => c.id.includes('_');
const added = [], addedVariants = [];
// base prints first, then alternative prints of the cards that were just added
for (const c of raw.filter((c) => !isVariant(c))) {
  if (catalog[c.id]) continue;
  const text = c.effect ?? '';
  const leader = c.category === 'Leader';
  const card = {
    n: c.name,
    c: c.colors.join(' '),
    r: RARITY[c.rarity] ?? c.rarity,
    t: c.category,
    s: setName(c.pack_id),
    k: leader ? undefined : c.cost ?? undefined,
    p: c.power ?? undefined,
    ct: c.counter ?? undefined,
    l: leader ? c.cost ?? undefined : undefined, // the official list keeps a leader's life in "cost"
    a: c.attributes?.[0],
    tr: c.types?.filter((t) => t && t !== '?') ?? [],
  };
  if (/rules of this game, you may have any number of this card/i.test(text)) card.u = 1;
  const maxCost = text.match(/rules of this game, you cannot include cards with a cost of (\d+) or more/i);
  const evCost = text.match(/rules of this game, you cannot include Events with a cost of (\d+) or more/i);
  if (maxCost) card.lr = { maxCost: +maxCost[1] - 1 };
  if (evCost) card.lr = { ...card.lr, eventMaxCost: +evCost[1] - 1 };
  if (!card.tr.length) delete card.tr;
  for (const k of Object.keys(card)) if (card[k] === undefined) delete card[k];
  catalog[c.id] = card;
  added.push(c.id);
}
const fresh = new Set(added);
for (const c of raw.filter(isVariant)) {
  const [code, vid] = c.id.split('_');
  if (!fresh.has(code)) continue; // variants of older cards keep optcgapi's ids
  (catalog[code].v ??= {})[vid] = vid.startsWith('r') ? 'Reimpressão' : 'Versão alternativa';
  addedVariants.push(c.id);
}

writeFileSync('public/catalog.json', JSON.stringify(catalog));
const bySet = {};
for (const code of added) { const s = code.split('-')[0]; bySet[s] = (bySet[s] ?? 0) + 1; }
console.log(`added ${added.length} cards`, bySet, `+ ${addedVariants.length} alternative prints`);
