import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  onUserChange, signIn, signUp, signInWithGoogle, redirectLoginResult, setRemember, resetPassword, logOut, deleteAccount,
  watchPlayer, changeQuantity, collect, savePrice, saveDeck, addToWish, buyWished, type User, type Collection, type Price, type Prices,
  loadLearned, saveLearned, clearLearned, type Learned,
  EXAMPLES_PER_CARD, TEACHER_UID, loadSharedLearned, saveSharedLearned, loadAllSharedLearned, clearSharedLearned,
} from './backend';
import {
  normalizeCode, ligaUrl, imageUrl, SHOW_IMAGES, setOf, loadCatalog, colorsPt, colorKeys, baseOf, byPrint, perCode, type Catalog,
} from './cards';
import Scanner, { exampleOf } from './Scanner';
import {
  CardArt, CardFace, CardStepper, PrintPicker, Sheet, PRICE_FIELDS, brl, daysSince, ageLabel, shortAge, markPending, readPending, clearPending, PriceSheet,
  BasisPicker, Toggle, loadPref, storePref, BASIS_KEY, unitPrice, basisLabel, sumPrices, type Basis,
} from './ui';
import { preloadOcr } from './ocr';
import { ScanIcon, ShelfIcon, UserIcon, PlusIcon, MinusIcon, CloseIcon, ExternalIcon, WishIcon, DecksIcon, CheckIcon } from './icons';
import WishlistScreen from './Wishlist';
import DecksScreen from './Decks';
import type { Decks } from './deck';
import { FilterBar, NO_FILTERS, matches, type Filters } from './Filters';
import { getTheme, setTheme, type ThemeChoice } from './theme';

