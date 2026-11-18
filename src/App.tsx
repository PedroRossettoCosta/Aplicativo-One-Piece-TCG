import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  onUserChange, signIn, signUp, signInWithGoogle, resetPassword, logOut, deleteAccount,
  watchCollection, changeQuantity, type User, type Collection,
} from './backend';
import {
  normalizeCode, ligaUrl, imageUrl, SHOW_IMAGES, setOf, loadCatalog, colorsPt, colorKeys, type Catalog,
} from './cards';
import { SearchIcon, ScanIcon, ShelfIcon, UserIcon, PlusIcon, MinusIcon, CloseIcon, ExternalIcon } from './icons';

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

  const run = (action: () => Promise<unknown>, done = '') => {
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
  const [cards, setCards] = useState<Collection>({});
  const [catalog, setCatalog] = useState<Catalog>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => watchCollection(user.uid, setCards), [user.uid]);
  useEffect(() => { loadCatalog().then(setCatalog); }, []);

  const change = (code: string, delta: number) =>
    changeQuantity(user.uid, code, delta, cards[code] ?? 0).catch((e) => setMessage(friendlyError(e)));

  const codes = Object.keys(cards);
  const total = codes.reduce((sum, c) => sum + cards[c], 0);

  return (
    <div className="shell">
      {tab === 'colecao' ? (
        <CollectionScreen cards={cards} catalog={catalog} focus={focus} setFocus={setFocus}
          change={change} total={total} onAdd={() => setAdding(true)} />
      ) : (
        <AccountScreen user={user} different={codes.length} total={total} onError={setMessage} />
      )}
      {message && <p className="toast" role="status" onClick={() => setMessage('')}>{message}</p>}

      <nav className="tabbar" aria-label="Navegação">
        <button className={tab === 'colecao' ? 'on' : ''} onClick={() => setTab('colecao')} aria-current={tab === 'colecao' ? 'page' : undefined}>
          <ShelfIcon /><span>Coleção</span>
        </button>
        <button className="scan" onClick={() => setAdding(true)} aria-label="Adicionar carta">
          <ScanIcon />
        </button>
        <button className={tab === 'conta' ? 'on' : ''} onClick={() => setTab('conta')} aria-current={tab === 'conta' ? 'page' : undefined}>
          <UserIcon /><span>Conta</span>
        </button>
      </nav>

      {adding && (
        <AddSheet catalog={catalog} owned={cards} onClose={() => setAdding(false)}
          onAdd={(code) => { change(code, 1); setTab('colecao'); setFocus(code); }} />
      )}
    </div>
  );
}

// ---------- Collection: one shelf row per set ----------

type ScreenProps = {
  cards: Collection; catalog: Catalog; focus: string | null; setFocus: (c: string | null) => void;
  change: (code: string, delta: number) => void; total: number; onAdd: () => void;
};

function CollectionScreen({ cards, catalog, focus, setFocus, change, total, onAdd }: ScreenProps) {
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
                <Tile key={code} code={code} qty={cards[code]} info={catalog[code]}
                  focused={focus === code} onToggle={() => setFocus(focus === code ? null : code)} change={change} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}

function Tile({ code, qty, info, focused, onToggle, change }: {
  code: string; qty: number; info?: Catalog[string]; focused: boolean;
  onToggle: () => void; change: (code: string, delta: number) => void;
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
          <a className="liga" href={ligaUrl(code)} target="_blank" rel="noopener noreferrer">
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

function AddSheet({ catalog, owned, onAdd, onClose }: {
  catalog: Catalog; owned: Collection; onAdd: (code: string) => void; onClose: () => void;
}) {
  const [input, setInput] = useState('');
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
        <p className="hint">O scanner pela câmera chega na próxima versão.</p>
      </section>
    </div>
  );
}

// ---------- Account ----------

function AccountScreen({ user, different, total, onError }: {
  user: User; different: number; total: number; onError: (m: string) => void;
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
    'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de apagar a conta.',
    'auth/configuration-not-found': 'Login ainda não ativado no Firebase (Authentication → Get started).',
    'auth/operation-not-allowed': 'Esse tipo de login não está ativado no Firebase.',
    'permission-denied': 'Sem permissão para salvar. Confira as regras do Firestore.',
  };
  return messages[code] ?? `Algo deu errado (${code || String(e)}). Tente de novo.`;
}
