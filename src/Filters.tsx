// Search + filters (colour, type, cost, rarity, trait/crew, set), shared by the collection and the deck builder.
import { useMemo, useState } from 'react';
import { COLORS, colorPt, TYPE_PT, RARITIES, setOf, colorsOf, type Catalog } from './cards';
import { SearchIcon, FilterIcon, CloseIcon } from './icons';
import { Sheet } from './ui';

export type Filters = { q: string; colors: string[]; types: string[]; costs: number[]; rarities: string[]; traits: string[]; sets: string[] };
export const NO_FILTERS: Filters = { q: '', colors: [], types: [], costs: [], rarities: [], traits: [], sets: [] };
const MAX_COST = 10; // "10+" chip

const facetCount = (f: Filters) => f.colors.length + f.types.length + f.costs.length + f.rarities.length + f.traits.length + f.sets.length;

/** Does the card pass? Within a group any choice matches; across groups all must. */
export function matches(code: string, catalog: Catalog, f: Filters): boolean {
  const info = catalog[code];
  const q = f.q.trim().toLowerCase();
  if (q && !(code.toLowerCase().includes(q) || info?.n.toLowerCase().includes(q) || info?.tr?.some((t) => t.toLowerCase().includes(q)))) return false;
  if (!facetCount(f)) return true;
  if (!info) return false;
  if (f.colors.length && !colorsOf(info).some((c) => f.colors.includes(c))) return false;
  if (f.types.length && !f.types.includes(info.t)) return false;
  if (f.costs.length && (info.k == null || !f.costs.includes(Math.min(info.k, MAX_COST)))) return false;
  if (f.rarities.length && !f.rarities.includes(info.r)) return false;
  if (f.traits.length && !info.tr?.some((t) => f.traits.includes(t))) return false;
  if (f.sets.length && !f.sets.includes(setOf(code))) return false;
  return true;
}

/** Search field, "Filtros" button and the active filters as removable chips. `pool` = the cards being filtered. */
export function FilterBar({ value, onChange, pool, catalog, placeholder = 'Buscar por nome, código ou tripulação', hide = [] }: {
  value: Filters; onChange: (f: Filters) => void; pool: string[]; catalog: Catalog; placeholder?: string; hide?: (keyof Filters)[];
}) {
  const [open, setOpen] = useState(false);
  const n = facetCount(value);
  const chips: { label: string; remove: () => void }[] = [
    ...value.colors.map((c) => ({ label: colorPt(c), remove: () => onChange({ ...value, colors: value.colors.filter((x) => x !== c) }) })),
    ...value.types.map((t) => ({ label: TYPE_PT[t] ?? t, remove: () => onChange({ ...value, types: value.types.filter((x) => x !== t) }) })),
    ...value.costs.map((k) => ({ label: `Custo ${k === MAX_COST ? `${MAX_COST}+` : k}`, remove: () => onChange({ ...value, costs: value.costs.filter((x) => x !== k) }) })),
    ...value.rarities.map((r) => ({ label: r, remove: () => onChange({ ...value, rarities: value.rarities.filter((x) => x !== r) }) })),
    ...value.traits.map((t) => ({ label: t, remove: () => onChange({ ...value, traits: value.traits.filter((x) => x !== t) }) })),
    ...value.sets.map((s) => ({ label: s, remove: () => onChange({ ...value, sets: value.sets.filter((x) => x !== s) }) })),
  ];
  return (
    <div className="filterbar">
      <div className="search-row">
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder={placeholder} value={value.q} aria-label="Buscar"
            onChange={(e) => onChange({ ...value, q: e.target.value })} />
        </label>
        <button className={`filter-btn${n ? ' on' : ''}`} onClick={() => setOpen(true)} aria-label={n ? `Filtros, ${n} ativos` : 'Filtros'}>
          <FilterIcon />{n > 0 && <span className="filter-n">{n}</span>}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="active-chips">
          {chips.map((c) => (
            <button key={c.label} className="chip removable" onClick={c.remove} aria-label={`Tirar filtro ${c.label}`}>
              {c.label} <CloseIcon />
            </button>
          ))}
          <button className="inline-link" onClick={() => onChange({ ...NO_FILTERS, q: value.q })}>Limpar</button>
        </div>
      )}
      {open && <FilterSheet value={value} onChange={onChange} pool={pool} catalog={catalog} hide={hide} onClose={() => setOpen(false)} />}
    </div>
  );
}

