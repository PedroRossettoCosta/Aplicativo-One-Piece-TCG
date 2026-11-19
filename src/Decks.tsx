// Deck builder: several planned decks, official deck rules, what the player owns vs. what is missing,
// and missing copies sent to the wishlist in one tap. Text import/export ("4xOP01-016").
import { useMemo, useState } from 'react';
import { ligaUrl, colorsPt, colorKeys, TYPE_PT, type Catalog } from './cards';
import type { Collection } from './backend';
import { checkDeck, deckCount, exportDeck, importDeck, fitsLeader, maxCopies, DECK_SIZE, BANNED, type Deck, type Decks } from './deck';
import { CardFace, CardStepper, Sheet, markPending } from './ui';
import { FilterBar, NO_FILTERS, matches, type Filters } from './Filters';
import { PlusIcon, MinusIcon, ExternalIcon, CopyIcon, ImportIcon, TrashIcon, BackIcon, WishIcon } from './icons';

type Props = {
  decks: Decks; owned: Collection; wish: Collection; catalog: Catalog;
  save: (id: string, deck: Deck | null) => void;
  /** add copies to the wishlist */
  addWish: (cards: Record<string, number>) => void;
  notify: (m: string) => void;
};

const TYPE_ORDER = ['Character', 'Event', 'Stage'];
const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
/** Copies of each card the deck needs beyond what the player owns. */
const missingOf = (d: Deck, owned: Collection) => {
  const out: Record<string, number> = {};
  for (const c of [d.leader, ...Object.keys(d.cards)].filter(Boolean) as string[]) {
    const need = c === d.leader ? 1 : d.cards[c];
    if (need > (owned[c] ?? 0)) out[c] = need - (owned[c] ?? 0);
  }
  return out;
};
const sumOf = (r: Record<string, number>) => Object.values(r).reduce((n, q) => n + q, 0);

export default function DecksScreen(props: Props) {
  const { decks, owned, catalog, save, notify } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const ids = Object.keys(decks).sort((a, b) => decks[b].at - decks[a].at);

  if (openId && decks[openId]) return <DeckEditor id={openId} {...props} onBack={() => setOpenId(null)} />;

  const create = (deck: Omit<Deck, 'at'>) => {
    const id = newId();
    save(id, { ...deck, at: Date.now() });
    setOpenId(id);
  };

  return (
    <main className="decks">
      <header className="top">
        <h1>Decks</h1>
        <p className="totals"><strong>{ids.length}</strong> {ids.length === 1 ? 'deck planejado' : 'decks planejados'}</p>
      </header>
      <div className="deck-tools">
        <button className="btn primary" onClick={() => create({ name: `Deck ${ids.length + 1}`, cards: {} })}><PlusIcon /> Novo deck</button>
        <button className="btn" onClick={() => setImporting(true)}><ImportIcon /> Importar lista</button>
      </div>

      {ids.length === 0 ? (
        <section className="empty">
          <h2>Nenhum deck ainda</h2>
          <p>Monte um deck do zero ou cole uma lista (ex.: “4xOP01-016”, de qualquer site de decks). O app confere as regras e mostra quais cartas você ainda não tem.</p>
        </section>
      ) : (
        <ul className="deck-list">
          {ids.map((id) => {
            const d = decks[id], n = deckCount(d), errors = checkDeck(d, catalog).filter((i) => i.level === 'error');
            const lacking = sumOf(missingOf(d, owned)), L = d.leader ? catalog[d.leader] : undefined;
            return (
              <li key={id} className="deck-item">
                <button className="deck-row" onClick={() => setOpenId(id)}>
                  <span className="deck-leader">{d.leader ? <CardFace code={d.leader} info={L} /> : <span className="art empty-slot" />}</span>
                  <span className="deck-row-info">
                    <span className="tile-name">{d.name}</span>
                    <span className="tile-meta">
                      {colorKeys(L?.c).map((k) => <i key={k} className={`dot ${k}`} />)}
                      {L ? `${L.n} · ${colorsPt(L.c)}` : 'Sem líder'}
                    </span>
                    <span className="deck-row-stats">
                      <span className={n === DECK_SIZE ? '' : 'warn'}>{n}/{DECK_SIZE}</span>
                      <span className={errors.length ? 'bad' : 'good'}>{errors.length ? `${errors.length} ${errors.length === 1 ? 'problema' : 'problemas'}` : 'Deck válido'}</span>
                      <span>{lacking ? `faltam ${lacking}` : 'você tem tudo'}</span>
                    </span>
                  </span>
                </button>
                <button className="icon-btn deck-row-delete" aria-label={`Apagar o deck ${d.name}`}
                  onClick={() => { if (confirm(`Apagar o deck “${d.name}”?`)) save(id, null); }}><TrashIcon /></button>
              </li>
            );
          })}
        </ul>
      )}

      {importing && (
        <ImportSheet catalog={catalog} onClose={() => setImporting(false)} onImport={(name, r) => {
          setImporting(false);
          create({ name, leader: r.leader, cards: r.cards });
          if (r.unknown.length) notify(`Não encontrei no catálogo: ${r.unknown.join(', ')}.`);
        }} />
      )}
    </main>
  );
}

