import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  onUserChange, signIn, signUp, signInWithGoogle, redirectLoginResult, setRemember, resetPassword, logOut, deleteAccount,
  watchCollection, changeQuantity, savePrice, type User, type Collection, type Price, type Prices,
  loadLearned, saveLearned, clearLearned, type Learned,
  EXAMPLES_PER_CARD, TEACHER_UID, loadSharedLearned, saveSharedLearned, loadAllSharedLearned, clearSharedLearned,
} from './backend';
import {
  normalizeCode, ligaUrl, imageUrl, SHOW_IMAGES, setOf, loadCatalog, colorsPt, colorKeys, type Catalog,
} from './cards';
import Scanner, { exampleOf } from './Scanner';
import { preloadOcr } from './ocr';
import { SearchIcon, ScanIcon, ShelfIcon, UserIcon, PlusIcon, MinusIcon, CloseIcon, ExternalIcon } from './icons';

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
  const [tab, setTab] = useState<'colecao' | 'conta'>('colecao');
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
  const [pricing, setPricing] = useState<string | null>(null); // card whose Liga price is being noted

  useEffect(() => watchCollection(user.uid, (c, p) => { setCards(c); setPrices(p); }), [user.uid]);
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

  const change = (code: string, delta: number) =>
    changeQuantity(user.uid, code, delta, cards[code] ?? 0).catch((e) => setMessage(friendlyError(e)));

  const codes = Object.keys(cards);
  const total = codes.reduce((sum, c) => sum + cards[c], 0);

  return (
    <div className="shell">
      {tab === 'colecao' ? (
        <CollectionScreen cards={cards} prices={prices} catalog={catalog} focus={focus} setFocus={setFocus}
          change={change} total={total} onAdd={() => setAdding(true)} onPrice={setPricing} />
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
          <ShelfIcon /><span>Coleção</span>
        </button>
        <button className="scan" onClick={() => setScanning(true)} aria-label="Escanear carta">
          <ScanIcon />
        </button>
        <button className={tab === 'conta' ? 'on' : ''} onClick={() => setTab('conta')} aria-current={tab === 'conta' ? 'page' : undefined}>
          <UserIcon /><span>Conta</span>
        </button>
      </nav>

      {scanning && (
        <Scanner catalog={catalog} owned={cards}
          renderArt={(code) => <CardArt code={code} info={catalog[code]} />}
          onAdd={(code) => { change(code, 1); setTab('colecao'); setFocus(code); }}
          onType={(prefix, seen, detected) => { pendingSeen.current = seen ?? null; pendingDetected.current = detected; setScanning(false); setTypePrefix(prefix ?? ''); setAdding(true); }}
          learned={learned} loadShared={loadShared} onLearn={learn}
          onClose={() => setScanning(false)} />
      )}

      {adding && (
        <AddSheet catalog={catalog} owned={cards} initial={typePrefix} onClose={() => { setAdding(false); setTypePrefix(''); pendingSeen.current = null; }}
          onAdd={(code) => {
            change(code, 1); setTab('colecao'); setFocus(code);
            // typed after "Outro número…": the scanner learns the right card for that frame
            if (pendingSeen.current) { learn(code, pendingSeen.current, pendingDetected.current !== code ? pendingDetected.current : undefined); pendingSeen.current = null; }
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

function CollectionScreen({ cards, prices, catalog, focus, setFocus, change, total, onAdd, onPrice }: ScreenProps) {
  const [query, setQuery] = useState('');
  const codes = Object.keys(cards).sort();

  // How many cards each set has in the catalog, for real completion figures.
  const setSizes = useMemo(() => {
    const sizes: Record<string, number> = {};
    for (const code of Object.keys(catalog)) sizes[setOf(code)] = (sizes[setOf(code)] ?? 0) + 1;
    return sizes;
  }, [catalog]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (q) {
      const hits = codes.filter((c) => c.toLowerCase().includes(q) || catalog[c]?.n.toLowerCase().includes(q));
      return [{ set: '', title: `Resultados para “${query.trim()}”`, codes: hits }];
    }
    const bySet = new Map<string, string[]>();
    for (const c of codes) bySet.set(setOf(c), [...(bySet.get(setOf(c)) ?? []), c]);
    return [...bySet].map(([set, list]) => ({ set, title: set, codes: list }));
  }, [codes.join(), q, catalog]);

  const focusedRow = rows.findIndex((r) => focus && r.codes.includes(focus));

  return (
    <main className="collection">
      <header className="top">
        <h1>Minha coleção</h1>
        <p className="totals">
          <strong>{codes.length}</strong> diferentes · <strong>{total}</strong> no total
        </p>
      </header>

      {codes.length > 0 && (
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Buscar por código ou nome" value={query}
            onChange={(e) => { setQuery(e.target.value); setFocus(null); }} aria-label="Buscar na coleção" />
        </label>
      )}

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
            {row.set && setSizes[row.set] ? (
              <span className="completion">{row.codes.length} de {setSizes[row.set]}</span>
            ) : null}
          </div>
          {row.codes.length === 0 ? (
            <p className="no-results">Nenhuma carta da sua coleção corresponde à busca.</p>
          ) : (
            <ul className="rail">
              {row.codes.map((code) => (
                <Tile key={code} code={code} qty={cards[code]} info={catalog[code]} price={prices[code]}
                  focused={focus === code} onToggle={() => setFocus(focus === code ? null : code)}
                  change={change} onPrice={() => onPrice(code)} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}

function Tile({ code, qty, info, price, focused, onToggle, change, onPrice }: {
  code: string; qty: number; info?: Catalog[string]; price?: Price; focused: boolean;
  onToggle: () => void; change: (code: string, delta: number) => void; onPrice: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [focused]);

  return (
    <li ref={ref} className={`tile${focused ? ' focus' : ''}`}>
      <button className="tile-art" onClick={onToggle} aria-expanded={focused}
        aria-label={`${info?.n ?? code}, ${qty} ${qty === 1 ? 'cópia' : 'cópias'}`}>
        <CardArt code={code} info={info} />
        {!focused && qty > 1 && <span className="qty-badge">×{qty}</span>}
      </button>
      {focused && (
        <div className="tile-info">
          <p className="tile-name">{info?.n ?? code}</p>
          <p className="tile-meta">
            {colorKeys(info?.c).map((k) => <i key={k} className={`dot ${k}`} />)}
            {code}{info && ` · ${info.r} · ${colorsPt(info.c)}`}
          </p>
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
          <a className="liga" href={ligaUrl(code)} target="_blank" rel="noopener noreferrer" onClick={() => markPending(code)}>
            Ver preço na Liga <ExternalIcon />
          </a>
        </div>
      )}
    </li>
  );
}

/** Card image, or — when images are switched off or fail — a block in the card's own colours. */
function CardArt({ code, info }: { code: string; info?: Catalog[string] }) {
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

// ---------- Add a card (typed code until the camera scanner lands) ----------

function AddSheet({ catalog, owned, initial = '', onAdd, onClose }: {
  catalog: Catalog; owned: Collection; initial?: string; onAdd: (code: string) => void; onClose: () => void;
}) {
  const [input, setInput] = useState(initial);
  const [added, setAdded] = useState<string[]>([]);
  const code = normalizeCode(input);
  const info = code ? catalog[code] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code) return;
    onAdd(code);
    setAdded([code, ...added]);
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
            <span>Código impresso na carta</span>
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
            ) : (
              <p className="hint">{input ? 'Continue digitando: o formato é OP01-120.' : 'O código fica no canto inferior direito da carta.'}</p>
            )}
          </div>
          <button type="submit" className="btn primary" disabled={!code}><PlusIcon /> Adicionar</button>
        </form>
        {added.length > 0 && <p className="hint">Adicionadas agora: {added.join(', ')}</p>}
      </section>
    </div>
  );
}

// ---------- Prices the player notes from Liga (typed by hand; Liga can't be read automatically) ----------

const PRICE_FIELDS = [['min', 'Menor'], ['avg', 'Médio'], ['max', 'Maior']] as const;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "1.450,00" / "R$ 145" / "145.5" → number, or undefined when empty/invalid. */
function parseBrl(s: string): number | undefined {
  let t = s.replace(/[R$\s]/g, '');
  if (!t) return undefined;
  if (t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // "1.450" = 1450
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}
const daysSince = (at: number) => Math.floor((Date.now() - at) / 86_400_000);
function ageLabel(at: number) {
  const d = daysSince(at);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

// Remembers which card's Liga page was opened, for up to 1 hour, so the price sheet can appear on return.
const PENDING_KEY = 'pendingPriceCheck';
function markPending(code: string) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage blocked */ }
}
function readPending(): string | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
    return p && Date.now() - p.at < 3_600_000 ? p.code : null;
  } catch { return null; }
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ }
}

function PriceSheet({ code, info, current, onSave, onClose }: {
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
          <h2 id="price-title">Preço na Liga: {info?.n ?? code}</h2>
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