// Phones (iOS especially) keep the page height when the keyboard opens and simply cover the bottom of the
// screen. Track the area that is still visible so bottom sheets sit right above the keyboard.
if (typeof window !== 'undefined' && window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    document.documentElement.style.setProperty('--vv-h', `${vv.height}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onUserChange(setUser), []);

  if (user === undefined) return <main className="loading" aria-busy="true" />;
  return user ? <Shell user={user} /> : <LoginScreen />;
}

// ---------- Login ----------

const SHOWCASE = ['OP01-120', 'ST10-001', 'OP02-035', 'OP01-025', 'OP02-121'];

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(true);
  useEffect(() => { setRemember(keep); }, [keep]);
  useEffect(() => { redirectLoginResult().catch((e) => setMessage(friendlyError(e))); }, []);

  const run =(action: () => Promise<unknown>, done = '') => {
    setBusy(true);
    action().then(() => setMessage(done), (e) => setMessage(friendlyError(e))).finally(() => setBusy(false));
  };

  return (
    <main className="login">
      <div className="login-shelf" aria-hidden="true">
        {SHOWCASE.map((code) => <CardArt key={code} code={code} />)}
      </div>
      <div className="login-body">
        <h1>Sua coleção de One Piece, carta por carta.</h1>
        <p className="lede">Escaneie, organize por coleção e veja o preço na Liga One Piece.</p>
        <form onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)); }} className="stack">
          <label className="field">
            <span>E-mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>Manter conectado neste aparelho</span>
          </label>
          <button type="submit" className="btn primary" disabled={busy}>Entrar</button>
          <div className="row2">
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => signUp(email, password))}>Criar conta</button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(signInWithGoogle)}>Entrar com Google</button>
          </div>
          <button type="button" className="link" onClick={() => run(() => resetPassword(email), 'Enviamos um e-mail para você criar uma nova senha.')}>Esqueci a senha</button>
        </form>
        {message && <p className="message" role="status">{message}</p>}
      </div>
    </main>
  );
}

// ---------- Logged-in shell ----------

function Shell({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('colecao');
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [learned, setLearned] = useState<Learned>({}); // what the player taught the scanner (loaded once)
  const learnedLoaded = useRef(false);
  const pendingSeen = useRef<Int8Array[] | null>(null); // frame waiting for a typed correction
  const pendingDetected = useRef<string | undefined>(undefined); // what the scanner had read for that frame
  const [typePrefix, setTypePrefix] = useState('');
  const [cards, setCards] = useState<Collection>({});
  const [catalog, setCatalog] = useState<Catalog>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  // notices close by themselves after enough time to read them (or with the ×)
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), Math.max(4000, message.length * 60));
    return () => clearTimeout(t);
  }, [message]);
  const [prices, setPrices] = useState<Prices>({});
  const [wish, setWish] = useState<Collection>({});
  const [decks, setDecks] = useState<Decks>({});
  const [pricing, setPricing] = useState<string | null>(null); // card whose Liga price is being noted

  useEffect(() => watchPlayer(user.uid, (d) => { setCards(d.cards); setPrices(d.prices); setWish(d.wish); setDecks(d.decks); }), [user.uid]);
  useEffect(() => {
    if ((!scanning && tab !== 'conta') || learnedLoaded.current) return;
    learnedLoaded.current = true;
    loadLearned(user.uid).then(setLearned);
  }, [scanning, tab, user.uid]);

  // The teacher account's examples, shared by everyone; loaded per set when the scanner needs them.
  const teacher = user.uid === TEACHER_UID;
  const sharedCache = useRef(new Map<string, Promise<Learned>>());
  const loadShared = (set: string) => {
    let p = sharedCache.current.get(set);
    if (!p) { p = loadSharedLearned(set); sharedCache.current.set(set, p); }
    return p;
  };
  const [sharedCount, setSharedCount] = useState(0); // teacher's account screen: cards in the shared base
  useEffect(() => {
    if (!teacher || tab !== 'conta') return;
    loadAllSharedLearned().then((all) => {
      for (const [set, ex] of Object.entries(all)) sharedCache.current.set(set, Promise.resolve(ex));
      setSharedCount(Object.values(all).reduce((n, ex) => n + Object.keys(ex).length, 0));
    }, () => {});
  }, [teacher, tab]);

  /** Remember how `code` looks in this player's camera (newest EXAMPLES_PER_CARD examples per card). */
  const learn = async (code: string, seen: Int8Array[], correctedFrom?: string) => {
    if (correctedFrom) setMessage(`Anotado! O scanner vai lembrar como a ${code} aparece na câmera${teacher ? ', e isso vale para todos os jogadores' : ''}. Ele aprendeu a aparência dessa carta — não uma troca de números —, então a ${correctedFrom} de verdade continua sendo reconhecida normalmente.`);
    const example = await exampleOf(seen, code);
    if (teacher) {
      // the teacher teaches everyone: straight into the shared base (the cached copy too, so it applies now)
      const set = setOf(code), base = await loadShared(set);
      const list = [example, ...(base[code] ?? [])].slice(0, EXAMPLES_PER_CARD);
      base[code] = list;
      saveSharedLearned(set, code, list).catch((e) => setMessage(friendlyError(e)));
      return;
    }
    setLearned((prev) => {
      const list = [example, ...(prev[code] ?? [])].slice(0, EXAMPLES_PER_CARD);
      saveLearned(user.uid, code, list).catch((e) => setMessage(friendlyError(e)));
      return { ...prev, [code]: list };
    });
  };
  useEffect(() => { loadCatalog().then(setCatalog); preloadOcr(); }, []);

  // Back from Liga: offer to note the price. Stored so it survives iOS reloading the app meanwhile.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const pending = readPending();
      if (pending) { clearPending(); setPricing(pending); setFocus(pending); }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  const fail = (e: unknown) => setMessage(friendlyError(e));
  // a noted price stays while the card is in the collection or the wishlist
  const change = (code: string, delta: number) => {
    const wished = wish[code] ?? 0;
    if (delta > 0 && wished > 0) {
      // a card you wanted just arrived (scanned, typed or +): it leaves the wishlist
      const left = Math.max(0, wished - delta);
      setMessage(left ? `${code}: tirei ${delta} da lista de desejos (ainda faltam ${left}).` : `${code} saiu da lista de desejos: você já tem.`);
      return collect(user.uid, code, delta, wished).catch(fail);
    }
    return changeQuantity(user.uid, code, delta, cards[code] ?? 0, wished > 0).catch(fail);
  };
  const changeWish = (code: string, delta: number) =>
    changeQuantity(user.uid, code, delta, wish[code] ?? 0, (cards[code] ?? 0) > 0, 'wish').catch(fail);

  const codes = Object.keys(cards);
  const total = codes.reduce((sum, c) => sum + cards[c], 0);

  return (
    <div className="shell">
      {tab === 'colecao' ? (
        <CollectionScreen cards={cards} prices={prices} catalog={catalog} focus={focus} setFocus={setFocus}
          change={change} total={total} onAdd={() => setAdding(true)} onPrice={setPricing} />
      ) : tab === 'desejos' ? (
        <WishlistScreen wish={wish} owned={cards} prices={prices} catalog={catalog} change={changeWish} onPrice={setPricing}
          onBought={(b) => buyWished(user.uid, b).then(() => setMessage('Pronto! As cartas foram para a sua coleção.'), fail)} />
      ) : tab === 'decks' ? (
        <DecksScreen decks={decks} owned={perCode(cards)} wish={perCode(wish)} catalog={catalog} notify={setMessage}
          save={(id, d) => saveDeck(user.uid, id, d).catch(fail)}
          addWish={(add) => addToWish(user.uid, add).catch(fail)} />
      ) : (
        <AccountScreen user={user} different={codes.length} total={total} onError={setMessage} teacher={teacher}
          learnedCount={teacher ? sharedCount : Object.keys(learned).length}
          onForget={() => {
            const done = () => setMessage(teacher ? 'A base compartilhada foi apagada.' : 'O scanner esqueceu o que aprendeu.');
            const fail = (e: unknown) => setMessage(friendlyError(e));
            if (teacher) clearSharedLearned().then(() => { sharedCache.current.clear(); setSharedCount(0); done(); }, fail);
            else clearLearned(user.uid).then(() => { setLearned({}); learnedLoaded.current = true; done(); }, fail);
          }} />
      )}
      {message && (
        <div className="toast" role="status">
          <p>{message}</p>
          <button className="toast-close" aria-label="Fechar aviso" onClick={() => setMessage('')}><CloseIcon /></button>
        </div>
      )}

      <nav className="tabbar" aria-label="Navegação">
        <button className={tab === 'colecao' ? 'on' : ''} onClick={() => setTab('colecao')} aria-current={tab === 'colecao' ? 'page' : undefined}>
          <ShelfIcon filled={tab === 'colecao'} /><span>Coleção</span>
        </button>
        <button className={tab === 'desejos' ? 'on' : ''} onClick={() => setTab('desejos')} aria-current={tab === 'desejos' ? 'page' : undefined}>
          <WishIcon filled={tab === 'desejos'} /><span>Desejos</span>
        </button>
        <button className="scan" onClick={() => setScanning(true)} aria-label="Escanear carta">
          <ScanIcon />
        </button>
        <button className={tab === 'decks' ? 'on' : ''} onClick={() => setTab('decks')} aria-current={tab === 'decks' ? 'page' : undefined}>
          <DecksIcon filled={tab === 'decks'} /><span>Decks</span>
        </button>
        <button className={tab === 'conta' ? 'on' : ''} onClick={() => setTab('conta')} aria-current={tab === 'conta' ? 'page' : undefined}>
          <UserIcon filled={tab === 'conta'} /><span>Conta</span>
        </button>
      </nav>

      {scanning && (
        <Scanner catalog={catalog} owned={perCode(cards)}
          renderArt={(code) => <CardArt code={code} info={catalog[code]} />}
          onAdd={(code) => { change(code, 1); setTab('colecao'); setFocus(code); }}
          onType={(prefix, seen, detected) => { pendingSeen.current = seen ?? null; pendingDetected.current = detected; setScanning(false); setTypePrefix(prefix ?? ''); setAdding(true); }}
          learned={learned} loadShared={loadShared} onLearn={learn}
          onClose={() => setScanning(false)} />
      )}

      {adding && (
        <AddSheet catalog={catalog} owned={perCode(cards)} initial={typePrefix} onClose={() => { setAdding(false); setTypePrefix(''); pendingSeen.current = null; }}
          onAdd={(code) => {
            change(code, 1); setTab('colecao'); setFocus(code);
            // typed after "Outro número…": the scanner learns the right card for that frame
            if (pendingSeen.current) { learn(baseOf(code), pendingSeen.current, pendingDetected.current !== code ? pendingDetected.current : undefined); pendingSeen.current = null; }
          }} />
      )}

      {pricing && (
        <PriceSheet code={pricing} info={catalog[pricing]} current={prices[pricing]} onClose={() => setPricing(null)}
          onSave={(price) => {
            savePrice(user.uid, pricing, price).catch((e) => setMessage(friendlyError(e)));
            setPricing(null);
          }} />
      )}
    </div>
  );
}

// ---------- Collection: one shelf row per set ----------

type ScreenProps = {
  cards: Collection; prices: Prices; catalog: Catalog; focus: string | null; setFocus: (c: string | null) => void;
  change: (code: string, delta: number) => void; total: number; onAdd: () => void; onPrice: (code: string) => void;
};

type Tab = 'colecao' | 'desejos' | 'decks' | 'conta';

function CollectionScreen({ cards, prices, catalog, focus, setFocus, change, total, onAdd, onPrice }: ScreenProps) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const codes = Object.keys(cards).sort(byPrint);

  // How many cards each set has in the catalog, for real completion figures.
  const setSizes = useMemo(() => {
    const sizes: Record<string, number> = {};
    for (const code of Object.keys(catalog)) if (!catalog[code].b) sizes[setOf(code)] = (sizes[setOf(code)] ?? 0) + 1;
    return sizes;
  }, [catalog]);

  // filtering keeps the set rows; a row with nothing left disappears
  const filtering = filters !== NO_FILTERS && JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const rows = useMemo(() => {
    const bySet = new Map<string, string[]>();
    for (const c of codes) if (!filtering || matches(c, catalog, filters)) bySet.set(setOf(c), [...(bySet.get(setOf(c)) ?? []), c]);
    return [...bySet].map(([set, list]) => ({ set, title: set, codes: list }));
  }, [codes.join(), filters, catalog]);
  const shown = rows.reduce((n, r) => n + r.codes.length, 0);

  const focusedRow = rows.findIndex((r) => focus && r.codes.includes(focus));

  // "Calcular": tap cards to mark them and read what they are worth (nothing marked = everything shown)
  const [basis, setBasis] = useState<Basis>(() => loadPref(BASIS_KEY, 'avg'));
  const [calc, setCalc] = useState<boolean>(() => loadPref('collectionCalc', false));
  const [marked, setMarked] = useState<string[]>([]);
  const shownCodes = rows.flatMap((r) => r.codes);
  const chosen = marked.filter((c) => cards[c]);
  const everything = sumPrices(codes, cards, prices, basis);
  const sel = sumPrices(chosen.length ? chosen : shownCodes, cards, prices, basis);
  const toggleCalc = (v: boolean) => { setCalc(v); storePref('collectionCalc', v); setMarked([]); if (v) setFocus(null); };

  return (
    <main className={`collection${calc ? ' calculating' : ''}`}>
      <header className="top">
        <h1>Minha coleção</h1>
        <p className="totals">
          <strong>{codes.length}</strong> diferentes · <strong>{total}</strong> no total
          {everything.total > 0 && <> · vale <strong>{brl(everything.total)}</strong></>}
        </p>
      </header>

      {codes.length > 0 && (
        <FilterBar value={filters} onChange={(f) => { setFilters(f); setFocus(null); }} pool={codes} catalog={catalog} />
      )}
      {codes.length > 0 && (
        <div className="calc-tools">
          <div className="calc-row">
            <Toggle on={calc} onChange={toggleCalc} label="Calcular valor" />
            {calc && <BasisPicker value={basis} onChange={(k) => { setBasis(k); storePref(BASIS_KEY, k); }} />}
          </div>
          {calc && <p className="hint">Toque nas cartas para somar só elas. Sem nada marcado, soma tudo o que aparece, pelo preço <strong>{basisLabel(basis)}</strong> que você anotou da Liga.</p>}
        </div>
      )}
      {filtering && <p className="hint pad">{shown ? `${shown} ${shown === 1 ? 'carta' : 'cartas'} encontradas` : 'Nenhuma carta da sua coleção passa nesses filtros.'}</p>}

      {codes.length === 0 && (
        <section className="empty">
          <h2>Sua prateleira está vazia</h2>
          <p>Adicione a primeira carta pelo código impresso no canto inferior direito, como OP01-120.</p>
          <button className="btn primary" onClick={onAdd}><PlusIcon /> Adicionar carta</button>
        </section>
      )}

      {rows.map((row, i) => (
        <section key={row.title} className={`shelf${focusedRow >= 0 && focusedRow !== i ? ' dim' : ''}`}>
          <div className="shelf-head">
            <h2>
              {row.title}
              {row.set && catalog[row.codes[0]] && <span className="set-name"> · {catalog[row.codes[0]].s}</span>}
            </h2>
            <span className="completion">
              {row.set && setSizes[row.set] && !filtering ? `${new Set(row.codes.map(baseOf)).size} de ${setSizes[row.set]}` : filtering ? row.codes.length : null}
              {calc && <SetValue value={sumPrices(row.codes, cards, prices, basis).total} />}
            </span>
          </div>
          {row.codes.length === 0 ? (
            <p className="no-results">Nenhuma carta da sua coleção corresponde à busca.</p>
          ) : (
            <ul className="rail">
              {row.codes.map((code) => (
                <Tile key={code} code={code} qty={cards[code]} info={catalog[code]} price={prices[code]} catalog={catalog} cards={cards}
                  unit={unitPrice(prices[code], basis)} marked={calc ? chosen.includes(code) : undefined}
                  focused={!calc && focus === code}
                  onToggle={() => calc
                    ? setMarked(chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code])
                    : setFocus(focus === code ? null : code)}
                  change={change} onPrice={() => onPrice(code)} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {calc && (
        <div className="buy-bar" aria-live="polite">
          <div>
            <p className="buy-total">{sel.missing === (chosen.length || shownCodes.length) ? 'Sem preço anotado' : brl(sel.total)}</p>
            <p className="hint">
              {chosen.length
                ? `${sel.copies} ${sel.copies === 1 ? 'cópia marcada' : 'cópias marcadas'}`
                : `${filtering ? 'Cartas filtradas' : 'Coleção toda'}: ${sel.copies} ${sel.copies === 1 ? 'cópia' : 'cópias'}`}
              {sel.missing ? ` · ${sel.missing} sem preço anotado` : ''}
            </p>
          </div>
          {chosen.length > 0
            ? <button className="btn" onClick={() => setMarked([])}>Desmarcar</button>
            : <button className="btn" onClick={() => setMarked(shownCodes)}>Marcar todas</button>}
        </div>
      )}
    </main>
  );
}

const SetValue = ({ value }: { value: number }) => (value > 0 ? <span className="set-value"> · {brl(value)}</span> : null);

function Tile({ code, qty, info, price, unit, marked, focused, onToggle, change, onPrice, catalog, cards }: {
  code: string; qty: number; info?: Catalog[string]; price?: Price; unit?: number; marked?: boolean; focused: boolean; catalog: Catalog; cards: Collection;
  onToggle: () => void; change: (code: string, delta: number) => void; onPrice: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [prints, setPrints] = useState(false);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }); // left edge: the info column stays fully visible
  }, [focused]);

  return (
    <li ref={ref} className={`tile${focused ? ' focus' : ''}${marked ? ' marked' : ''}`}>
      <button className="tile-art" onClick={onToggle}
        {...(marked === undefined ? { 'aria-expanded': focused } : { role: 'checkbox', 'aria-checked': marked })}
        aria-label={`${info?.n ?? code}, ${qty} ${qty === 1 ? 'cópia' : 'cópias'}${unit != null ? `, ${brl(unit)} cada` : ''}`}>
        <CardFace code={code} info={info} count={focused ? undefined : qty} />
        {marked && <span className="mark"><CheckIcon /></span>}
      </button>
      {!focused && (
        <span className={`tile-price${unit == null ? ' none' : ''}`}>
          {unit == null ? (marked !== undefined ? 'sem preço' : '') : qty > 1 && marked !== undefined ? `${qty} × ${brl(unit)}` : brl(unit)}
          {unit != null && price && <span className={`tile-age${daysSince(price.at) > 7 ? ' stale' : ''}`} title={`Anotado ${ageLabel(price.at)}`}> · {shortAge(price.at)}</span>}
        </span>
      )}
      {focused && (
        <div className="tile-info">
          <p className="tile-name">{info?.n ?? code}</p>
          <p className="tile-meta">
            {colorKeys(info?.c).map((k) => <i key={k} className={`dot ${k}`} />)}
            {baseOf(code)}{info && ` · ${info.r} · ${colorsPt(info.c)}`}
          </p>
          {info?.vl && <p className="tile-meta print-label">{info.vl}</p>}
          <div className="stepper" role="group" aria-label="Quantidade">
            <button onClick={() => change(code, -1)} aria-label="Remover uma cópia"><MinusIcon /></button>
            <output aria-live="polite">{qty}</output>
            <button onClick={() => change(code, 1)} aria-label="Adicionar uma cópia"><PlusIcon /></button>
          </div>
          {price ? (
            <div className="price">
              <dl>
                {PRICE_FIELDS.map(([k, label]) => price[k] != null && (
                  <div key={k}><dt>{label}</dt><dd>{brl(price[k]!)}</dd></div>
                ))}
              </dl>
              {qty > 1 && (
                <dl className="price-total" aria-label={`Total de ${qty} cópias`}>
                  <p>Total das {qty} cópias</p>
                  {PRICE_FIELDS.map(([k, label]) => price[k] != null && (
                    <div key={k}><dt>{label}</dt><dd>{brl(price[k]! * qty)}</dd></div>
                  ))}
                </dl>
              )}
              <p className={`price-age${daysSince(price.at) > 7 ? ' stale' : ''}`}>
                Anotado {ageLabel(price.at)} · <button className="inline-link" onClick={onPrice}>editar</button>
              </p>
            </div>
          ) : (
            <button className="inline-link" onClick={onPrice}>Anotar preço da Liga</button>
          )}
          <a className="liga" href={ligaUrl(code, info)} target="_blank" rel="noopener noreferrer" onClick={() => markPending(code)}>
            Ver preço na Liga <ExternalIcon />
          </a>
          {(catalog[baseOf(code)]?.v) && <button className="inline-link" onClick={() => setPrints(true)}>Outras versões desta carta</button>}
        </div>
      )}
      {prints && (
        <Sheet title={`Versões de ${info?.n ?? code}`} onClose={() => setPrints(false)}>
          <p className="hint">Cada versão conta separado na coleção e tem o seu próprio preço.</p>
          <ul className="card-grid">
            {[baseOf(code), ...Object.keys(catalog[baseOf(code)]?.v ?? {}).map((v) => `${baseOf(code)}_${v}`)].map((id) => (
              <li key={id}>
                <CardFace code={id} info={catalog[id]} count={cards[id]} />
                <span className="grid-cap">{catalog[id]?.vl ?? 'Normal'}</span>
                <CardStepper value={cards[id] ?? 0} name={catalog[id]?.vl ?? 'normal'} onMinus={() => change(id, -1)} onPlus={() => change(id, 1)} />
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </li>
  );
}

// ---------- Add a card (typed code until the camera scanner lands) ----------

function AddSheet({ catalog, owned, initial = '', onAdd, onClose }: {
  catalog: Catalog; owned: Collection; initial?: string; onAdd: (code: string) => void; onClose: () => void;
}) {
  const [input, setInput] = useState(initial);
  const [added, setAdded] = useState<string[]>([]);
  const code = normalizeCode(input);
  const [print, setPrint] = useState<string | null>(null);
  const chosen = print && code && baseOf(print) === code ? print : code;
  const info = code ? catalog[code] : undefined;
  // not a code: look the text up by name (the only way to find DON!! cards, which have no printed code)
  const byName = useMemo(() => {
    const q = input.trim().toLowerCase().replace(/^don\b!*/, 'don!!');
    if (code || q.length < 2) return [];
    return Object.keys(catalog).filter((c) => !catalog[c].b && catalog[c].n.toLowerCase().includes(q)).sort(byPrint).slice(0, 12);
  }, [input, code, catalog]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code) return;
    onAdd(chosen!);
    setAdded([chosen!, ...added]);
    setInput('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="add-title">Adicionar carta</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="add-form">
          <label className="field">
            <span>Código impresso na carta ou nome</span>
            <input autoFocus placeholder="OP01-120" value={input} onChange={(e) => setInput(e.target.value)}
              autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          </label>
          <div className="preview" aria-live="polite">
            {code ? (
              <>
                <CardArt code={code} info={info} />
                <div>
                  <p className="tile-name">{info?.n ?? 'Carta não encontrada no catálogo'}</p>
                  <p className="tile-meta">{code}{info && ` · ${info.r} · ${info.s}`}</p>
                  {owned[code] ? <p className="tile-meta">Você já tem {owned[code]}</p> : null}
                </div>
              </>
            ) : byName.length ? (
              <ul className="name-hits">
                {byName.map((c) => (
                  <li key={c}>
                    <button type="button" onClick={() => setInput(c)}>
                      <CardArt code={c} info={catalog[c]} />
                      <span><span className="tile-name">{catalog[c].n}</span><span className="tile-meta">{c} · {catalog[c].s}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{input ? 'Digite o código (OP01-120) ou o nome da carta, como "DON!! Zoro".' : 'O código fica no canto inferior direito da carta. DON!! não têm código: busque pelo nome.'}</p>
            )}
          </div>
          {code && info && <PrintPicker code={code} catalog={catalog} value={chosen!} onChange={setPrint} />}
          <button type="submit" className="btn primary" disabled={!code}><PlusIcon /> Adicionar{chosen && chosen !== code ? ` (${catalog[chosen]?.vl})` : ''}</button>
        </form>
        {added.length > 0 && <p className="hint">Adicionadas agora: {added.join(', ')}</p>}
      </section>
    </div>
  );
}

// ---------- Account ----------

function AccountScreen({ user, different, total, onError, onForget, learnedCount, teacher }: {
  user: User; different: number; total: number; onError: (m: string) => void; onForget: () => void; learnedCount: number; teacher: boolean;
}) {
  const remove = () => {
    if (confirm('Apagar sua conta e toda a sua coleção? Isso não pode ser desfeito.'))
      deleteAccount(user).catch((e) => onError(friendlyError(e)));
  };
  return (
    <main className="account">
      <header className="top">
        <h1>Conta</h1>
        <p className="totals">{user.email}</p>
      </header>
      <dl className="facts">
        <div><dt>Cartas diferentes</dt><dd>{different}</dd></div>
        <div><dt>Cópias no total</dt><dd>{total}</dd></div>
      </dl>
      <ThemePicker />
      <div className="stack">
        <button className="btn" onClick={logOut}>Sair</button>
        <button className="link danger" onClick={remove}>Apagar minha conta e coleção</button>
      </div>
      <section className="learn-box">
        <h2>Como o scanner aprende</h2>
        <p>Quando você confirma uma carta com <strong>Adicionar</strong>, ou corrige o scanner escolhendo a carta certa em "Não é essa?", ele guarda um pequeno resumo de como aquela carta aparece na sua câmera (cores e formas, não a foto).</p>
        <p>Na próxima vez, ele compara a carta com a imagem oficial <em>e</em> com o que você ensinou. Ele aprende a <strong>aparência</strong> de cada carta, não uma troca de números: ensinar que uma leitura era a 096 não faz a 006 de verdade virar 096, porque as duas têm artes diferentes.</p>
        {teacher ? (
          <p><strong>Esta é a conta professora:</strong> o que você confirma ou corrige vira a base que o scanner de <em>todos</em> os jogadores usa. Ela aprende só com você; as correções dos outros ficam só na conta de cada um.</p>
        ) : (
          <p>Além das suas correções, ele usa uma base de exemplos conferidos pelo criador do app. O que você ensina fica salvo só na sua conta e vale em todos os seus aparelhos.</p>
        )}
        {learnedCount > 0 && <p>{teacher ? 'Base compartilhada' : 'Você ensinou'}: {learnedCount} {learnedCount === 1 ? 'carta' : 'cartas'}.</p>}
        <button className="link" onClick={() => {
          if (confirm(teacher
            ? 'Apagar a base compartilhada? Isso afeta o scanner de todos os jogadores e não pode ser desfeito.'
            : 'Apagar tudo o que o scanner aprendeu com as suas confirmações e correções?')) onForget();
        }}>{teacher ? 'Apagar a base compartilhada' : 'Apagar o que o scanner aprendeu'}</button>
      </section>
      <p className="hint">Preços vêm da Liga One Piece, que abre no navegador. Este app não é afiliado à Liga nem à Bandai.</p>
    </main>
  );
}

function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(getTheme);
  const options: [ThemeChoice, string][] = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];
  return (
    <section className="theme-pick">
      <h2>Aparência</h2>
      <div className="segmented" role="radiogroup" aria-label="Tema">
        {options.map(([v, label]) => (
          <button key={v} role="radio" aria-checked={choice === v} className={choice === v ? 'on' : ''}
            onClick={() => { setChoice(v); setTheme(v); }}>{label}</button>
        ))}
      </div>
      <p className="hint">Automático segue o modo claro/escuro do celular.</p>
    </section>
  );
}

function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Tente entrar.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'Esse e-mail não parece válido.',
    'auth/missing-email': 'Digite seu e-mail primeiro.',
    'auth/missing-password': 'Digite sua senha.',
    'auth/popup-closed-by-user': 'Login com Google cancelado.',
    'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Settings → Authorized domains).',
    'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de apagar a conta.',
    'auth/configuration-not-found': 'Login ainda não ativado no Firebase (Authentication → Get started).',
    'auth/operation-not-allowed': 'Esse tipo de login não está ativado no Firebase.',
    'permission-denied': 'Sem permissão para salvar. Confira as regras do Firestore.',
  };
  return messages[code] ?? `Algo deu errado (${code || String(e)}). Tente de novo.`;
}