function DeckEditor({ id, decks, owned, wish, catalog, save, addWish, notify, onBack }: Props & { id: string; onBack: () => void }) {
  const deck = decks[id];
  const [adding, setAdding] = useState<'cards' | 'leader' | null>(deck.leader ? null : 'leader');
  const [open, setOpen] = useState<string | null>(null); // card whose detail sheet is open
  const [exporting, setExporting] = useState(false);
  const update = (patch: Partial<Deck>) => save(id, { ...deck, ...patch, at: Date.now() });
  const setQty = (code: string, qty: number) => {
    const cards = { ...deck.cards };
    if (qty <= 0) delete cards[code]; else cards[code] = qty;
    update({ cards });
  };
  const addOne = (c: string) => {
    const q = deck.cards[c] ?? 0;
    if (q >= maxCopies(c, catalog)) return notify(`Máximo de ${maxCopies(c, catalog)} cópias de ${c}.`);
    if (deckCount(deck) >= DECK_SIZE) notify(`O deck já tem ${DECK_SIZE} cartas.`);
    setQty(c, q + 1);
  };

  const issues = useMemo(() => checkDeck(deck, catalog), [deck, catalog]);
  const errors = issues.filter((i) => i.level === 'error');
  const flagged = new Set(issues.flatMap((i) => i.codes ?? []));
  const missing = missingOf(deck, owned);
  const lacking = sumOf(missing);
  const toWish = Object.fromEntries(Object.entries(missing).map(([c, m]) => [c, Math.max(0, m - (wish[c] ?? 0))]).filter(([, q]) => (q as number) > 0));
  const n = deckCount(deck);
  const L = deck.leader ? catalog[deck.leader] : undefined;

  const groups = TYPE_ORDER.map((t) => ({
    t, codes: Object.keys(deck.cards).filter((c) => (catalog[c]?.t ?? 'Character') === t)
      .sort((a, b) => (catalog[a]?.k ?? 0) - (catalog[b]?.k ?? 0) || a.localeCompare(b)),
  })).filter((g) => g.codes.length);
  const costs = Array.from({ length: 11 }, (_, k) => Object.keys(deck.cards).filter((c) => Math.min(catalog[c]?.k ?? 0, 10) === k).reduce((s, c) => s + deck.cards[c], 0));

  return (
    <main className="deck-editor">
      <header className="editor-top">
        <button className="icon-btn" onClick={onBack} aria-label="Voltar para os decks"><BackIcon /></button>
        <input className="deck-name" value={deck.name} aria-label="Nome do deck" maxLength={40}
          onChange={(e) => update({ name: e.target.value })} />
        <button className="icon-btn" onClick={() => setExporting(true)} aria-label="Exportar lista"><CopyIcon /></button>
        <button className="icon-btn" aria-label="Apagar deck" onClick={() => { if (confirm(`Apagar o deck “${deck.name}”?`)) { save(id, null); onBack(); } }}><TrashIcon /></button>
      </header>

      <section className="deck-summary">
        <button className="leader-slot" onClick={() => setAdding('leader')} aria-label={L ? `Líder: ${L.n}. Trocar líder` : 'Escolher líder'}>
          {deck.leader ? <CardFace code={deck.leader} info={L} missing={missing[deck.leader] ?? 0} wished={wish[deck.leader] ?? 0} /> : <span className="art empty-slot"><PlusIcon /></span>}
        </button>
        <div className="summary-info">
          <p className="tile-name">{L ? L.n : 'Escolha um líder'}</p>
          {L && <p className="tile-meta">{colorKeys(L.c).map((k) => <i key={k} className={`dot ${k}`} />)}{deck.leader} · {colorsPt(L.c)} · vida {L.l}</p>}
          <p className="deck-count"><strong className={n === DECK_SIZE ? '' : 'warn'}>{n}</strong>/{DECK_SIZE} cartas</p>
          <p className={`deck-status ${errors.length ? 'bad' : 'good'}`}>{errors.length ? `${errors.length} ${errors.length === 1 ? 'problema' : 'problemas'} nas regras` : 'Deck válido'}</p>
          <p className="tile-meta">{lacking ? `Você não tem ${lacking} ${lacking === 1 ? 'cópia' : 'cópias'}` : 'Você tem todas as cartas'}</p>
        </div>
      </section>

      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i) => <li key={i.text} className={i.level}>{i.text}</li>)}
        </ul>
      )}

      <div className="deck-actions">
        <button className="btn primary" onClick={() => setAdding('cards')} disabled={!deck.leader}><PlusIcon /> Adicionar cartas</button>
        {lacking > 0 && (
          <button className="btn" disabled={!Object.keys(toWish).length} onClick={() => {
            addWish(toWish);
            const q = sumOf(toWish as Record<string, number>);
            notify(`${q} ${q === 1 ? 'cópia foi' : 'cópias foram'} para a lista de desejos.`);
          }}>
            <WishIcon /> {Object.keys(toWish).length ? `Faltam ${sumOf(toWish as Record<string, number>)} → desejos` : 'Tudo já está nos desejos'}
          </button>
        )}
      </div>

      {n > 0 && (
        <div className="curve" aria-label="Cartas por custo">
          {costs.map((q, k) => (
            <span key={k} className="curve-col">
              <span className="curve-bar" style={{ height: `${Math.min(100, (q / Math.max(...costs, 1)) * 100)}%` }} />
              <span className="curve-q">{q || ''}</span>
              <span className="curve-k">{k === 10 ? '10+' : k}</span>
            </span>
          ))}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.t} className="deck-group">
          <h2>{TYPE_PT[g.t]}s <span>{g.codes.reduce((s, c) => s + deck.cards[c], 0)}</span></h2>
          <ul className="card-grid">
            {g.codes.map((c) => (
              <li key={c}>
                <button className={`grid-card${flagged.has(c) ? ' flagged' : ''}`} onClick={() => setOpen(c)}
                  aria-label={`${catalog[c]?.n ?? c}, ${deck.cards[c]} no deck, você tem ${owned[c] ?? 0}`}>
                  <CardFace code={c} info={catalog[c]} count={deck.cards[c]} missing={missing[c] ?? 0} wished={wish[c] ?? 0} />
                </button>
                <CardStepper value={deck.cards[c]} max={maxCopies(c, catalog)} name={catalog[c]?.n ?? c}
                  onMinus={() => setQty(c, deck.cards[c] - 1)} onPlus={() => addOne(c)} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {adding === 'leader' && (
        <PickSheet title="Escolher líder" catalog={catalog} owned={owned} leaderMode
          pool={Object.keys(catalog).filter((c) => !catalog[c].b && catalog[c].t === 'Leader' && !BANNED.includes(c))}
          onPick={(c) => { update({ leader: c }); setAdding(Object.keys(deck.cards).length ? null : 'cards'); }}
          onClose={() => setAdding(null)} />
      )}
      {adding === 'cards' && (
        <PickSheet title="Adicionar ao deck" catalog={catalog} owned={owned} counts={deck.cards}
          pool={Object.keys(catalog).filter((c) => !catalog[c].b && fitsLeader(c, deck.leader, catalog) && maxCopies(c, catalog) > 0)}
          onPick={addOne} onRemove={(c) => setQty(c, (deck.cards[c] ?? 0) - 1)} maxOf={(c) => maxCopies(c, catalog)}
          onClose={() => setAdding(null)} />
      )}
      {open && (
        <CardSheet code={open} catalog={catalog} inDeck={deck.cards[open] ?? 0} owned={owned[open] ?? 0} wished={wish[open] ?? 0}
          max={maxCopies(open, catalog)}
          setQty={(q) => setQty(open, q)}
          addWish={(q) => { addWish({ [open]: q }); notify(`${q} ${q === 1 ? 'cópia' : 'cópias'} de ${open} na lista de desejos.`); }}
          onClose={() => setOpen(null)} />
      )}
      {exporting && <ExportSheet deck={deck} onClose={() => setExporting(false)} notify={notify} />}
    </main>
  );
}

/** Catalog search with filters; each tap picks a card (adds one copy, or sets the leader). */
function PickSheet({ title, pool, catalog, owned, counts = {}, leaderMode = false, onPick, onRemove, maxOf, onClose }: {
  title: string; pool: string[]; catalog: Catalog; owned: Collection; counts?: Record<string, number>;
  leaderMode?: boolean; onPick: (code: string) => void; onRemove?: (code: string) => void; maxOf?: (code: string) => number; onClose: () => void;
}) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [limit, setLimit] = useState(60);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const sorted = useMemo(() => [...pool].sort(), [pool]);
  const hits = useMemo(() => sorted.filter((c) => matches(c, catalog, f) && (!onlyOwned || owned[c])), [sorted, catalog, f, onlyOwned, owned]);
  return (
    <Sheet title={title} onClose={onClose} wide>
      <FilterBar value={f} onChange={(v) => { setF(v); setLimit(60); }} pool={sorted} catalog={catalog} hide={['types']} />
      <label className="check">
        <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} />
        <span>Só cartas que eu tenho</span>
      </label>
      <p className="hint">
        {leaderMode ? 'Toque no líder.' : 'Use − e + para escolher quantas cópias vão no deck. Só aparecem cartas da cor do líder.'}
        {' '}{hits.length} {hits.length === 1 ? 'carta' : 'cartas'}.
      </p>
      <ul className="card-grid">
        {hits.slice(0, limit).map((c) => (
          <li key={c}>
            <button className={`grid-card${owned[c] ? '' : ' not-owned'}`} onClick={() => onPick(c)} aria-label={`${catalog[c].n} ${c}${owned[c] ? `, você tem ${owned[c]}` : ', você não tem'}`}>
              <CardFace code={c} info={catalog[c]} count={counts[c]} />
              <span className="grid-cap">{c}{owned[c] ? ` · tem ${owned[c]}` : ''}</span>
            </button>
            {onRemove && (
              <CardStepper value={counts[c] ?? 0} max={maxOf?.(c)} name={catalog[c].n} onMinus={() => onRemove(c)} onPlus={() => onPick(c)} />
            )}
          </li>
        ))}
      </ul>
      {hits.length > limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Mostrar mais</button>}
    </Sheet>
  );
}

