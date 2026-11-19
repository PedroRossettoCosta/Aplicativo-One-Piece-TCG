// A tiny "fingerprint" of a card's artwork: the average colour of a 6×6 grid over the upper art area,
// normalised so lighting and camera white balance matter less. Used by the scanner to tell look-alike
// codes apart (e.g. OP17-006 vs OP17-096) by what the card looks like. Shared by the browser and
// scripts/build-fingerprints.mjs, so both sides compute it the same way.

/** Art area as fractions of the card, above the "SAMPLE" watermark of the reference images. */
export const ART = { x0: 0.08, x1: 0.92, y0: 0.08, y1: 0.36 };
const GRID = 6;

/** rgba = RGBA pixels of an image `width` wide; rect = the card's position inside that image, in pixels. */
export function fingerprint(
  rgba: Uint8ClampedArray | Uint8Array, width: number,
  rect: { x: number; y: number; w: number; h: number },
): Int8Array {
  const out = new Float64Array(GRID * GRID * 3);
  const ax = rect.x + rect.w * ART.x0, aw = rect.w * (ART.x1 - ART.x0);
  const ay = rect.y + rect.h * ART.y0, ah = rect.h * (ART.y1 - ART.y0);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = Math.floor(ax + (gx * aw) / GRID), x1 = Math.floor(ax + ((gx + 1) * aw) / GRID);
      const y0 = Math.floor(ay + (gy * ah) / GRID), y1 = Math.floor(ay + ((gy + 1) * ah) / GRID);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * width + x) * 4;
        r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
      }
      const o = (gy * GRID + gx) * 3;
      out[o] = r / (n || 1); out[o + 1] = g / (n || 1); out[o + 2] = b / (n || 1);
    }
  }
  // per channel: subtract the mean, divide by the spread (lighting/white-balance invariance)
  const q = new Int8Array(out.length);
  for (let c = 0; c < 3; c++) {
    let mean = 0, sq = 0;
    for (let i = c; i < out.length; i += 3) mean += out[i];
    mean /= GRID * GRID;
    for (let i = c; i < out.length; i += 3) sq += (out[i] - mean) ** 2;
    const sd = Math.sqrt(sq / (GRID * GRID)) || 1;
    for (let i = c; i < out.length; i += 3) q[i] = Math.max(-127, Math.min(127, Math.round(((out[i] - mean) / sd) * 40)));
  }
  return q;
}

/**
 * The card rarely fills the on-screen frame exactly, so fingerprint every plausible placement:
 * card 70–100% of the frame width, slid around inside it. Compare with the min distance over all.
 */
export function fingerprintsInFrame(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Int8Array[] {
  const out: Int8Array[] = [];
  for (const s of [0.7, 0.76, 0.82, 0.88, 0.94, 1]) {
    const w = width * s, h = height * s;
    for (let fy = 0; fy <= 4; fy++) for (let fx = 0; fx <= 4; fx++) {
      out.push(fingerprint(rgba, width, { x: ((width - w) * fx) / 4, y: ((height - h) * fy) / 4, w, h }));
      if (s === 1) return out; // full size: only one placement
    }
  }
  return out;
}

/** Best (smallest) distance between any placement seen in the frame and a reference. */
export const bestDistance = (seen: Int8Array[], ref: Int8Array) => Math.min(...seen.map((s) => distance(s, ref)));

/**
 * Picks between the OCR code and its look-alikes by artwork.
 * - switches away from the OCR code only when another card's art is clearly closer;
 * - `sure` = the chosen card's art is clearly closer than every other candidate, so a single OCR read
 *   is enough (no need to wait for a second, matching read).
 */
export function chooseByArt(seen: Int8Array[], read: string, candidates: string[], refs: Record<string, string | string[]>) {
  const scores = candidates
    .filter((c) => refs[c]?.length)
    .map((c) => ({ c, d: Math.min(...[refs[c]].flat().map((r) => bestDistance(seen, decode(r)))) }))
    .sort((a, b) => a.d - b.d);
  const ocr = scores.find((s) => s.c === read);
  if (!ocr || scores.length === 0) return { code: read, sure: false }; // no reference art: trust OCR, not sure
  const best = scores[0];
  const code = best.c !== read && best.d < ocr.d * 0.8 ? best.c : read;
  const chosen = scores.find((s) => s.c === code)!;
  const runnerUp = scores.find((s) => s.c !== code);
  const sure = chosen === best && (!runnerUp || chosen.d < runnerUp.d * 0.8);
  return { code, sure };
}

/**
 * What to remember when the player confirms `code`: the placement of the card in the frame that best matches
 * its official art (or, with no official art, the card filling the frame).
 */
export function exampleFor(seen: Int8Array[], official?: string): string {
  if (!official) return encode(seen[seen.length - 1]);
  const ref = decode(official);
  let best = seen[0], bd = Infinity;
  for (const s of seen) { const d = distance(s, ref); if (d < bd) { bd = d; best = s; } }
  return encode(best);
}

/** Smaller = more alike. */
export function distance(a: Int8Array, b: Int8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2;
  return Math.sqrt(d);
}

export const encode = (fp: Int8Array) => btoa(String.fromCharCode(...new Uint8Array(fp.buffer)));
export const decode = (s: string) => new Int8Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);
