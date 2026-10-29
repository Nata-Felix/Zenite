import { useState } from "react";
import { FileDown, FileUp, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Settings, Sun, Trash2 } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import { useTheme, type ThemePref } from "../theme";
import type { GalaxyArchiveInfo, WorkspaceIndex, WorkspaceMeta } from "../../shared/types";
import { GalaxyArchiveDialog } from "./GalaxyArchiveDialog";
import { T } from "../vocab";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { confirmDialog } from "./AppDialog";
import { plural } from "../../shared/plural";
// Versão simplificada do ícone: legível no tamanho pequeno da barra.
import iconUrl from "../../../build/icon-small.svg";
import { useAttentionAll } from "../attentionBus";
import { useCommands } from "../commands";

interface Props {
  index: WorkspaceIndex;
  collapsed: boolean;
  onToggle(): void;
  onChange(index: WorkspaceIndex): void;
}

type DialogState = { mode: "create" } | { mode: "edit"; workspace: WorkspaceMeta } | null;

export function Sidebar({ index, collapsed, onToggle, onChange }: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [settings, setSettings] = useState(false);
  const [archive, setArchive] = useState<{ mode: "export"; workspaceId: string; name: string } | { mode: "import"; ticket: string; info: GalaxyArchiveInfo } | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [picking, setPicking] = useState(false);
  const pickArchive = async () => {
    setPicking(true); setArchiveError("");
    try { const result = await window.o.galaxyArchive.pick(); if (result.ok) setArchive({ mode: "import", ticket: result.ticket, info: result.info }); else if (!result.canceled) setArchiveError(result.error ?? "Não foi possível ler o pacote."); }
    catch (e) { setArchiveError((e as Error).message); }
    finally { setPicking(false); }
  };
  useCommands((c) => {
    if (c === "open-settings") setSettings(true);
    if (c === "import-galaxy") void pickArchive();
    if (c === "export-galaxy") { const w = index.workspaces.find(w => w.id === index.activeId); if (w) setArchive({ mode: "export", workspaceId: w.id, name: w.name }); }
  });
  const { pref, setPref } = useTheme();
  const ws = window.o.workspaces;

  const remove = async (w: WorkspaceMeta) => {
    if (!await confirmDialog({ title: `Remover a galáxia "${w.name}"?`, message: "Os terminais dela (e dos universos) serão encerrados. A pasta do projeto não é apagada e as branches dos universos continuam no git.", cancel: "Cancelar", ok: "Remover galáxia", danger: true })) return;
    onChange(await ws.remove(w.id));
  };
  const attention = useAttentionAll();
  const waitingIn = (wsId: string) => Object.values(attention).filter((a) => a.workspaceId === wsId).length;
  const activate = async (w: WorkspaceMeta) => onChange(await ws.setActive(w.id));

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <span className="brand">
            <img src={iconUrl} alt="" width={22} height={22} />
            Zênite
          </span>
        )}
        <button className="icon-button" title={collapsed ? "Expandir (Ctrl+Shift+B)" : "Recolher (Ctrl+Shift+B)"} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="sidebar-section">
          <span>{T.galaxies}</span>
          <button className="icon-button" title={T.newGalaxy} onClick={() => setDialog({ mode: "create" })}>
            <Plus size={15} />
          </button>
        </div>
      )}

      <ul className="workspace-list">
        {index.workspaces.map((w, i) => (
          <li key={w.id} className={w.id === index.activeId ? "active" : ""}>
            <button className="workspace-item" title={`${w.name}${w.dir ? `\n${w.dir}` : ""}`} onClick={() => activate(w)}>
              <span className="workspace-avatar galaxy" style={{ "--hue": hueFor(i), "--spin": `${spinFor(w.id)}deg` } as React.CSSProperties}>
                <svg className="galaxy-arms" viewBox="-13 -13 26 26" aria-hidden="true">
                  {[0, 180].map((r) => (
                    <g key={r} transform={`rotate(${r})`}>
                      <path className="arm-glow" d={ARM} />
                      <path className="arm" d={ARM} />
                    </g>
                  ))}
                  <circle className="core" r="2.6" />
                  {STARS.map(([x, y], k) => <circle key={k} className="star" cx={x} cy={y} r="0.45" />)}
                </svg>
                <span className="galaxy-letter">{initial(w.name)}</span>
                {waitingIn(w.id) > 0 && (
                  <span className="attention-count" title={plural(waitingIn(w.id), "terminal esperando você", "terminais esperando você")}>
                    {waitingIn(w.id)}
                  </span>
                )}
              </span>
              {!collapsed && <span className="workspace-name">{w.name}</span>}
              {!collapsed && (w.universes?.length ?? 0) > 0 && (
                <span className="universe-count" title={plural(w.universes!.length, "universo paralelo", "universos paralelos")}>
                  {w.universes!.length}
                </span>
              )}
            </button>
            {!collapsed && (
              <span className="workspace-actions">
                <button className="icon-button" title={`Exportar galáxia ${w.name}`} aria-label={`Exportar galáxia ${w.name}`} onClick={() => setArchive({ mode: "export", workspaceId: w.id, name: w.name })}><FileDown size={13} /></button>
                <button className="icon-button" title="Editar" onClick={() => setDialog({ mode: "edit", workspace: w })}>
                  <Pencil size={13} />
                </button>
                {index.workspaces.length > 1 && (
                  <button className="icon-button danger" title="Remover" onClick={() => remove(w)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
        {collapsed && (
          <li>
            <button className="workspace-item" title={T.newGalaxy} onClick={() => setDialog({ mode: "create" })}>
              <span className="workspace-avatar add">
                <Plus size={14} />
              </span>
            </button>
          </li>
        )}
      </ul>

      <div className="sidebar-footer">
        <button className="icon-button" title="Importar galáxia…" aria-label="Importar galáxia" disabled={picking} onClick={() => void pickArchive()}><FileUp size={15} /></button>
        <button className="icon-button" title="Configurações" onClick={() => setSettings(true)}>
          <Settings size={15} />
        </button>
        {collapsed ? (
          <button className="icon-button" title="Trocar tema" onClick={() => setPref(NEXT_THEME[pref])}>
            {THEME_ICON[pref]}
          </button>
        ) : (
          <div className="theme-switch" role="radiogroup" aria-label="Tema">
            {(["system", "light", "dark"] as ThemePref[]).map((p) => (
              <button key={p} role="radio" aria-checked={pref === p} className={pref === p ? "on" : ""} title={THEME_LABEL[p]} onClick={() => setPref(p)}>
                {THEME_ICON[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {settings && <SettingsDialog index={index} onIndex={onChange} onClose={() => setSettings(false)} />}
      {archiveError && <div className="dialog-backdrop" onMouseDown={() => setArchiveError("")}><div className="dialog" role="alertdialog" aria-label="Erro ao importar galáxia"><p className="dialog-error">{archiveError}</p><button autoFocus className="ghost" onClick={() => setArchiveError("")}>Fechar</button></div></div>}
      {archive && <GalaxyArchiveDialog {...archive} onClose={() => setArchive(null)} onImported={onChange} />}
      {dialog && (
        <WorkspaceDialog
          initial={dialog.mode === "edit" ? dialog.workspace : undefined}
          onCancel={() => setDialog(null)}
          onSubmit={async (name, dir, copyPatterns, agentCommits) => {
            let next = dialog.mode === "edit" ? await ws.update(dialog.workspace.id, { name, dir, copyPatterns, agentCommits }) : await ws.create(name, dir);
            if (dialog.mode === "create") next = await ws.update(next.activeId, { copyPatterns, agentCommits });
            setDialog(null);
            onChange(next);
          }}
        />
      )}
    </aside>
  );
}

const THEME_LABEL: Record<ThemePref, string> = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };
const THEME_ICON: Record<ThemePref, React.ReactNode> = { system: <Monitor size={14} />, light: <Sun size={14} />, dark: <Moon size={14} /> };
const NEXT_THEME: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };

/** Primeira letra do nome, pulando numeração e pontuação ("01 · Canvas vivo" → "C"). */
function initial(name: string): string {
  const ch = name.match(/\p{L}/u)?.[0] ?? name.match(/\p{N}/u)?.[0] ?? "?";
  return ch.toLocaleUpperCase();
}

/** Cor pela posição na lista: o ângulo áureo espalha os tons, então vizinhas nunca ficam parecidas. */
function hueFor(position: number): number {
  return Math.round((position * 137.508 + 210) % 360);
}

/** Giro estável por galáxia, derivado do id, para os braços não ficarem todos iguais. */
function spinFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Braço espiral (logarítmica aproximada) do centro até a borda. */
const ARM = Array.from({ length: 25 }, (_, i) => {
  const t = (i / 24) * 1.7 * Math.PI;
  const r = 1.4 + 10 * (i / 24) ** 1.2;
  return `${i ? "L" : "M"}${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`;
}).join("");

const STARS: [number, number][] = [[-8, -6], [7, -8], [9, 5], [-6, 9], [-10, 2], [3, 10]];
