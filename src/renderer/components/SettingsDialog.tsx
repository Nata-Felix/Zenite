import { useEffect, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Bell, Bot, Database, Info, Keyboard, LayoutGrid, Palette, Settings2, SquareTerminal } from "lucide-react";
import { DataTab } from "./settings/DataTab";
import { AboutTab } from "./settings/AboutTab";
import { TerminalTab } from "./settings/TerminalTab";
import { ShortcutsTab } from "./settings/ShortcutsTab";
import type { AppSettings, WorkspaceIndex } from "../../shared/types";
import { readPref, writePref } from "../prefs";
import { GeneralTab, NotificationsTab, AgentsTab } from "./settings/tabs";
import { CanvasTab } from "./settings/CanvasTab";
import { PersonalizationTab } from "./settings/PersonalizationTab";

export interface TabProps {
  settings: AppSettings;
  update(changes: AppSettings): Promise<void>;
}

interface Tab {
  id: string;
  label: string;
  icon: typeof Bell;
  view: ComponentType<TabProps>;
}

const TABS: Tab[] = [
  { id: "geral", label: "Geral", icon: Settings2, view: GeneralTab },
  { id: "personalizacao", label: "Personalização", icon: Palette, view: PersonalizationTab },
  { id: "canvas", label: "Canvas", icon: LayoutGrid, view: CanvasTab },
  { id: "terminal", label: "Terminal", icon: SquareTerminal, view: TerminalTab },
  { id: "agentes", label: "Agentes", icon: Bot, view: AgentsTab },
  { id: "notificacoes", label: "Notificações", icon: Bell, view: NotificationsTab },
  { id: "atalhos", label: "Atalhos", icon: Keyboard, view: ShortcutsTab },
  { id: "dados", label: "Dados", icon: Database, view: DataTab },
  { id: "sobre", label: "Sobre", icon: Info, view: AboutTab },
];

interface Props {
  index: WorkspaceIndex;
  onIndex(index: WorkspaceIndex): void;
  onClose(): void;
}

export function SettingsDialog({ index, onIndex, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointer: number; x: number; y: number; origin: { x: number; y: number }; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    const rect = dialog.current?.getBoundingClientRect(); if (!rect) return;
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, origin: offset,
      minX: offset.x + 16 - rect.left, maxX: offset.x + window.innerWidth - 16 - rect.right,
      minY: offset.y + 16 - rect.top, maxY: offset.y + window.innerHeight - 16 - rect.bottom };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current; if (!start || start.pointer !== event.pointerId) return;
    setOffset({ x: clamp(start.origin.x + event.clientX - start.x, start.minX, start.maxX), y: clamp(start.origin.y + event.clientY - start.y, start.minY, start.maxY) });
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    // Ao reduzir a janela, traz o diálogo de volta para a área visível.
    const fit = () => {
      const rect = dialog.current?.getBoundingClientRect(); if (!rect) return;
      setOffset((at) => ({ x: at.x + Math.min(Math.max(0, 16 - rect.left), window.innerWidth - 16 - rect.right), y: at.y + Math.min(Math.max(0, 16 - rect.top), window.innerHeight - 16 - rect.bottom) }));
      drag.current = null;
    };
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const tabs = TABS;
  const [tab, setTab] = useState(() => { const saved = readPref<string>("settingsTab", "geral"); return saved === "tela" ? "personalizacao" : saved; });
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  useEffect(() => writePref("settingsTab", current.id), [current.id]);
  const update = async (changes: AppSettings) => onIndex(await window.o.workspaces.setSettings(changes));
  const View = current.view;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div ref={dialog} className="dialog settings-dialog" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="settings-head" title="Arraste para mover a janela" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; }}>
          <h2>Configurações</h2>
          <button className="ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-tabs" aria-label="Seções">
            {tabs.map((t) => (
              <button key={t.id} className={t.id === current.id ? "on" : ""} aria-current={t.id === current.id ? "page" : undefined} onClick={() => setTab(t.id)}>
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </nav>
          <div className="settings-page">
            <View settings={index.settings ?? {}} update={update} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
