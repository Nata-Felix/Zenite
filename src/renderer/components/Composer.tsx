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
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
let lastTargets: string[] = [];

/**
 * Caixa de mensagem (Ctrl+K): texto e anexos vão direto para o CLI escolhido, como se a
 * pessoa tivesse colado no terminal. Não cria nada no canvas.
 */
export function Composer() {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ComposerTarget[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<"add" | "to" | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  useCommands((c) => {
    if (c !== "open-composer") return;
    if (open) { setOpen(false); return; }
    // O destino padrão é o terminal em uso: o do foco, o selecionado ou o último que recebeu.
    const focused = (document.activeElement as HTMLElement | null)?.closest?.(".react-flow__node")?.getAttribute("data-id")
      ?? document.querySelector(".react-flow__node.selected")?.getAttribute("data-id");
    void window.o.composer.targets().then((list) => {
      const running = list.filter((t) => t.running);
      setTargets(running);
      const keep = lastTargets.filter((id) => running.some((t) => t.id === id));
      const start = focused && running.some((t) => t.id === focused) ? [focused] : keep.length ? keep : running[0] ? [running[0].id] : [];
      setChosen(start);
      setError(running.length ? "" : "Nenhum terminal aberto neste canvas.");
      setOpen(true);
      setTimeout(() => input.current?.focus(), 30);
    });
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); if (menu) setMenu(null); else setOpen(false); } };
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
    setText(""); setFiles([]); setOpen(false);
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
