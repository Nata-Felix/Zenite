import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronRight, ClipboardPaste, FileText, Paperclip, Plus, X } from "lucide-react";
import type { ChatItem, ChatSnapshot, ChatTheme } from "../../shared/types";
import { openLinkFromMarkdown, renderMarkdown } from "../markdown";
import type { AgentKind } from "../agents";
import "./ChatView.css";

export const CHAT_THEMES: { value: ChatTheme; label: string }[] = [
  { value: "sol", label: "Sol" },
  { value: "netuno", label: "Netuno" },
  { value: "saturno", label: "Saturno" },
];

/** Tema inicial de cada agente; a pessoa troca no próprio chat. */
export function defaultChatTheme(kind: AgentKind): ChatTheme {
  return kind === "codex" ? "netuno" : kind === "antigravity" ? "saturno" : "sol";
}

/** O astro do tema: sol com raios, Netuno listrado, Saturno com anel. */
export function ThemeOrb({ theme, size = 22 }: { theme: ChatTheme; size?: number }) {
  if (theme === "sol") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="chat-orb">
        <defs><radialGradient id="orb-sol" cx="40%" cy="38%" r="60%"><stop offset="0" stopColor="#fff4c4" /><stop offset="0.45" stopColor="#ffc24a" /><stop offset="1" stopColor="#e8761c" /></radialGradient></defs>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i * Math.PI) / 8, r1 = 10.5, r2 = i % 2 ? 14 : 15.5;
          return <line key={i} x1={16 + r1 * Math.cos(a)} y1={16 + r1 * Math.sin(a)} x2={16 + r2 * Math.cos(a)} y2={16 + r2 * Math.sin(a)} stroke="#ffb53d" strokeWidth={1.2} strokeLinecap="round" opacity={0.85} />;
        })}
        <circle cx="16" cy="16" r="8.5" fill="url(#orb-sol)" />
      </svg>
    );
  }
  if (theme === "netuno") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="chat-orb">
        <defs>
          <radialGradient id="orb-netuno" cx="35%" cy="32%" r="75%"><stop offset="0" stopColor="#8cc2ff" /><stop offset="0.5" stopColor="#2f6fe0" /><stop offset="1" stopColor="#0d2a7a" /></radialGradient>
          <clipPath id="orb-netuno-clip"><circle cx="16" cy="16" r="13" /></clipPath>
        </defs>
        <circle cx="16" cy="16" r="13" fill="url(#orb-netuno)" />
        <g clipPath="url(#orb-netuno-clip)" opacity="0.35" stroke="#cfe4ff" strokeWidth="1.1" fill="none">
          <path d="M2 11 Q16 8 30 11" /><path d="M2 16 Q16 13.5 30 16" /><path d="M2 21 Q16 19 30 21" />
        </g>
      </svg>
    );
  }
  return (
    <svg width={size * 1.35} height={size} viewBox="0 0 44 32" aria-hidden className="chat-orb">
      <defs><radialGradient id="orb-saturno" cx="38%" cy="35%" r="70%"><stop offset="0" stopColor="#e9d4ff" /><stop offset="0.5" stopColor="#a66cf0" /><stop offset="1" stopColor="#5a2aa8" /></radialGradient></defs>
      <ellipse cx="22" cy="17" rx="20" ry="5.5" fill="none" stroke="#c9a6ff" strokeWidth="1.6" opacity="0.55" transform="rotate(-14 22 17)" />
      <circle cx="22" cy="16" r="10" fill="url(#orb-saturno)" />
      <path d="M3.2 21.3 A20 5.5 -14 0 0 40.8 12.7" fill="none" stroke="#d9c0ff" strokeWidth="1.8" transform="rotate(0)" />
    </svg>
  );
}