function CardSheet({ code, catalog, inDeck, owned, wished, max, setQty, addWish, onClose }: {
  code: string; catalog: Catalog; inDeck: number; owned: number; wished: number; max: number;
  setQty: (q: number) => void; addWish: (q: number) => void; onClose: () => void;
}) {
  const info = catalog[code];
  const lack = Math.max(0, inDeck - owned);
  const stillLack = Math.max(0, lack - wished);
  return (
    <Sheet title={info?.n ?? code} onClose={onClose}>
      <div className="card-detail">
        <CardFace code={code} info={info} count={inDeck} missing={lack} wished={wished} />
        <div className="summary-info">
          <p className="tile-meta">{colorKeys(info?.c).map((k) => <i key={k} className={`dot ${k}`} />)}{code} · {info?.r} · {TYPE_PT[info?.t ?? ''] ?? info?.t}</p>
          <p className="tile-meta">
            {info?.k != null && `Custo ${info.k}`}{info?.p != null && ` · ${info.p} poder`}{info?.ct ? ` · counter +${info.ct}` : ''}
          </p>
          {info?.tr?.length ? <p className="tile-meta">{info.tr.join(' / ')}</p> : null}
          <div className="stepper" role="group" aria-label="Cópias no deck">
            <button onClick={() => setQty(inDeck - 1)} aria-label="Uma cópia a menos no deck"><MinusIcon /></button>
            <output aria-live="polite">{inDeck}</output>
            <button onClick={() => setQty(Math.min(max, inDeck + 1))} disabled={inDeck >= max} aria-label="Uma cópia a mais no deck"><PlusIcon /></button>
          </div>
          <p className="tile-meta">Você tem {owned} · nos desejos: {wished}</p>
        </div>
      </div>
      {stillLack > 0 ? (
        <button className="btn primary" onClick={() => addWish(stillLack)}><WishIcon /> Pôr {stillLack} {stillLack === 1 ? 'cópia' : 'cópias'} nos desejos</button>
      ) : lack > 0 ? (
        <p className="hint">As {lack} que faltam já estão na lista de desejos.</p>
      ) : null}
      <a className="liga" href={ligaUrl(code)} target="_blank" rel="noopener noreferrer" onClick={() => markPending(code)}>Ver preço na Liga <ExternalIcon /></a>
    </Sheet>
  );
}

