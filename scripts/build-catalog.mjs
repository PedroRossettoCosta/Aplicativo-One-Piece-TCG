// Builds public/catalog.json from optcgapi.com bulk exports (names, colours, rarity, set).
// Prices in the source are deliberately dropped: the app never shows prices.
// Usage: node scripts/build-catalog.mjs <allSetCards.json> <allSTCards.json> ...
import { readFileSync, writeFileSync } from 'node:fs';
const cards = {};
for (const file of process.argv.slice(2)) {
  for (const c of JSON.parse(readFileSync(file, 'utf8'))) {
    const code = c.card_set_id;
    if (!code || cards[code]) continue; // parallels share the code; keep the first entry
    cards[code] = {
      n: c.card_name.replace(/\s*\(.*$/, ''),
      c: c.card_color,               // e.g. "Red" or "Red Purple"
      r: c.rarity,                   // C, UC, R, SR, SEC, L, P...
      t: c.card_type,                // Leader, Character, Event, Stage
      s: c.set_name,
    };
  }
}
writeFileSync('public/catalog.json', JSON.stringify(cards));
console.log(Object.keys(cards).length, 'cards');
