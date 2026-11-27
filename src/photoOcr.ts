// Reads the card code from ONE close-up photo of it (taken with the phone's own camera, so it is sharp and
// full resolution). Tries a few crops / contrast versions of the photo and stops as soon as two agree.
import { findCode } from './cards';
import { readText } from './ocr';

export type PhotoRead = { code: string; others: string[] };
type Crop = { x: number; y: number; w: number; h: number };
type Gray = { g: Uint8ClampedArray; w: number; h: number };

const MAX_SIDE = 1400; // big enough for letters of a close-up, small enough to read in about a second

/** Opens the photo (iPhone rotation already applied by the browser). */
async function open(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }
}

/** Greyscale copy of `crop`, scaled so its longest side is MAX_SIDE (never more than 2× up). */
function grayOf(src: CanvasImageSource, crop: Crop): Gray {
  const s = Math.min(MAX_SIDE / Math.max(crop.w, crop.h), 2);
  const w = Math.max(1, Math.round(crop.w * s)), h = Math.max(1, Math.round(crop.h * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  return { g, w, h };
}

/** Turns the picture a quarter turn (for photos taken with the card sideways). */
function rotate({ g, w, h }: Gray, clockwise: boolean): Gray {
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = clockwise ? h - 1 - y : y, ny = clockwise ? x : w - 1 - x;
    out[ny * h + nx] = g[y * w + x];
  }
  return { g: out, w: h, h: w };
}

function toCanvas(w: number, h: number, value: (i: number) => number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = value(i);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Black text on white, judged against the brightness AROUND each pixel (not the whole photo), so coloured
 * card borders and shadows don't swallow the letters. `light` = the text is lighter than its background.
 */
function threshold({ g, w, h }: Gray, light: boolean) {
  const sum = new Float64Array((w + 1) * (h + 1)); // integral image
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += light ? 255 - g[y * w + x] : g[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.max(w, h) / 24));
  return toCanvas(w, h, (i) => {
    const x = i % w, y = (i / w) | 0;
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    const area = (x1 - x0) * (y1 - y0);
    const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / area;
    const v = light ? 255 - g[i] : g[i];
    return v < mean * 0.85 ? 0 : 255;
  });
}

/** Plain greyscale with the contrast stretched (tesseract's own binarisation sometimes does best). */
function stretched({ g, w, h }: Gray) {
  let lo = 255, hi = 0;
  for (const v of g) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 255 / Math.max(1, hi - lo);
  return toCanvas(w, h, (i) => (g[i] - lo) * k);
}

/**
 * The card code in the photo, or null. `others` = other codes some versions of the photo read (shown first
 * under "Não é essa?"). Only codes for which `known` is true count.
 */
export async function readCodeFromPhoto(file: Blob, known: (c: string) => boolean): Promise<PhotoRead | null> {
  const { src, w, h } = await open(file);
  const memo = new Map<string, Gray>();
  const gray = (key: string, make: () => Gray) => { if (!memo.has(key)) memo.set(key, make()); return memo.get(key)!; };
  const full = () => gray('full', () => grayOf(src, { x: 0, y: 0, w, h }));
  const mid = () => gray('mid', () => grayOf(src, { x: w * 0.15, y: h * 0.15, w: w * 0.7, h: h * 0.7 }));
  const cw = () => gray('cw', () => rotate(full(), true));
  const ccw = () => gray('ccw', () => rotate(full(), false));

  const upright = [
    () => threshold(full(), false), () => threshold(full(), true), () => stretched(full()),
    () => threshold(mid(), false), () => threshold(mid(), true), () => stretched(mid()),
  ];
  const sideways = [() => threshold(cw(), false), () => threshold(ccw(), false), () => threshold(cw(), true), () => threshold(ccw(), true)];

  const votes = new Map<string, number>();
  const tryAll = async (jobs: (() => HTMLCanvasElement)[]) => {
    for (const job of jobs) {
      const code = findCode(await readText(job()), known);
      if (!code) continue;
      const n = (votes.get(code) ?? 0) + 1;
      votes.set(code, n);
      if (n >= 2) return true; // two versions agree: confident enough
    }
    return false;
  };
  if (!(await tryAll(upright)) && votes.size === 0) await tryAll(sideways);
  if ('close' in src) (src as ImageBitmap).close();
  if (votes.size === 0) return null;
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { code: ranked[0], others: ranked.slice(1) };
}
