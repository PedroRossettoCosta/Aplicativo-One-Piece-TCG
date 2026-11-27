// Adds the DON!! cards to public/catalog.json from optcgapi.com's DON list (prices are dropped).
// DON!! cards have no printed code, so each gets "DON-<n>" from optcgapi's id ("don_12" → "DON-012"); keep that
// mapping stable, since it is the key in the players' collections. Existing DON entries are replaced.
// Per card: the usual fields, t = r = "DON!!", img = the image file name on optcgapi.com (not named after the code).
// Usage: node scripts/add-dons.mjs <allDonCards.json>   (https://optcgapi.com/api/allDonCards/)
import { readFileSync, writeFileSync } from 'node:fs';

const dons = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8'));
for (const code of Object.keys(catalog)) if (code.startsWith('DON-')) delete catalog[code];

let n = 0;
for (const d of dons) {
  const num = d.card_image_id?.match(/^don_(\d+)$/)?.[1];
  if (!num) continue;
  const code = `DON-${num.padStart(3, '0')}`;
  // "DON!! Card (Zoro) (Gold)" → "DON!! Zoro (Gold)"; "DON!! Card // Green Compass" → "DON!! Green Compass"
  const name = d.card_name.replace(/^DON!! Card\s*(\/\/\s*)?/, '').replace(/^\(([^)]*)\)/, '$1').trim();
  catalog[code] = {
    n: name ? `DON!! ${name}` : 'DON!!',
    c: '', r: 'DON!!', t: 'DON!!',
    s: d.set_name || 'DON!!',
    ...(d.card_image ? { img: d.card_image.split('/').pop() } : {}),
  };
  n++;
}
writeFileSync('public/catalog.json', JSON.stringify(catalog));
console.log(`${n} DON!! cards`);
