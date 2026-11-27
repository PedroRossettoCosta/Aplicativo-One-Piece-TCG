// Builds public/fp/<SET>.json = { code: fingerprint } for every card in public/catalog.json.
// Images are downloaded only to compute the fingerprints (108 bytes each); no image is stored.
// Usage: node scripts/build-fingerprints.mjs [cacheDir] [--only OP18,P]   (cacheDir keeps downloads between runs;
// --only redoes just those sets, keeping the other files). Cards optcgapi.com lacks fall back to Bandai's card list.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Jimp } from 'jimp';
import { fingerprint, encode } from '../src/fingerprint.ts';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? new Set(args.splice(oi, 2)[1].split(',')) : null;
const cacheDir = args[0];
if (cacheDir) mkdirSync(cacheDir, { recursive: true });
const codes = Object.keys(JSON.parse(readFileSync('public/catalog.json', 'utf8')))
  .filter((c) => !c.startsWith('DON-') && (!only || only.has(c.split('-')[0]))); // DON!! cards have no code to scan
const bySet = {};
let done = 0, failed = 0;

async function load(code) {
  const file = cacheDir && join(cacheDir, `${code}.jpg`);
  if (file && existsSync(file)) return Jimp.read(file);
  let res = await fetch(`https://optcgapi.com/media/static/Card_Images/${code}.jpg`);
  if (res.status === 404) res = await fetch(`https://en.onepiece-cardgame.com/images/cardlist/card/${code}.png`);
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (file) writeFileSync(file, buf);
  return Jimp.read(buf);
}

async function worker(queue) {
  for (let code; (code = queue.shift()); ) {
    try {
      const img = await load(code);
      const { data, width, height } = img.bitmap;
      const fp = fingerprint(data, width, { x: 0, y: 0, w: width, h: height });
      (bySet[code.split('-')[0]] ??= {})[code] = encode(fp);
    } catch (e) {
      failed++;
      console.warn(`skip ${code}: ${e.message}`);
    }
    if (++done % 200 === 0) console.log(`${done}/${codes.length}`);
  }
}

const queue = [...codes];
await Promise.all(Array.from({ length: 4 }, () => worker(queue))); // gentle on the image host
mkdirSync('public/fp', { recursive: true });
for (const [set, fps] of Object.entries(bySet)) writeFileSync(`public/fp/${set}.json`, JSON.stringify(fps));
console.log(`done: ${done - failed} fingerprints in ${Object.keys(bySet).length} sets, ${failed} failed`);