function ImportSheet({ catalog, onImport, onClose }: {
  catalog: Catalog; onImport: (name: string, r: ReturnType<typeof importDeck>) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const r = importDeck(text, catalog);
  const n = sumOf(r.cards);
  return (
    <Sheet title="Importar lista" onClose={onClose}>
      <p className="hint">Cole a lista do deck, uma carta por linha (ex.: “1xOP01-001”, “4xOP01-016”). Funciona com listas do OPTCGSim e da maioria dos sites de decks.</p>
      <label className="field">
        <span>Nome do deck</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Zoro vermelho" maxLength={40} />
      </label>
      <textarea className="deck-text" value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder={'1xOP01-001\n4xOP01-016\n4xOP01-025'} aria-label="Lista do deck" spellCheck={false} />
      {text.trim() && (
        <p className="hint">
          {r.leader ? `Líder: ${catalog[r.leader].n} (${r.leader}). ` : 'Nenhum líder na lista. '}
          {n} {n === 1 ? 'carta' : 'cartas'} no deck.{r.unknown.length ? ` Fora do catálogo: ${r.unknown.join(', ')}.` : ''}
        </p>
      )}
      <button className="btn primary" disabled={!n && !r.leader} onClick={() => onImport(name.trim() || (r.leader ? catalog[r.leader].n : 'Deck importado'), r)}>Importar</button>
    </Sheet>
  );
}

function ExportSheet({ deck, onClose, notify }: { deck: Deck; onClose: () => void; notify: (m: string) => void }) {
  const text = exportDeck(deck);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify('Lista copiada. Cole no OPTCGSim ou em qualquer site de decks.'); onClose(); }
    catch { notify('Não consegui copiar. Selecione o texto e copie à mão.'); }
  };
  return (
    <Sheet title="Exportar lista" onClose={onClose}>
      <textarea className="deck-text" value={text} readOnly rows={10} aria-label="Lista do deck" onFocus={(e) => e.target.select()} />
      <div className="sheet-actions">
        {'share' in navigator && <button className="btn" onClick={() => navigator.share({ title: deck.name, text }).catch(() => {})}>Compartilhar</button>}
        <button className="btn primary" onClick={copy}><CopyIcon /> Copiar</button>
      </div>
    </Sheet>
  );
}
