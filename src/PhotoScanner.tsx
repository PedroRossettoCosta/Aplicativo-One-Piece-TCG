// Photo scanner: the player takes a close-up photo of the printed code with the phone's own camera.
// The photo goes only to the app (not to the phone's gallery) and is read on the phone, never uploaded.
import { useEffect, useRef, useState } from 'react';
import { similarCodes, printsOf, type Catalog } from './cards';
import { getOcr, setOcrProgress } from './ocr';
import { readCodeFromPhoto } from './photoOcr';
import { CloseIcon, PlusIcon } from './icons';
import { PrintPicker } from './ui';

type Props = {
  catalog: Catalog;
  owned: Record<string, number>;
  renderArt: (code: string) => React.ReactNode;
  onAdd: (code: string) => void;
  onType: (prefix?: string) => void; // fall back to typing the code (optionally pre-filled, e.g. "OP17-")
  onLive: () => void; // switch to the old live-camera scanner
  onClose: () => void;
  initialFile?: File; // photo already taken when the scan button was pressed
};

type State =
  | { kind: 'idle' }
  | { kind: 'reading'; loading?: number }
  | { kind: 'found'; code: string; others: string[] }
  | { kind: 'missed' };

export default function PhotoScanner({ catalog, owned, renderArt, onAdd, onType, onLive, onClose, initialFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [state, setState] = useState<State>(initialFile ? { kind: 'reading' } : { kind: 'idle' });
  const [print, setPrint] = useState<string | null>(null); // which print of the found card (alternative arts share the code)
  const [added, setAdded] = useState(0);
  const run = useRef(0);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const analyse = async (file: File) => {
    const id = ++run.current;
    setPhoto((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setState({ kind: 'reading' });
    setOcrProgress((p) => { if (run.current === id) setState({ kind: 'reading', loading: p }); });
    try {
      await getOcr();
      setOcrProgress(undefined);
      if (run.current !== id) return;
      setState({ kind: 'reading' });
      const res = await readCodeFromPhoto(file, (c) => c in catalogRef.current);
      if (run.current !== id) return;
      if (res) { navigator.vibrate?.(60); setPrint(res.code); setState({ kind: 'found', ...res }); }
      else setState({ kind: 'missed' });
    } catch {
      if (run.current === id) setState({ kind: 'missed' });
    } finally {
      setOcrProgress(undefined);
    }
  };

  useEffect(() => {
    if (initialFile) analyse(initialFile);
    return () => { run.current++; };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const shoot = () => input.current?.click();
  const found = state.kind === 'found' ? state.code : null;
  const info = found ? catalog[found] : undefined;
  const chips = found
    ? [...new Set([...state.kind === 'found' ? state.others : [], ...similarCodes(found, (c) => c in catalog, 4)])].filter((c) => c !== found).slice(0, 6)
    : [];

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Escanear carta por foto">
      {photo && <img className="photo-preview" src={photo} alt="" />}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) analyse(f); }} />

      <div className="scanner-top">
        <button className="round-btn" onClick={onClose} aria-label="Fechar scanner"><CloseIcon /></button>
        {added > 0 && <span className="scan-count">{added} {added === 1 ? 'adicionada' : 'adicionadas'}</span>}
      </div>

      <div className="scanner-bottom">
        {found ? (
          <div className="scan-result" aria-live="assertive">
            {renderArt(found)}
            <div className="scan-result-info">
              <p className="tile-name">{info?.n ?? found}</p>
              <p className="tile-meta">{found}{info && ` · ${info.r}`}</p>
              <p className="tile-meta">{owned[found] ? `Você tem ${owned[found]}` : 'Nova na coleção'}</p>
              {print && print !== found && <p className="tile-meta">Versão: {catalog[print]?.vl}</p>}
              <div className="scan-actions">
                {/* adding opens the camera for the next card right away (cancel it to stop) */}
                <button className="btn primary" onClick={() => { onAdd(print ?? found); setAdded((n) => n + 1); setState({ kind: 'idle' }); setPhoto(null); shoot(); }}>
                  <PlusIcon /> Adicionar e próxima
                </button>
                <button className="btn" onClick={shoot}>Tirar outra foto</button>
              </div>
            </div>
            {printsOf(found, catalog).length > 1 && (
              <div className="scan-alts">
                <p className="hint">Qual versão é a sua?</p>
                <PrintPicker code={found} catalog={catalog} value={print ?? found} onChange={setPrint} />
              </div>
            )}
            <div className="scan-alts">
              <p className="hint">Não é essa? Talvez:</p>
              <div className="chips">
                {chips.map((c) => (
                  <button key={c} className="chip" onClick={() => { setPrint(c); setState({ kind: 'found', code: c, others: state.kind === 'found' ? state.others : [] }); }}>
                    <strong>{c}</strong> <span>{catalog[c]?.n}</span>
                  </button>
                ))}
                <button className="chip" onClick={() => onType(found.slice(0, found.indexOf('-') + 1))}>Outro número…</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="scan-hint" aria-live="polite">
            {state.kind === 'reading' && (
              <>
                <p className="scan-step" role="status">
                  <span className="spinner fast" aria-hidden="true" />
                  {state.loading != null ? `Preparando o leitor… ${Math.round(state.loading * 100)}%` : 'Lendo o código…'}
                </p>
                {state.loading != null && <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round(state.loading * 100)}%` }} /></div>}
              </>
            )}
            {state.kind === 'missed' && (
              <>
                <p><strong>Não consegui ler o código.</strong></p>
                <p className="hint">Chegue bem perto do código no canto inferior direito, até ele ocupar boa parte da foto. Ele precisa sair nítido, sem reflexo de luz.</p>
              </>
            )}
            {state.kind === 'idle' && (
              <>
                <p><strong>{added > 0 ? 'Adicionada! ' : ''}Tire uma foto de perto do código</strong></p>
                <p className="hint">O código fica no canto inferior direito da carta, como OP01-120. A foto não fica salva no celular.</p>
              </>
            )}
            {state.kind !== 'reading' && <button className="btn primary photo-shoot" onClick={shoot}>Tirar foto do código</button>}
            <div className="photo-links">
              <button className="link" onClick={() => onType()}>Digitar o código</button>
              <button className="link" onClick={onLive}>Usar câmera ao vivo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