const SLASH: Record<string, { name: string; description: string }[]> = {
  claude: [
    { name: "/clear", description: "Começa uma conversa nova" },
    { name: "/compact", description: "Resume a conversa para liberar contexto" },
    { name: "/model", description: "Troca o modelo" },
    { name: "/resume", description: "Retoma uma conversa anterior" },
    { name: "/review", description: "Revisa as mudanças" },
    { name: "/init", description: "Cria o CLAUDE.md do projeto" },
    { name: "/mcp", description: "Servidores MCP" },
    { name: "/help", description: "Todos os comandos" },
  ],
  codex: [
    { name: "/new", description: "Começa uma conversa nova" },
    { name: "/compact", description: "Resume a conversa para liberar contexto" },
    { name: "/model", description: "Troca o modelo e o esforço" },
    { name: "/approvals", description: "O que pode fazer sem perguntar" },
    { name: "/diff", description: "Mostra as mudanças" },
    { name: "/review", description: "Revisa as mudanças" },
    { name: "/status", description: "Sessão, conta e limites" },
    { name: "/init", description: "Cria o AGENTS.md do projeto" },
  ],
  antigravity: [
    { name: "/clear", description: "Começa uma conversa nova" },
    { name: "/model", description: "Troca o modelo" },
    { name: "/help", description: "Todos os comandos" },
  ],
};

interface Attachment { path: string; name: string; preview?: string }
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;

type Row =
  | { kind: "item"; item: ChatItem }
  | { kind: "tools"; id: string; tools: Extract<ChatItem, { kind: "tool" }>[] };

/** Ferramentas seguidas viram um "N ações" recolhido. */
function group(items: ChatItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (item.kind === "tool") {
      if (last?.kind === "tools") last.tools.push(item);
      else rows.push({ kind: "tools", id: `t${item.id}`, tools: [item] });
    } else rows.push({ kind: "item", item });
  }
  return rows;
}

const COPY_ICON = '<svg class="i-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg class="i-done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const copyButton = (label: string) => `<div class="chat-block-bar"><span>${label}</span><button type="button" class="chat-copy" title="Copiar" aria-label="Copiar">${COPY_ICON}</button></div>`;

/** Blocos de código e tabelas ganham uma barra com o nome e o botão de copiar. */
function withCopyButtons(html: string): string {
  return html
    .replace(/<pre>(\s*<code(?: class="language-([\w+#-]+)")?)/g, (_m, code: string, lang?: string) => `<div class="chat-block code">${copyButton(lang ?? "código")}<pre>${code}`)
    .replace(/<\/pre>/g, "</pre></div>")
    .replace(/<table>/g, `<div class="chat-block table">${copyButton("tabela")}<div class="chat-table-scroll"><table>`)
    .replace(/<\/table>/g, "</table></div></div>");
}

async function copyText(text: string, button: HTMLElement) {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  button.classList.add("copied");
  button.setAttribute("aria-label", "Copiado");
  setTimeout(() => { button.classList.remove("copied"); button.setAttribute("aria-label", "Copiar"); }, 1400);
}

/** Tabela copiada como texto separado por tabulação: cola certinho em planilhas. */
const tableText = (table: HTMLTableElement) => [...table.rows].map((r) => [...r.cells].map((c) => c.innerText.trim()).join("\t")).join("\n");

function AssistantMessage({ text, who, children }: { text: string; who?: string; children?: React.ReactNode }) {
  // Sanitizado pelo DOMPurify em renderMarkdown; as barras de copiar são marcação nossa.
  const html = useMemo(() => withCopyButtons(renderMarkdown(text)), [text]);
  return (
    <div className="chat-agent">
      {who && <span className="chat-who">{who}</span>}
      <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: html }} onClick={(e) => {
        const button = (e.target as HTMLElement).closest<HTMLElement>(".chat-copy");
        if (!button) return openLinkFromMarkdown(e);
        const block = button.closest(".chat-block");
        const table = block?.querySelector("table");
        void copyText(table ? tableText(table) : (block?.querySelector("pre")?.innerText ?? "").replace(/\n$/, ""), button);
      }} />
      <button type="button" className="chat-copy chat-copy-all" title="Copiar a resposta (markdown)" aria-label="Copiar a resposta"
        onClick={(e) => void copyText(text, e.currentTarget)} dangerouslySetInnerHTML={{ __html: `${COPY_ICON}<span>Copiar resposta</span>` }} />
      {children}
    </div>
  );
}

