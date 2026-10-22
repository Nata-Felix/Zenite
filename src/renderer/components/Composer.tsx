import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, ClipboardPaste, FileText, Mic, Paperclip, Plus, Sun, TerminalSquare, X } from "lucide-react";
import type { ComposerTarget } from "../../shared/types";
import { AntigravityIcon, ClaudeIcon, CodexIcon, GrokIcon, PowerShellIcon } from "./BrandIcon";
import { useCommands } from "../commands";
import "./Composer.css";

const ICONS = { codex: CodexIcon, claude: ClaudeIcon, antigravity: AntigravityIcon, grok: GrokIcon, shell: PowerShellIcon } as const;
function AgentIcon({ agent, size = 16 }: { agent: ComposerTarget["agent"]; size?: number }) {
  const Icon = agent === "other" ? null : ICONS[agent];
  return Icon ? <Icon size={size} /> : <TerminalSquare size={size} />;
}

interface Attachment { path: string; name: string; preview?: string }
interface Waiting { id: string; reason: "done" | "request"; message?: string; screen: string; choices: string[] }
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
let lastTargets: string[] = [];

/**
 * Caixa de mensagem (Ctrl+K): texto e anexos vão direto para o CLI escolhido, como se a
 * pessoa tivesse colado no terminal. Não cria nada no canvas.
 */
