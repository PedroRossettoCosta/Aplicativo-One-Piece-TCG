// Camera scanner: reads the printed card code (bottom-right corner) with on-device OCR.
// Frames never leave the phone. tesseract.js is loaded only when the scanner opens.
import { useEffect, useRef, useState } from 'react';
import { findCode, similarCodes, setOf, type Catalog } from './cards';
import { fingerprintsInFrame, chooseByArt, exampleFor } from './fingerprint';
import { getOcr, readText, setOcrProgress } from './ocr';
import { CloseIcon, PlusIcon } from './icons';

type Props = {
  catalog: Catalog;
  owned: Record<string, number>;
  renderArt: (code: string) => React.ReactNode;
  onAdd: (code: string) => void;
  onType: (prefix?: string, seen?: Int8Array[], detected?: string) => void; // fall back to typing the code (optionally pre-filled, e.g. "OP17-")
  learned: Record<string, string[]>; // what the player taught the scanner (code → fingerprints)
  onLearn: (code: string, seen: Int8Array[], correctedFrom?: string) => void; // the player confirmed `code` for this frame
  onClose: () => void;
};

type Status = 'starting' | 'scanning' | 'found' | 'denied' | 'unsupported';
type Step =
  | { kind: 'loading'; progress: number } // downloading/starting the text reader
  | { kind: 'searching' }                  // reading frames, nothing yet
  | { kind: 'confirming'; code: string }   // read once, waiting for a second matching read
  | { kind: 'art'; code: string };         // comparing the artwork with look-alike codes