function Actions({ tools }: { tools: Extract<ChatItem, { kind: "tool" }>[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="chat-actions">
      <button className="chat-actions-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight size={14} className={open ? "open" : ""} /> {tools.length} {tools.length === 1 ? "ação" : "ações"}
      </button>
      {open && (
        <ul>
          {tools.map((t) => <li key={t.id}><code>{t.name}</code> {t.label}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Aba Chat do terminal: a mesma sessão do CLI, mostrada como conversa. Lê o arquivo de sessão
 * (main/chatTranscript) e envia pelo mesmo caminho da caixa de mensagem (colar no terminal).
 */
export function ChatView({ id, kind, agentName, theme, onTheme }: { id: string; kind: AgentKind; agentName: string; theme: ChatTheme; onTheme: (t: ChatTheme) => void }) {
  const [snap, setSnap] = useState<ChatSnapshot | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<"add" | "theme" | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const compose = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [lift, setLift] = useState(0);

  // A barra de opções do elemento selecionado fica no rodapé da tela e pode cobrir o campo de
  // mensagem (card focado, zoom, card alto): o campo sobe o quanto for preciso para ficar clicável.
  useEffect(() => {
    const timer = setInterval(() => {
      const el = compose.current;
      const bar = document.querySelector(".node-options-panel")?.getBoundingClientRect();
      if (!el) return;
      const box = el.getBoundingClientRect();
      const scale = el.offsetHeight ? box.height / el.offsetHeight : 1; // zoom do canvas
      // A caixa do campo termina sempre no pé do chat; a folga só empurra o campo para cima dentro dela.
      const covered = !!bar && bar.top < box.bottom && bar.bottom > box.top && bar.left < box.right && bar.right > box.left;
      const next = covered ? Math.ceil((box.bottom - bar.top) / scale + 10) : 0;
      setLift((now) => (Math.abs(now - next) > 2 ? next : now));
    }, 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await window.o.chat.read(id).catch(() => null);
      if (!active) return;
      if (next) setSnap(next);
      timer = setTimeout(tick, next?.working ? 700 : 1500);
    };
    void tick();
    return () => { active = false; clearTimeout(timer); };
  }, [id]);

  // Rola junto com a conversa, a não ser que a pessoa tenha subido para ler algo antigo.
  const count = snap?.items.length ?? 0;
  const lastText = snap?.items[count - 1]?.kind === "assistant" ? (snap.items[count - 1] as { text: string }).text.length : 0;
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [count, lastText, snap?.working, snap?.choices.length]);

  const rows = useMemo(() => group(snap?.items ?? []), [snap]);
  const slash = useMemo(() => {
    if (!/^\/\S*$/.test(text)) return [];
    return (SLASH[kind] ?? []).filter((c) => c.name.startsWith(text.toLowerCase()));
  }, [text, kind]);

  const add = (list: Attachment[]) => setFiles((f) => [...f, ...list.filter((a) => !f.some((x) => x.path === a.path))]);
  const saveImage = async (blob: Blob, name: string) => {
    const path = await window.o.composer.saveImage(name, new Uint8Array(await blob.arrayBuffer()));
    add([{ path, name: path.split(/[\\/]/).pop() ?? name, preview: URL.createObjectURL(blob) }]);
  };
  const fromFiles = async (list: FileList) => {
    for (const file of [...list]) {
      const path = window.o.elements.pathForFile(file);
      if (path) add([{ path, name: file.name, preview: IMAGE.test(file.name) ? URL.createObjectURL(file) : undefined }]);
      else if (file.type.startsWith("image/")) await saveImage(file, file.name);
    }
  };
  const pasteImage = async () => {
    setMenu(null);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return void await saveImage(await item.getType(type), "print.png");
      }
      setError("A área de transferência não tem imagem.");
    } catch { setError("Não deu para ler a área de transferência."); }
  };

  const deliver = async (message: string, attached: string[] = []) => {
    setSending(true); setError("");
    const r = await window.o.composer.send([id], message, attached).catch((e) => ({ ok: false, errors: [String((e as Error).message ?? e)] }));
    setSending(false);
    if (!r.ok) setError(r.errors.join(" · "));
    stick.current = true;
    return r.ok;
  };
  const send = async (override?: string) => {
    const message = override ?? text;
    if (sending || (!message.trim() && !files.length)) return;
    if (await deliver(message, files.map((f) => f.path))) { setText(""); setFiles([]); }
  };
  const choose = async (choice: string) => {
    setError("");
    try { await window.o.composer.choose(id, choice.replace(/^\d+\.\s*/, "")); } catch (e) { setError((e as Error).message); }
  };

  const status = snap?.status;
  const lastAssistant = [...(snap?.items ?? [])].reverse().find((i) => i.kind === "assistant");
  const pendingQuestion = snap?.items.some((i) => i.kind === "question" && !i.answered);
  const openQuestion = [...(snap?.items ?? [])].reverse().find((i): i is Extract<ChatItem, { kind: "question" }> => i.kind === "question" && !i.answered && i.answerBy !== "text");
  const screenChoices = (snap?.choices ?? []).map((raw) => {
    const label = raw.replace(/^\d+\.\s*/, "").trim();
    // Saídas do próprio CLI para responder com texto livre.
    return { raw, label, other: /^(type something|chat about this|write-in|other|outra)/i.test(label) };
  });
  const merged = !!openQuestion && screenChoices.length > 0;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focusInput = () => textarea.current?.focus();

  return (
    <div className={`chat-view chat-theme-${theme} nodrag nowheel`}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void fromFiles(e.dataTransfer.files); }}>
      <div className="chat-backdrop" aria-hidden />
      <div className="chat-themes">
        <button className="chat-theme-current" title="Tema do chat" aria-expanded={menu === "theme"} onClick={() => setMenu(menu === "theme" ? null : "theme")}>
          <ThemeOrb theme={theme} size={16} />
        </button>
        {menu === "theme" && (
          <div className="chat-menu right" role="menu">
            <span className="chat-menu-title">Tema</span>
            {CHAT_THEMES.map((t) => (
              <button key={t.value} role="menuitemradio" aria-checked={t.value === theme} onClick={() => { onTheme(t.value); setMenu(null); }}>
                <ThemeOrb theme={t.value} size={16} /> {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {status === "unsupported" && <p className="chat-empty">Este programa não grava a conversa num formato que o Zênite leia. Use a aba Terminal.</p>}
        {status === "closed" && <p className="chat-empty">O terminal está fechado.</p>}
        {status === "waiting" && <p className="chat-empty">Mande a primeira mensagem: a conversa aparece aqui assim que o {agentName} começar a responder.</p>}
        {rows.map((row, i) => {
          if (row.kind === "tools") return <Actions key={row.id} tools={row.tools} />;
          const item = row.item;
          // O nome do agente abre cada sequência de respostas dele; as ações no meio não contam.
          const prev = rows.slice(0, i).reverse().find((r) => r.kind === "item");
          const opens = prev?.kind !== "item" || prev.item.kind !== "assistant";
          if (item.kind === "user") {
            return (
              <div key={item.id} className="chat-user">
                <div className="chat-bubble">{item.text}{item.images > 0 && <span className="chat-images">{item.images} {item.images === 1 ? "imagem" : "imagens"}</span>}</div>
              </div>
            );
          }
          if (item.kind === "tool") return null;
          if (item.kind === "note") return <div key={item.id} className="chat-note"><small>Zênite</small><span>{item.text}</span></div>;
          if (item.kind === "question") {
            const byText = item.answerBy === "text";
            // A pergunta aberta e o menu na tela são a mesma coisa: um cartão só, com os botões do menu.
            const menu = item === openQuestion && merged ? screenChoices : null;
            return (
              <div key={item.id} className={`chat-question${item.answered ? " answered" : ""}`}>
                {item.questions.map((q, qi) => (
                  <div key={qi}>
                    <p>{q.question}</p>
                    <div className="chat-options">
                      {qi === 0 && menu
                        ? menu.filter((c) => !c.other || c === menu.find((x) => x.other)).map((c) => c.other
                          ? <button key={c.raw} className="other" title={c.label} onClick={() => void choose(c.raw).then(focusInput)}>Outra resposta…</button>
                          : <button key={c.raw} onClick={() => void choose(c.raw)}>{c.label}</button>)
                        : q.options.map((o) => (
                          <button key={o} disabled={item.answered || (!byText && qi > 0) || sending}
                            onClick={() => void (byText ? deliver(item.questions.length > 1 ? `${q.question} ${o}` : o) : choose(o))}>{o}</button>
                        ))}
                    </div>
                  </div>
                ))}
                {!item.answered && !byText && item.questions.length > 1 && <small className="chat-hint">As próximas perguntas aparecem depois da primeira resposta.</small>}
                {!item.answered && byText && <small className="chat-hint">Clique numa opção ou escreva a resposta no campo abaixo.</small>}
              </div>
            );
          }
          return (
            <AssistantMessage key={item.id} text={item.text} who={opens ? agentName : undefined}>
              {item.options && item === lastAssistant && !snap?.working && (
                <div className="chat-options">
                  {item.options.map((o) => <button key={o.key} disabled={sending} onClick={() => void deliver(o.key)}><b>{o.key}</b> {o.label}</button>)}
                </div>
              )}
            </AssistantMessage>
          );
        })}
        {snap?.working && !pendingQuestion && <div className="chat-working"><span /><span /><span /> trabalhando</div>}
        {screenChoices.length > 0 && !merged && (
          <div className="chat-question screen">
            <p>Esperando sua escolha no terminal</p>
            <div className="chat-options">{screenChoices.map((c) => <button key={c.raw} onClick={() => void choose(c.raw)}>{c.raw}</button>)}</div>
          </div>
        )}
      </div>

      <div className="chat-compose" ref={compose} style={lift ? { paddingBottom: 14 + lift } : undefined}>
        {slash.length > 0 && (
          <div className="chat-menu slash" role="listbox">
            {slash.map((c, i) => (
              <button key={c.name} role="option" aria-selected={i === slashIndex} onMouseEnter={() => setSlashIndex(i)} onClick={() => void send(c.name)}>
                <code>{c.name}</code><span>{c.description}</span>
              </button>
            ))}
          </div>
        )}
        {menu === "add" && (
          <div className="chat-menu" role="menu">
            <button role="menuitem" onClick={async () => { setMenu(null); add((await window.o.composer.pick()).map((path) => ({ path, name: path.split(/[\\/]/).pop() ?? path }))); }}><Paperclip size={15} /> Arquivos e imagens</button>
            <button role="menuitem" onClick={() => void pasteImage()}><ClipboardPaste size={15} /> Colar imagem copiada</button>
          </div>
        )}
        {files.length > 0 && (
          <div className="chat-files">
            {files.map((f) => (
              <span key={f.path} className="chat-file" title={f.path}>
                {f.preview ? <img src={f.preview} alt="" /> : <FileText size={14} />}
                <span>{f.name}</span>
                <button aria-label={`Tirar ${f.name}`} onClick={() => setFiles((l) => l.filter((x) => x !== f))}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="chat-input">
          <button className="chat-plus" title="Anexar" aria-label="Anexar" aria-expanded={menu === "add"} onClick={() => setMenu(menu === "add" ? null : "add")}><Plus size={16} /></button>
          <textarea ref={textarea} value={text} rows={Math.min(6, Math.max(1, text.split("\n").length))} placeholder="Envie uma mensagem…  ( / para comandos )"
            onChange={(e) => { setText(e.target.value); setSlashIndex(0); }}
            onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void fromFiles(e.clipboardData.files); } }}
            onKeyDown={(e) => {
              if (slash.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setSlashIndex((i) => (i + (e.key === "ArrowDown" ? 1 : slash.length - 1)) % slash.length); return; }
              if (slash.length && e.key === "Tab") { e.preventDefault(); setText(slash[slashIndex].name); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(slash.length ? slash[Math.min(slashIndex, slash.length - 1)].name : undefined); }
            }} />
          <button className="chat-send" title="Enviar (Enter)" aria-label="Enviar" disabled={sending || (!text.trim() && !files.length)} onClick={() => void send()}><ArrowUp size={17} /></button>
        </div>
      </div>
    </div>
  );
}
