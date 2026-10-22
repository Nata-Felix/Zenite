import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ClipboardPaste, Copy, FileDown, FileUp, Maximize, Monitor, Moon, PanelLeft, Plus, RotateCcw, Scissors, Search, Settings, SquareTerminal, Sun, Workflow, Map as MapIcon, type LucideIcon } from "lucide-react";
import { ParallelUniverseIcon } from "./ParallelUniverseIcon";
import type { SearchItem, WorkspaceIndex } from "../../shared/types";
import { ELEMENT_STYLE } from "../nodes";
import { runCommand, type Command } from "../commands";
import { setThemePref } from "../theme";

/** Um resultado: algo para ir até ou um comando para rodar. */
interface Entry {
  key: string;
  label: string;
  detail?: string;
  icon: LucideIcon;
  color?: string;
  group: "Ir para" | "Galáxias" | "Comandos";
  run(): void;
}

interface Props {
  index: WorkspaceIndex;
  /** Vai até um terminal/elemento (troca de galáxia/universo se precisar). */
  onGoTo(item: { id?: string; workspaceId: string; universeId: string | null }): void;
  onClose(): void;
}

/** Sem acento e minúsculo, para "configuracoes" achar "Configurações". */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Pontua o quanto `text` combina com a busca: começo > palavra > trecho > letras em ordem. */
export function matchScore(text: string, query: string): number {
  const t = norm(text);
  const q = norm(query.trim());
  if (!q) return 1;
  if (t.startsWith(q)) return 4;
  if (t.includes(` ${q}`)) return 3;
  if (t.includes(q)) return 2;
  let i = 0;
  for (const c of t) if (c === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export function CommandPalette({ index, onGoTo, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => void window.o.search.items().then(setItems), []);

  const entries = useMemo<Entry[]>(() => {
    const cmd = (key: string, label: string, icon: LucideIcon, command: Command, detail?: string): Entry => ({
      key,
      label,
      detail,
      icon,
      group: "Comandos",
      run: () => runCommand(command),
    });
    const goTo: Entry[] = items.map((it) => {
      const style = it.kind === "terminal" ? null : ELEMENT_STYLE[it.kind];
      return {
        key: `n-${it.id}`,
        label: it.title || "(sem nome)",
        detail: `${style?.label ?? "Terminal"} · ${it.place}`,
        icon: style?.icon ?? SquareTerminal,
        color: style?.color,
        group: "Ir para",
        run: () => onGoTo({ id: it.id, workspaceId: it.workspaceId, universeId: it.universeId }),
      };
    });
    const galaxies: Entry[] = index.workspaces.flatMap((w) => [
      { key: `g-${w.id}`, label: w.name, detail: "Galáxia · Origem", icon: Sun, group: "Galáxias" as const, run: () => onGoTo({ workspaceId: w.id, universeId: null }) },
      ...(w.universes ?? []).map((u) => ({
        key: `u-${u.id}`,
        label: `${w.name} · ${u.name}`,
        detail: "Universo paralelo",
        icon: ParallelUniverseIcon,
        group: "Galáxias" as const,
        run: () => onGoTo({ workspaceId: w.id, universeId: u.id }),
      })),
    ]);
    const commands: Entry[] = [
      cmd("c-term", "Novo terminal", Plus, "new-terminal", "Ctrl+Shift+T"),
      ...(["note", "table", "web", "file", "folder", "image", "video", "skill", "service", "blackhole"] as const).map((k) => cmd(`c-${k}`, ELEMENT_STYLE[k].create, ELEMENT_STYLE[k].icon, `new-element:${k}`)),
      cmd("c-next", "Ir para o próximo que precisa de você", Bell, "next-attention", "Ctrl+Shift+A"),
      cmd("c-fit", "Enquadrar tudo", Maximize, "fit-view"),
      cmd("c-auto-layout", "Organizar automaticamente", Workflow, "auto-layout", "Seleção ou canvas · Ctrl+Alt+O"),
      cmd("c-auto-layout-all", "Organizar todo o canvas", Workflow, "auto-layout-all"),
      cmd("c-undo-layout", "Desfazer organização automática", RotateCcw, "undo-layout"),
      cmd("c-select-all", "Selecionar todo o canvas", Maximize, "select-all", "Ctrl+A"),
      cmd("c-copy", "Copiar seleção", Copy, "copy-selection", "Ctrl+C"),
      cmd("c-cut", "Recortar seleção", Scissors, "cut-selection", "Ctrl+X"),
      cmd("c-paste", "Colar no canvas", ClipboardPaste, "paste-selection", "Ctrl+V"),
      cmd("c-export", "Exportar canvas…", FileDown, "export-canvas", "Escolha o que vai no arquivo .zenite"),
      cmd("c-import", "Importar canvas…", FileUp, "import-canvas", "Põe os itens de um .zenite neste canvas"),
      cmd("c-export-galaxy", "Exportar galáxia…", FileDown, "export-galaxy", "Origem e universos; conteúdos, mídia e .env opcionais"),
      cmd("c-import-galaxy", "Importar galáxia…", FileUp, "import-galaxy", "Cria uma nova galáxia a partir de um pacote"),
      cmd("c-minimap", "Mostrar ou esconder o minimapa", MapIcon, "toggle-minimap"),
      cmd("c-sidebar", "Recolher ou expandir a barra lateral", PanelLeft, "toggle-sidebar", "Ctrl+Shift+B"),
      cmd("c-summary", "Visão resumida (cartões e ligações)", Workflow, "toggle-summary", "Alt+S"),
      cmd("c-zen", "Modo Zen (só o canvas)", PanelLeft, "toggle-zen", "Alt+Z · Esc no canvas sai"),
      cmd("c-settings", "Abrir configurações", Settings, "open-settings"),
      { key: "t-light", label: "Tema claro", icon: Sun, group: "Comandos", run: () => setThemePref("light") },
      { key: "t-dark", label: "Tema escuro", icon: Moon, group: "Comandos", run: () => setThemePref("dark") },
      { key: "t-system", label: "Tema do sistema", icon: Monitor, group: "Comandos", run: () => setThemePref("system") },
    ];
    return [...goTo, ...galaxies, ...commands];
  }, [items, index, onGoTo]);

  const results = useMemo(() => {
    const scored = entries.map((e) => ({ e, s: Math.max(matchScore(e.label, query), matchScore(e.detail ?? "", query) - 1) })).filter((x) => x.s > 0);
    // Com busca vazia, a ordem natural (ir para, galáxias, comandos); com busca, os melhores primeiro.
    if (query.trim()) scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 60).map((x) => x.e);
  }, [entries, query]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    e.run();
  };

  return createPortal(
    <div className="dialog-backdrop palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Busca rápida" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            placeholder="Buscar terminal, nota, galáxia ou comando…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") choose(results[cursor]);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul ref={list} className="palette-list">
          {results.length === 0 && <li className="palette-empty">Nada encontrado.</li>}
          {results.map((r, i) => (
            <li key={r.key}>
              {(i === 0 || results[i - 1].group !== r.group) && <span className="palette-group">{r.group}</span>}
              <button data-i={i} className={i === cursor ? "on" : ""} onMouseMove={() => setCursor(i)} onClick={() => choose(r)}>
                <span className="palette-icon" style={r.color ? ({ color: r.color } as React.CSSProperties) : undefined}>
                  <r.icon size={15} />
                </span>
                <span className="truncate">{r.label}</span>
                {r.detail && <small className="truncate">{r.detail}</small>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
