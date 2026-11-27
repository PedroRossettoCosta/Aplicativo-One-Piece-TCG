// Wishlist: cards the player wants to buy, with the prices they noted on Liga. Tick what you are buying now
// and read the total; "Comprei" moves the ticked cards into the collection.
import { useMemo, useState } from 'react';
import { ligaUrl, baseOf, byPrint, type Catalog } from './cards';
import type { Collection, Prices } from './backend';
import {
  CardFace, CardStepper, Sheet, brl, ageLabel, daysSince, markPending,
  BasisPicker, Toggle, loadPref as load, storePref as store, BASIS_KEY, unitPrice, basisLabel, sumPrices, type Basis,
} from './ui';
import { FilterBar, NO_FILTERS, matches, type Filters } from './Filters';
import { PlusIcon, MinusIcon, ExternalIcon, CheckIcon } from './icons';

const PICK_KEY = 'wishPicked', CALC_KEY = 'wishCalc';

export default function WishlistScreen({ wish, owned, prices, catalog, change, onPrice, onBought }: {
  wish: Collection; owned: Collection; prices: Prices; catalog: Catalog;
  change: (code: string, delta: number) => void; onPrice: (code: string) => void;
  onBought: (codes: Record<string, number>) => void;
}) {
  const codes = Object.keys(wish).sort(byPrint);
  // what the player is buying now and which Liga column they count with: this device only
  const [picked, setPicked] = useState<string[]>(() => load(PICK_KEY, []));
  const [basis, setBasis] = useState<Basis>(() => load(BASIS_KEY, 'avg'));
  const [adding, setAdding] = useState(false);
  // "Calcular" off hides the ticks, the price column picker and the total bar: just the list
  const [calc, setCalc] = useState<boolean>(() => load(CALC_KEY, true));
  const pick = (next: string[]) => { setPicked(next); store(PICK_KEY, next); };
  const chosen = picked.filter((c) => wish[c]);

  const now = sumPrices(chosen, wish, prices, basis), all = sumPrices(codes, wish, prices, basis);

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
            <Toggle on={calc} onChange={(v) => { setCalc(v); store(CALC_KEY, v); }} label="Calcular" />
            <button className="btn small" onClick={() => setAdding(true)}><PlusIcon /> Adicionar</button>
          </div>
          {calc && (
            <div className="calc-tools">
              <BasisPicker value={basis} onChange={(k) => { setBasis(k); store(BASIS_KEY, k); }} />
              <p className="hint">Marque o que vai comprar agora. A soma usa o preço <strong>{basisLabel(basis)}</strong> que você anotou da Liga.</p>
            </div>
          )}

          <ul className={`wish-list${calc ? '' : ' plain'}`}>
            {codes.map((code) => {
              const info = catalog[code], p = prices[code], on = chosen.includes(code);
              const unit = unitPrice(p, basis);
              return (
                <li key={code} className={`wish-row${on && calc ? ' on' : ''}`}>
                  {calc && <button className="pick" role="checkbox" aria-checked={on} aria-label={`Comprar agora: ${info?.n ?? code}`}
                    onClick={() => pick(on ? chosen.filter((c) => c !== code) : [...chosen, code])}>
                    <span className="box">{on && <CheckIcon />}</span>
                  </button>}
                  <span className="wish-art"><CardFace code={code} info={info} count={wish[code]} /></span>
                  <div className="wish-info">
                    <p className="tile-name">{info?.n ?? code}</p>
                    <p className="tile-meta">{baseOf(code)}{info && ` · ${info.r}`}{owned[code] ? ` · você tem ${owned[code]}` : ''}</p>
                    {info?.vl && <p className="tile-meta print-label">{info.vl}</p>}
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
                      <a className="liga" href={ligaUrl(code, info)} target="_blank" rel="noopener noreferrer" onClick={() => markPending(code)}>
                        Liga <ExternalIcon />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {calc && <div className="buy-bar" aria-live="polite">
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
          </div>}
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
  const [alts, setAlts] = useState(false);
  const all = useMemo(() => Object.keys(catalog).filter((c) => alts || !catalog[c].b).sort(byPrint), [catalog, alts]);
  const hits = useMemo(() => all.filter((c) => matches(c, catalog, f)), [all, catalog, f]);
  return (
    <Sheet title="Adicionar à lista de desejos" onClose={onClose} wide>
      <FilterBar value={f} onChange={(v) => { setF(v); setLimit(60); }} pool={all} catalog={catalog} />
      <label className="check">
        <input type="checkbox" checked={alts} onChange={(e) => { setAlts(e.target.checked); setLimit(60); }} />
        <span>Mostrar artes alternativas</span>
      </label>
      <p className="hint">Use − e + para escolher quantas cópias você quer. {hits.length} {hits.length === 1 ? 'carta' : 'cartas'}.</p>
      <ul className="card-grid">
        {hits.slice(0, limit).map((c) => (
          <li key={c}>
            <button className="grid-card" onClick={() => onAdd(c)} aria-label={`${catalog[c].n} ${c}: adicionar uma cópia aos desejos`}>
              <CardFace code={c} info={catalog[c]} count={wish[c]} />
              <span className="grid-cap">{catalog[c].vl ?? c}{owned[c] ? ` · tem ${owned[c]}` : ''}</span>
            </button>
            <CardStepper value={wish[c] ?? 0} name={catalog[c].n} onMinus={() => onRemove(c)} onPlus={() => onAdd(c)} />
          </li>
        ))}
      </ul>
      {hits.length > limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Mostrar mais</button>}
    </Sheet>
  );
}
