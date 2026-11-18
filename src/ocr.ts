// One text reader (tesseract.js) for the whole app, kept alive between scanner sessions so reopening
// the scanner is instant. Loaded lazily; preloaded in the background once the player has scanned before.
import type { Worker } from 'tesseract.js';

let worker: Promise<Worker> | undefined;
let onProgress: ((p: number) => void) | undefined;
const USED_KEY = 'usedScanner';

/** Receives download/initialisation progress (0–1) while the reader loads. */
export const setOcrProgress = (cb?: (p: number) => void) => { onProgress = cb; };

export function getOcr(): Promise<Worker> {
  worker ??= (async () => {
    try { localStorage.setItem(USED_KEY, '1'); } catch { /* storage blocked */ }
    const { createWorker, PSM } = await import('tesseract.js');
    const w = await createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        if (/loading|initializ/.test(m.status)) onProgress?.(m.progress);
      },
    });
    await w.setParameters({ tessedit_char_whitelist: 'OPSTEBRI0123456789-', tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return w;
  })().catch((e) => { worker = undefined; throw e; });
  return worker;
}

/** Reads text only (no layout/hOCR/TSV output, which tesseract would otherwise also build). */
export const readText = async (img: HTMLCanvasElement) =>
  (await (await getOcr()).recognize(img, {}, { text: true, blocks: false, hocr: false, tsv: false })).data.text ?? '';

/**
 * Warm the reader up in the background — only for players who already used the scanner, so nobody
 * downloads the reader (a few MB) just by opening the app.
 */
export function preloadOcr() {
  let used = false;
  try { used = localStorage.getItem(USED_KEY) === '1'; } catch { /* storage blocked */ }
  if (!used) return;
  const go = () => { getOcr().catch(() => {}); };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 });
  else setTimeout(go, 2000);
}