export function Composer({ onJump }: { onJump: (terminalId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ComposerTarget[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<"add" | "to" | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const state = useRef({ open, text });
  const choosing = useRef(false);
  state.current = { open, text };

  // Abre a caixa para `forced` (agente esperando) ou para o terminal em uso.
  const show = async (forced?: string, focus = true) => {
    const focused = forced ?? (document.activeElement as HTMLElement | null)?.closest?.(".react-flow__node")?.getAttribute("data-id")
      ?? document.querySelector(".react-flow__node.selected")?.getAttribute("data-id");
    const running = (await window.o.composer.targets()).filter((t) => t.running);
    setTargets(running);
    const keep = lastTargets.filter((id) => running.some((t) => t.id === id));
    setChosen(focused && running.some((t) => t.id === focused) ? [focused] : keep.length ? keep : running[0] ? [running[0].id] : []);
    setError(running.length ? "" : "Nenhum terminal aberto neste canvas.");
    setOpen(true);
    if (focus) setTimeout(() => input.current?.focus(), 30);
  };
  const loadContext = async (id: string, reason: Waiting["reason"], message?: string) => {
    const ctx = await window.o.composer.context(id).catch(() => ({ screen: "", choices: [] }));
    setWaiting({ id, reason, message, ...ctx });
  };

  useCommands((c) => {
    if (c !== "open-composer") return;
    if (open) { setOpen(false); return; }
    setWaiting(null);
    void show();
  });

  // Agente que passa a esperar você: a caixa abre sozinha, já com ele de destino (Configurações → Agentes).
  useEffect(() => {
    let known = new Set<string>();
    let lastKey = 0;
    const onKey = () => { lastKey = Date.now(); };
    window.addEventListener("keydown", onKey, true);
    void window.o.attention.get().then((all) => { known = new Set(Object.keys(all)); });
    const off = window.o.attention.onChanged(async (all) => {
      const ids = Object.keys(all);
      const added = ids.filter((id) => !known.has(id));
      known = new Set(ids);
      // Quem saiu da espera por outro caminho (foi atendido no terminal) fecha a caixa aberta para ele.
      // Durante uma escolha pela caixa as setas já contam como resposta: não fecha, para mostrar o erro.
      if (!choosing.current) setWaiting((w) => {
        if (w && !ids.includes(w.id) && state.current.open && !state.current.text.trim()) setOpen(false);
        return w && ids.includes(w.id) ? w : null;
      });
      const id = added[added.length - 1];
      if (!id || state.current.text.trim()) return;
      if ((await window.o.workspaces.list()).settings?.composerOnWait === false) return;
      const info = all[id];
      await show(id, Date.now() - lastKey > 1500); // não rouba o foco de quem está digitando
      await loadContext(id, info.reason, info.message);
    });
    return () => { off(); window.removeEventListener("keydown", onKey, true); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); if (menu) setMenu(null); else { setOpen(false); setWaiting(null); } } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, menu]);

  if (!open) return null;

  const add = (list: Attachment[]) => setFiles((f) => [...f, ...list.filter((a) => !f.some((x) => x.path === a.path))]);
  const pick = async () => { setMenu(null); add((await window.o.composer.pick()).map((path) => ({ path, name: path.split(/[\\/]/).pop() ?? path }))); };
  const saveImage = async (blob: Blob, name: string) => {
    const path = await window.o.composer.saveImage(name, new Uint8Array(await blob.arrayBuffer()));
    add([{ path, name: path.split(/[\\/]/).pop() ?? name, preview: URL.createObjectURL(blob) }]);
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
  const fromFiles = async (list: FileList) => {
    for (const file of [...list]) {
      const path = window.o.elements.pathForFile(file);
      if (path) add([{ path, name: file.name, preview: IMAGE.test(file.name) ? URL.createObjectURL(file) : undefined }]);
      else if (file.type.startsWith("image/")) await saveImage(file, file.name);
    }
  };
  const send = async () => {
    if (sending || !chosen.length || (!text.trim() && !files.length)) return;
    setSending(true); setError("");
    const r = await window.o.composer.send(chosen, text, files.map((f) => f.path));
    setSending(false);
    if (!r.ok) return setError(r.errors.join(" · "));
    lastTargets = chosen;
    setText(""); setFiles([]); setOpen(false); setWaiting(null);
  };
  const toggle = (id: string) => setChosen((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  const first = targets.find((t) => t.id === chosen[0]);

  return (
    <div className="composer-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="composer" role="dialog" aria-label="Mensagem para os agentes"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void fromFiles(e.dataTransfer.files); }}>
        {menu === "add" && (
          <div className="composer-menu" role="menu">
            <span className="composer-menu-title">Adicionar</span>
            <button role="menuitem" onClick={() => void pick()}><Paperclip size={15} /> Arquivos e imagens</button>
            <button role="menuitem" onClick={() => void pasteImage()}><ClipboardPaste size={15} /> Colar imagem copiada</button>
          </div>
        )}
        {menu === "to" && (
          <div className="composer-menu right" role="menu">
            <span className="composer-menu-title">Enviar para</span>
            {targets.map((t) => (
              <button key={t.id} role="menuitemcheckbox" aria-checked={chosen.includes(t.id)} onClick={() => toggle(t.id)}>
                <AgentIcon agent={t.agent} />
                <span className="composer-target">{t.title}{t.sun && <Sun size={12} className="composer-sun" />}
                  {t.status && <small>{t.status.state}{t.status.note ? ` · ${t.status.note}` : ""}</small>}</span>
                {chosen.includes(t.id) && <Check size={15} />}
              </button>
            ))}
          </div>
        )}
        {waiting && (() => {
          const who = targets.find((t) => t.id === waiting.id);
          return (
            <div className="composer-waiting">
              <header>
                {who && <AgentIcon agent={who.agent} />}
                <strong>{who?.title ?? "Agente"}</strong>
                <span>{waiting.reason === "request" ? "pede sua atenção" : "está esperando você"}</span>
                <button className="composer-link" onClick={() => { const id = waiting.id; setOpen(false); setWaiting(null); onJump(id); }}>Ver no canvas</button>
              </header>
              {waiting.message && <p className="composer-request">{waiting.message}</p>}
              {waiting.screen && <pre className="composer-screen">{waiting.screen}</pre>}
              {waiting.choices.length > 0 && (
                <div className="composer-choices">
                  {waiting.choices.map((c) => (
                    <button key={c} onClick={async () => {
                      choosing.current = true;
                      try { await window.o.composer.choose(waiting.id, c.replace(/^\d+\.\s*/, "")); setOpen(false); setWaiting(null); }
                      catch (e) { setError((e as Error).message); }
                      finally { choosing.current = false; }
                    }}>{c}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {files.length > 0 && (
          <div className="composer-files">
            {files.map((f) => (
              <span key={f.path} className="composer-file" title={f.path}>
                {f.preview ? <img src={f.preview} alt="" /> : <FileText size={16} />}
                <span>{f.name}</span>
                <button aria-label={`Tirar ${f.name}`} onClick={() => setFiles((l) => l.filter((x) => x !== f))}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea ref={input} value={text} rows={Math.min(8, Math.max(2, text.split("\n").length))} placeholder={first ? `Peça qualquer coisa ao ${first.title}…` : "Peça qualquer coisa…"}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void fromFiles(e.clipboardData.files); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        {error && <p className="composer-error" role="alert">{error}</p>}
        <footer>
          <button className="composer-round" title="Adicionar arquivos e imagens" aria-label="Adicionar" aria-expanded={menu === "add"} onClick={() => setMenu(menu === "add" ? null : "add")}><Plus size={18} /></button>
          <span className="composer-hint">Enter envia · Shift+Enter quebra linha · arraste arquivos aqui</span>
          <button className="composer-to" aria-expanded={menu === "to"} onClick={() => setMenu(menu === "to" ? null : "to")} title="Escolher para quem enviar">
            {first ? <AgentIcon agent={first.agent} /> : <TerminalSquare size={16} />}
            <span>{first ? first.title : "Escolher"}{chosen.length > 1 ? ` +${chosen.length - 1}` : ""}</span>
            <ChevronDown size={14} />
          </button>
          <button className="composer-icon" title="Falar (ditado do Windows)" aria-label="Falar" onClick={() => { input.current?.focus(); void window.o.composer.dictate(); }}><Mic size={17} /></button>
          <button className="composer-send" title="Enviar (Enter)" aria-label="Enviar" disabled={sending || !chosen.length || (!text.trim() && !files.length)} onClick={() => void send()}><ArrowUp size={18} /></button>
        </footer>
      </section>
    </div>
  );
}
