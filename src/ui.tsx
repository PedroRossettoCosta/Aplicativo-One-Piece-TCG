// Pieces shared by every screen: card art with its count bubble, sheets, noted Liga prices.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { imageUrl, SHOW_IMAGES, colorKeys, printsOf, type Catalog } from './cards';
import type { Price } from './backend';
import { CloseIcon, PlusIcon, MinusIcon } from './icons';

/** Card image, or — when images are switched off or fail — a block in the card's own colours. */
export function CardArt({ code, info }: { code: string; info?: Catalog[string] }) {
  const [failed, setFailed] = useState(false);
  if (SHOW_IMAGES && !failed)
    return <img className="art" src={imageUrl(code)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  const [c1 = 'none', c2 = c1] = colorKeys(info?.c);
  return (
    <span className={`art block c1-${c1} c2-${c2}`}>
      <span className="block-code">{code}</span>
      {info && <span className="block-name">{info.n}</span>}
    </span>
  );
}


/**
 * A card face with its count in a bubble at the bottom-right corner (never repeated copies side by side).
 * missing = how many copies the player still lacks: the card is shown desaturated with "faltam N".
 */
export function CardFace({ code, info, count, missing = 0, wished = 0 }: {
  code: string; info?: Catalog[string]; count?: number; missing?: number; wished?: number;
}) {
  return (
    <span className={`face${missing > 0 ? ' lacking' : ''}`}>
      <CardArt code={code} info={info} />
      {missing > 0 && <span className="lack">{wished >= missing ? `${wished} nos desejos` : `faltam ${missing}`}</span>}
      {count != null && count > 0 && <span className="bubble">{count}</span>}
    </span>
  );
}

/** − count + under a card: minus on the left, the chosen quantity in the middle, plus on the right. */
export function CardStepper({ value, onMinus, onPlus, max = Infinity, name }: {
  value: number; onMinus: () => void; onPlus: () => void; max?: number; name: string;
}) {
  return (
    <div className="card-stepper" role="group" aria-label={`Quantidade de ${name}`}>
      <button onClick={onMinus} disabled={value <= 0} aria-label={`Uma ${name} a menos`}><MinusIcon /></button>
      <output aria-live="polite">{value}</output>
      <button onClick={onPlus} disabled={value >= max} aria-label={`Uma ${name} a mais`}><PlusIcon /></button>
    </div>
  );
}

/** Which print of a card (normal or an alternative art): small thumbnails with their names. */
export function PrintPicker({ code, catalog, value, onChange, counts }: {
  code: string; catalog: Catalog; value: string; onChange: (id: string) => void; counts?: Record<string, number>;
}) {
  const prints = printsOf(code, catalog);
  if (prints.length < 2) return null;
  return (
    <div className="prints" role="radiogroup" aria-label="Versão da carta">
      {prints.map((id) => (
        <button key={id} role="radio" aria-checked={value === id} className={`print${value === id ? ' on' : ''}`} onClick={() => onChange(id)}>
          <CardFace code={id} info={catalog[id]} count={counts?.[id]} />
          <span>{catalog[id]?.vl ?? 'Normal'}</span>
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet with a title and a close button; Esc and a tap outside close it. */
export function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><CloseIcon /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

// ---------- Prices the player notes from Liga (typed by hand; Liga can't be read automatically) ----------

export const PRICE_FIELDS = [['min', 'Menor'], ['avg', 'Médio'], ['max', 'Maior']] as const;
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "1.450,00" / "R$ 145" / "145.5" → number, or undefined when empty/invalid. */
function parseBrl(s: string): number | undefined {
  let t = s.replace(/[R$\s]/g, '');
  if (!t) return undefined;
  if (t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // "1.450" = 1450
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}
export const daysSince = (at: number) => Math.floor((Date.now() - at) / 86_400_000);
export function ageLabel(at: number) {
  const d = daysSince(at);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

// Remembers which card's Liga page was opened, for up to 1 hour, so the price sheet can appear on return.
const PENDING_KEY = 'pendingPriceCheck';
export function markPending(code: string) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage blocked */ }
}
export function readPending(): string | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
    return p && Date.now() - p.at < 3_600_000 ? p.code : null;
  } catch { return null; }
}
export function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ }
}

export function PriceSheet({ code, info, current, onSave, onClose }: {
  code: string; info?: Catalog[string]; current?: Price; onSave: (p: Price) => void; onClose: () => void;
}) {
  const initial = (k: 'min' | 'avg' | 'max') => (current?.[k] != null ? current[k]!.toFixed(2).replace('.', ',') : '');
  const [values, setValues] = useState({ min: initial('min'), avg: initial('avg'), max: initial('max') });
  const parsed = { min: parseBrl(values.min), avg: parseBrl(values.avg), max: parseBrl(values.max) };
  const valid = Object.values(parsed).some((v) => v != null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const price: Price = { at: Date.now() };
    for (const [k] of PRICE_FIELDS) if (parsed[k] != null) price[k] = parsed[k];
    onSave(price);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="price-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="price-title">Preço na Liga: {info?.n ?? code}{info?.vl ? ` (${info.vl})` : ''}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><CloseIcon /></button>
        </div>
        <p className="hint">
          Copie os valores que você viu na Liga. Preencha só os que quiser.
          {current && ` Última anotação: ${ageLabel(current.at)}.`}
        </p>
        <form onSubmit={submit} className="add-form">
          <div className="price-fields">
            {PRICE_FIELDS.map(([k, label]) => (
              <label key={k} className="field">
                <span>{label} (R$)</span>
                <input inputMode="decimal" placeholder="0,00" value={values[k]} autoComplete="off"
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <button type="submit" className="btn primary" disabled={!valid}>Salvar preço</button>
          <button type="button" className="link" onClick={onClose}>Agora não</button>
        </form>
      </section>
    </div>
  );
}