export default function Scanner({ catalog, owned, renderArt, onAdd, onType, learned, onLearn, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [found, setFound] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [slow, setSlow] = useState(false); // nothing read for a while: show tips
  const [torch, setTorch] = useState<boolean | null>(null); // null = torch not available
  const [step, setStep] = useState<Step>({ kind: 'loading', progress: 0 }); // what the scanner is doing now
  const paused = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const learnedRef = useRef(learned);
  learnedRef.current = learned;
  const seenRef = useRef<Int8Array[] | null>(null); // the card as seen when the result was shown
  const detectedRef = useRef<string | null>(null); // what the scanner itself said, before any correction

  // Camera + OCR loop
  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
      } catch {
        return setStatus('denied');
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      if ((track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) setTorch(false);
      setStatus('scanning');
      setStep({ kind: 'loading', progress: 0 });
      // usually already loaded (kept alive between sessions / preloaded); otherwise shows download progress
      setOcrProgress((p) => setStep({ kind: 'loading', progress: p }));
      await getOcr().catch(() => {});
      setOcrProgress(undefined);
      if (stopped) return;
      setStep({ kind: 'searching' });

      const canvas = document.createElement('canvas');
      const known = (c: string) => c in catalogRef.current;
      let lastHit = Date.now();
      let recent: (string | null)[] = []; // last 3 reads
      while (!stopped) {
        if (paused.current || !v.videoWidth || !zone.current || !frame.current) { recent = []; await wait(250); continue; }
        grabZone(v, zone.current, canvas);
        const read = findCode(await readText(canvas), known);
        if (stopped) break;
        recent = [...recent, read].slice(-3);
        if (!read || paused.current) { setStep({ kind: 'searching' }); setSlow(Date.now() - lastHit > 6000); continue; }

        // Fast path: one read is enough when the artwork clearly agrees.
        // Otherwise wait until the same code is read twice in the last 3 frames.
        const twice = recent.filter((r) => r === read).length >= 2;
        setStep({ kind: twice ? 'art' : 'confirming', code: read });
        // OCR often gets one digit wrong (006 vs 096): let the artwork decide between look-alike codes
        const art = await pickByArt(v, frame.current, read, known, learnedRef.current).catch(() => ({ code: read, sure: false, seen: null }));
        if (stopped) break;
        if (!art.sure && !twice) continue;

        recent = [];
        paused.current = true;
        navigator.vibrate?.(60);
        setStep({ kind: 'searching' });
        seenRef.current = art.seen;
        detectedRef.current = art.code;
        setFound(art.code);
        setStatus('found');
        lastHit = Date.now();
      }
    })();

    return () => {
      stopped = true;
      setOcrProgress(undefined);
      stream?.getTracks().forEach((t) => t.stop());
      // the text reader stays loaded on purpose, so the next scan starts instantly
    };
  }, []);

  const resume = () => { setFound(null); setStatus('scanning'); paused.current = false; };

  const toggleTorch = async () => {
    const track = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track || torch === null) return;
    await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch(!torch);
  };

  const info = found ? catalog[found] : undefined;

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Escanear carta">
      <video ref={video} className="scanner-video" playsInline muted autoPlay />

      <div ref={frame} className="scan-frame" aria-hidden="true">
        <div ref={zone} className={`code-zone${step.kind === 'loading' ? '' : ' working'}`} />
      </div>

      <div className="scanner-top">
        <button className="round-btn" onClick={onClose} aria-label="Fechar scanner"><CloseIcon /></button>
        {added > 0 && <span className="scan-count">{added} {added === 1 ? 'adicionada' : 'adicionadas'}</span>}
        {torch !== null && (
          <button className={`round-btn${torch ? ' on' : ''}`} onClick={toggleTorch} aria-pressed={torch}>
            Luz
          </button>
        )}
      </div>

      <div className="scanner-bottom">
        {status === 'found' && found ? (
          <div className="scan-result" aria-live="assertive">
            {renderArt(found)}
            <div className="scan-result-info">
              <p className="tile-name">{info?.n ?? found}</p>
              <p className="tile-meta">{found}{info && ` · ${info.r}`}</p>
              <p className="tile-meta">{owned[found] ? `Você tem ${owned[found]}` : 'Nova na coleção'}</p>
              <div className="scan-actions">
                <button className="btn primary" onClick={() => { onAdd(found); if (seenRef.current) onLearn(found, seenRef.current, detectedRef.current !== found ? detectedRef.current ?? undefined : undefined); setAdded((n) => n + 1); resume(); }}>
                  <PlusIcon /> Adicionar
                </button>
                <button className="btn" onClick={resume}>Escanear de novo</button>
              </div>
            </div>
            <div className="scan-alts">
              <p className="hint">Não é essa? Talvez: <span className="learn-note">(escolher a certa ensina o scanner)</span></p>
              <div className="chips">
                {similarCodes(found, (c) => c in catalog, 4).map((c) => (
                  <button key={c} className="chip" onClick={() => setFound(c)}>
                    <strong>{c}</strong> <span>{catalog[c]?.n}</span>
                  </button>
                ))}
                <button className="chip" onClick={() => onType(found.slice(0, found.indexOf('-') + 1), seenRef.current ?? undefined, detectedRef.current ?? undefined)}>Outro número…</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="scan-hint" aria-live="polite">
            {status === 'starting' && <p>Abrindo a câmera…</p>}
            {status === 'scanning' && (
              <>
                <p className="scan-step" role="status">
                  <span className={`spinner${step.kind === 'art' || step.kind === 'confirming' ? ' fast' : ''}`} aria-hidden="true" />
                  {step.kind === 'loading' && `Preparando o leitor… ${Math.round(step.progress * 100)}%`}
                  {step.kind === 'searching' && 'Procurando o código…'}
                  {step.kind === 'confirming' && <>Lido: <strong>{step.code}</strong> · confirmando…</>}
                  {step.kind === 'art' && <>Conferindo a arte de <strong>{step.code}</strong>…</>}
                </p>
                {step.kind === 'loading' && (
                  <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round(step.progress * 100)}%` }} /></div>
                )}
                <p><strong>Aproxime até a carta preencher a moldura.</strong> O código deve ficar dentro da faixa laranja.</p>
                {slow && <p className="hint">Dica: chegue mais perto, segure firme e evite reflexo de luz.</p>}
              </>
            )}
            {status === 'denied' && (
              <p>Sem acesso à câmera. No iPhone: Ajustes → Safari → Câmera → Permitir. Depois abra o scanner de novo.</p>
            )}
            {status === 'unsupported' && <p>Este navegador não permite usar a câmera aqui.</p>}
            <button className="link" onClick={() => onType()}>Digitar o código</button>
          </div>
        )}
      </div>
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maps an on-screen element (plus `pad` of its size on each side) to source pixels of the video. */
function videoRect(v: HTMLVideoElement, el: HTMLElement, pad = 0) {
  const vr = v.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  // the video is shown with object-fit: cover, so map screen pixels back to video pixels
  const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
  const offX = (vr.width - v.videoWidth * scale) / 2;
  const offY = (vr.height - v.videoHeight * scale) / 2;
  const sx = Math.max(0, (r.left - vr.left - offX - r.width * pad) / scale);
  const sy = Math.max(0, (r.top - vr.top - offY - r.height * pad) / scale);
  const sw = Math.min(v.videoWidth - sx, (r.width * (1 + 2 * pad)) / scale);
  const sh = Math.min(v.videoHeight - sy, (r.height * (1 + 2 * pad)) / scale);
  return { sx, sy, sw, sh };
}

const fpCache = new Map<string, Promise<Record<string, string>>>();
const loadSetFingerprints = (set: string) => {
  if (!fpCache.has(set)) fpCache.set(set, fetch(`/fp/${set}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return fpCache.get(set)!;
};

/**
 * Compares the card in the frame with the OCR code and its look-alikes (one or two digits off)
 * and returns the code whose artwork matches clearly better; otherwise keeps the OCR code.
 */
async function pickByArt(v: HTMLVideoElement, frameEl: HTMLElement, code: string, known: (c: string) => boolean, learned: Record<string, string[]>) {
  const candidates = [code, ...similarCodes(code, known, 12)];
  const official: Record<string, string> = Object.assign({}, ...(await Promise.all([...new Set(candidates.map(setOf))].map(loadSetFingerprints))));
  // every candidate is compared with its official art AND with what the player taught for that card
  const fps: Record<string, string[]> = {};
  for (const c of candidates) fps[c] = [...(official[c] ? [official[c]] : []), ...(learned[c] ?? [])];
  const { sx, sy, sw, sh } = videoRect(v, frameEl);
  const c = document.createElement('canvas');
  c.width = 250; c.height = Math.round((250 * sh) / sw);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const seen = fingerprintsInFrame(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  return { ...chooseByArt(seen, code, candidates, fps), seen };
}

/** The fingerprint to remember for `code` from a frame the player confirmed. */
export async function exampleOf(seen: Int8Array[], code: string): Promise<string> {
  return exampleFor(seen, (await loadSetFingerprints(setOf(code)))[code]);
}

/** Copies the on-screen code zone (plus a margin) out of the video frame, as high-contrast black on white. */
function grabZone(v: HTMLVideoElement, zoneEl: HTMLElement, canvas: HTMLCanvasElement) {
  const { sx, sy, sw, sh } = videoRect(v, zoneEl, 0.15);

  const outW = 1000; // upscale: the printed code is tiny, OCR needs ~30px tall letters
  canvas.width = outW;
  canvas.height = Math.round((outW * sh) / sw);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // grayscale + threshold at the mean; make the background white whatever the card's colours
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  const mean = sum / (px.length / 4);
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 < mean ? 0 : 255;
    if (!g) dark++;
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  if (dark > px.length / 8) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  ctx.putImageData(img, 0, 0);
}
