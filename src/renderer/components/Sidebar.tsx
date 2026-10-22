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
        {index.workspaces.map((w) => (
          <li key={w.id} className={w.id === index.activeId ? "active" : ""}>
            <button className="workspace-item" title={`${w.name}${w.dir ? `\n${w.dir}` : ""}`} onClick={() => activate(w)}>
              <span className="workspace-avatar" style={{ "--hue": hueFor(w.id) } as React.CSSProperties}>
                {initials(w.name)}
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

function initials(name: string): string {
  const words = name.trim().split(/[\s\-_]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Cor estável por workspace, derivada do id. */
function hueFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