function FilterSheet({ value, onChange, pool, catalog, hide, onClose }: {
  value: Filters; onChange: (f: Filters) => void; pool: string[]; catalog: Catalog; hide: (keyof Filters)[]; onClose: () => void;
}) {
  const [traitQuery, setTraitQuery] = useState('');
  const toggle = <K extends keyof Filters>(key: K, v: Filters[K] extends (infer T)[] ? T : never) => {
    const list = value[key] as unknown[];
    onChange({ ...value, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
  };

  // options come from the cards being filtered, most common first, with counts
  const { traits, sets, rarities } = useMemo(() => {
    const tr = new Map<string, number>(), st = new Map<string, number>(), ra = new Set<string>();
    for (const c of pool) {
      const info = catalog[c];
      if (!info) continue;
      for (const t of info.tr ?? []) tr.set(t, (tr.get(t) ?? 0) + 1);
      st.set(setOf(c), (st.get(setOf(c)) ?? 0) + 1);
      ra.add(info.r);
    }
    return {
      traits: [...tr].sort((a, b) => b[1] - a[1]),
      sets: [...st].sort((a, b) => a[0].localeCompare(b[0])),
      rarities: RARITIES.filter((r) => ra.has(r)),
    };
  }, [pool, catalog]);
  const tq = traitQuery.trim().toLowerCase();
  const shownTraits = (tq ? traits.filter(([t]) => t.toLowerCase().includes(tq)) : traits.slice(0, 16));
  const result = pool.filter((c) => matches(c, catalog, value)).length;

  return (
    <Sheet title="Filtros" onClose={onClose}>
      <div className="filter-groups">
        <fieldset>
          <legend>Cor</legend>
          <div className="chips">
            {COLORS.map((c) => (
              <button key={c} className={`chip${value.colors.includes(c) ? ' on' : ''}`} aria-pressed={value.colors.includes(c)} onClick={() => toggle('colors', c)}>
                <i className={`dot ${c.toLowerCase()}`} />{colorPt(c)}
              </button>
            ))}
          </div>
        </fieldset>
        {!hide.includes('types') && (
          <fieldset>
            <legend>Tipo</legend>
            <div className="chips">
              {Object.entries(TYPE_PT).map(([t, label]) => (
                <button key={t} className={`chip${value.types.includes(t) ? ' on' : ''}`} aria-pressed={value.types.includes(t)} onClick={() => toggle('types', t)}>{label}</button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>Custo</legend>
          <div className="chips costs">
            {Array.from({ length: MAX_COST + 1 }, (_, k) => (
              <button key={k} className={`chip${value.costs.includes(k) ? ' on' : ''}`} aria-pressed={value.costs.includes(k)} onClick={() => toggle('costs', k)}>
                {k === MAX_COST ? `${MAX_COST}+` : k}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Tripulação e traços</legend>
          <input className="mini-search" type="search" placeholder="Buscar traço (ex.: Navy, Straw Hat Crew)" value={traitQuery}
            onChange={(e) => setTraitQuery(e.target.value)} aria-label="Buscar traço" />
          <div className="chips">
            {value.traits.filter((t) => !shownTraits.some(([s]) => s === t)).map((t) => (
              <button key={t} className="chip on" aria-pressed onClick={() => toggle('traits', t)}>{t}</button>
            ))}
            {shownTraits.map(([t, n]) => (
              <button key={t} className={`chip${value.traits.includes(t) ? ' on' : ''}`} aria-pressed={value.traits.includes(t)} onClick={() => toggle('traits', t)}>
                {t} <span>{n}</span>
              </button>
            ))}
            {!tq && traits.length > 16 && <p className="hint">Mais {traits.length - 16}: use a busca acima.</p>}
          </div>
        </fieldset>
        <fieldset>
          <legend>Raridade</legend>
          <div className="chips">
            {rarities.map((r) => (
              <button key={r} className={`chip${value.rarities.includes(r) ? ' on' : ''}`} aria-pressed={value.rarities.includes(r)} onClick={() => toggle('rarities', r)}>{r}</button>
            ))}
          </div>
        </fieldset>
        {!hide.includes('sets') && sets.length > 1 && (
          <fieldset>
            <legend>Coleção</legend>
            <div className="chips">
              {sets.map(([s, n]) => (
                <button key={s} className={`chip${value.sets.includes(s) ? ' on' : ''}`} aria-pressed={value.sets.includes(s)} onClick={() => toggle('sets', s)}>
                  {s} <span>{n}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={() => onChange({ ...NO_FILTERS, q: value.q })} disabled={!facetCount(value)}>Limpar</button>
        <button className="btn primary" onClick={onClose}>Ver {result} {result === 1 ? 'carta' : 'cartas'}</button>
      </div>
    </Sheet>
  );
}
