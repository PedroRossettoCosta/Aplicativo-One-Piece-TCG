// Wishlist: cards the player wants to buy, with the prices they noted on Liga. Tick what you are buying now
// and read the total; "Comprei" moves the ticked cards into the collection.
import { useMemo, useState } from 'react';
import { ligaUrl, type Catalog } from './cards';
import type { Collection, Prices } from './backend';
import { CardFace, CardStepper, Sheet, PRICE_FIELDS, brl, ageLabel, daysSince, markPending } from './ui';
import { FilterBar, NO_FILTERS, matches, type Filters } from './Filters';
import { PlusIcon, MinusIcon, ExternalIcon, CheckIcon } from './icons';

type Basis = 'min' | 'avg' | 'max';
const PICK_KEY = 'wishPicked', BASIS_KEY = 'wishBasis';
const load = <T,>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback; } catch { return fallback; } };
const store = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export default function WishlistScreen({ wish, owned, prices, catalog, change, onPrice, onBought }: {
  wish: Collection; owned: Collection; prices: Prices; catalog: Catalog;
  change: (code: string, delta: number) => void; onPrice: (code: string) => void;
  onBought: (codes: Record<string, number>) => void;
}) {
  const codes = Object.keys(wish).sort();
  // what the player is buying now and which Liga column they count with: this device only
  const [picked, setPicked] = useState<string[]>(() => load(PICK_KEY, []));
  const [basis, setBasis] = useState<Basis>(() => load(BASIS_KEY, 'avg'));
  const [adding, setAdding] = useState(false);
  const pick = (next: string[]) => { setPicked(next); store(PICK_KEY, next); };
  const chosen = picked.filter((c) => wish[c]);

  const sum = (list: string[]) => {
    let total = 0, missing = 0, copies = 0;
    for (const c of list) {
      const unit = prices[c]?.[basis] ?? prices[c]?.avg ?? prices[c]?.min ?? prices[c]?.max;
      copies += wish[c];
      if (unit == null) missing++; else total += unit * wish[c];
    }
    return { total, missing, copies };
  };
  const now = sum(chosen), all = sum(codes);
  const basisLabel = PRICE_FIELDS.find(([k]) => k === basis)![1].toLowerCase();

  return (
    <main className="wishlist">
      <header className="top">
        <h1>Lista de desejos</h1>
        <p className="totals">
          <strong>{codes.length}</strong> {codes.length === 1 ? 'carta' : 'cartas'} · <strong>{all.copies}</strong> {all.copies === 1 ? 'cópia' : 'cópias'}
          {all.total > 0 && <> · tudo: <strong>{brl(all.total)}</strong></>}
        </p>
      </header>

      {codes.length === 0 ? (
        <section className="empty">
          <h2>Nenhuma carta na lista</h2>
          <p>Adicione cartas que você quer comprar. No deck builder, as cartas que faltam vão para cá com um toque.</p>
          <button className="btn primary" onClick={() => setAdding(true)}><PlusIcon /> Adicionar carta</button>
        </section>
      ) : (
        <>
          <div className="wish-tools">
            <div className="segmented" role="radiogroup" aria-label="Somar pelo preço">
              {PRICE_FIELDS.map(([k, label]) => (
                <button key={k} role="radio" aria-checked={basis === k} className={basis === k ? 'on' : ''}
                  onClick={() => { setBasis(k); store(BASIS_KEY, k); }}>{label}</button>
              ))}
            </div>
            <button className="btn small" onClick={() => setAdding(true)}><PlusIcon /> Adicionar</button>
          </div>
          <p className="hint pad">Marque o que vai comprar agora. A soma usa o preço <strong>{basisLabel}</strong> que você anotou da Liga.</p>

          <ul className="wish-list">
            {codes.map((code) => {
              const info = catalog[code], p = prices[code], on = chosen.includes(code);
              const unit = p?.[basis] ?? p?.avg ?? p?.min ?? p?.max;
              return (
                <li key={code} className={`wish-row${on ? ' on' : ''}`}>
                  <button className="pick" role="checkbox" aria-checked={on} aria-label={`Comprar agora: ${info?.n ?? code}`}
                    onClick={() => pick(on ? chosen.filter((c) => c !== code) : [...chosen, code])}>
                    <span className="box">{on && <CheckIcon />}</span>
                  </button>
                  <span className="wish-art"><CardFace code={code} info={info} count={wish[code]} /></span>
                  <div className="wish-info">
                    <p className="tile-name">{info?.n ?? code}</p>
                    <p className="tile-meta">{code}{info && ` · ${info.r}`}{owned[code] ? ` · você tem ${owned[code]}` : ''}</p>
                    {unit != null ? (
                      <p className="wish-price">
                        <strong>{brl(unit * wish[code])}</strong>
                        {wish[code] > 1 && <span> ({wish[code]} × {brl(unit)})</span>}
                        <span className={`price-age${daysSince(p!.at) > 7 ? ' stale' : ''}`}> · {ageLabel(p!.at)}</span>
                        {' '}<button className="inline-link" onClick={() => onPrice(code)}>editar</button>
                      </p>
                    ) : (
                      <button className="inline-link" onClick={() => onPrice(code)}>Anotar preço da Liga</button>
                    )}
                    <div className="wish-actions">
                      <div className="stepper small" role="group" aria-label="Cópias desejadas">
                        <button onClick={() => change(code, -1)} aria-label="Uma cópia a menos"><MinusIcon /></button>
                        <output aria-live="polite">{wish[code]}</output>
                        <button onClick={() => change(code, 1)} aria-label="Uma cópia a mais"><PlusIcon /></button>
                      </div>
                      <a className="liga" href={ligaUrl(code)} target="_blank" rel="noopener noreferrer" onClick={() => markPending(code)}>
                        Liga <ExternalIcon />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="buy-bar" aria-live="polite">
            <div>
              <p className="buy-total">{!chosen.length ? 'Nada marcado' : now.missing === chosen.length ? 'Sem preço anotado' : brl(now.total)}</p>
              <p className="hint">
                {chosen.length
                  ? `${now.copies} ${now.copies === 1 ? 'cópia' : 'cópias'} marcadas${now.missing ? ` · ${now.missing} sem preço anotado` : ''}`
                  : 'Marque as cartas que vai comprar agora'}
              </p>
            </div>
            {chosen.length > 0 ? (
              <button className="btn primary" onClick={() => {
                if (!confirm(`Passar ${now.copies} ${now.copies === 1 ? 'cópia' : 'cópias'} para a sua coleção e tirar da lista de desejos?`)) return;
                onBought(Object.fromEntries(chosen.map((c) => [c, wish[c]])));
                pick([]);
              }}>Comprei</button>
            ) : (
              <button className="btn" onClick={() => pick(codes)}>Marcar todas</button>
            )}
          </div>
        </>
      )}

      {adding && <AddWishSheet catalog={catalog} wish={wish} owned={owned} onAdd={(c) => change(c, 1)} onRemove={(c) => change(c, -1)} onClose={() => setAdding(false)} />}
    </main>
  );
}

/** Search the whole catalog and tap cards to want them (each tap = one more copy). */
export function AddWishSheet({ catalog, wish, owned, onAdd, onRemove, onClose }: {
  catalog: Catalog; wish: Collection; owned: Collection; onAdd: (code: string) => void; onRemove: (code: string) => void; onClose: () => void;
}) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [limit, setLimit] = useState(60);
  const all = useMemo(() => Object.keys(catalog).sort(), [catalog]);
  const hits = useMemo(() => all.filter((c) => matches(c, catalog, f)), [all, catalog, f]);
  return (
    <Sheet title="Adicionar à lista de desejos" onClose={onClose} wide>
      <FilterBar value={f} onChange={(v) => { setF(v); setLimit(60); }} pool={all} catalog={catalog} />
      <p className="hint">Use − e + para escolher quantas cópias você quer. {hits.length} {hits.length === 1 ? 'carta' : 'cartas'}.</p>
      <ul className="card-grid">
        {hits.slice(0, limit).map((c) => (
          <li key={c}>
            <button className="grid-card" onClick={() => onAdd(c)} aria-label={`${catalog[c].n} ${c}: adicionar uma cópia aos desejos`}>
              <CardFace code={c} info={catalog[c]} count={wish[c]} />
              <span className="grid-cap">{c}{owned[c] ? ` · tem ${owned[c]}` : ''}</span>
            </button>
            <CardStepper value={wish[c] ?? 0} name={catalog[c].n} onMinus={() => onRemove(c)} onPlus={() => onAdd(c)} />
          </li>
        ))}
      </ul>
      {hits.length > limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Mostrar mais</button>}
    </Sheet>
  );
}
