import { useCallback, useEffect, useRef, useState } from "react";
import type { InstallProgress, WorkspaceIndex } from "../shared/types";
import { Canvas } from "./Canvas";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Sidebar } from "./components/Sidebar";
import { UpdateDialog } from "./components/UpdateDialog";
import { CloseDialog } from "./components/CloseDialog";
import { AppDialog, confirmDialog } from "./components/AppDialog";
import { InstallProgressBar } from "./components/InstallProgressBar";
import { AwayPanel } from "./components/AwayPanel";
import { Composer } from "./components/Composer";
import { LinkDialog } from "./components/LinkDialog";
import { readPref, writePref } from "./prefs";
import { attentionQueue, badgeImage, requestFocus, useAttentionAll } from "./attentionBus";
import { runCommand, useCommands } from "./commands";
import { belongsToTerminal, comboOf, isCapturingShortcut, keysFor, SHORTCUTS, validCombo } from "./shortcuts";
import { CommandPalette } from "./components/CommandPalette";

export function App() {
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [collapsed, setCollapsed] = useState(() => readPref("sidebarCollapsed", false));

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      writePref("sidebarCollapsed", !c);
      return !c;
    });
  }, []);

  const [gitMissing, setGitMissing] = useState(false);
  const [gitInstall, setGitInstall] = useState<InstallProgress | null>(null);
  const [gitError, setGitError] = useState("");
  useEffect(() => window.o.git.onInstallProgress(setGitInstall), []);
  // Instala direto pelo WinGet; o site só volta a aparecer se a instalação falhar.
  const installGit = async () => {
    if (!await confirmDialog({ title: "Instalar o Git?", message: "O Zênite vai instalar o Git para Windows pelo WinGet (pacote Git.Git, cerca de 70 MB). A instalação aceita os termos do pacote e da fonte WinGet e pode pedir autorização do Windows.", cancel: "Agora não", ok: "Instalar Git" })) return;
    setGitError("");
    setGitInstall({ phase: "preparando" });
    try {
      const result = await window.o.git.install();
      if (result.ok) setGitMissing(false);
      else setGitError(result.error ?? "Não foi possível instalar o Git.");
    } catch (e) { setGitError(String(e)); } finally { setGitInstall(null); }
  };

  useEffect(() => {
    window.o.workspaces.list().then(setIndex);
    window.o.git.version().then((v) => setGitMissing(!v));
    return window.o.workspaces.onChanged(setIndex);
  }, []);

  // Todos os atalhos configuráveis passam por aqui (ver shortcuts.ts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isCapturingShortcut()) return;
      // AltGr (teclado ABNT2 etc.) chega como Ctrl+Alt: é digitação, não atalho.
      if (e.getModifierState?.("AltGraph")) return;
      const combo = comboOf(e);
      if (!validCombo(combo)) return;
      const s = SHORTCUTS.find((x) => keysFor(x.id) === combo);
      if (!s) return;
      if (["select-all", "copy-selection", "cut-selection", "paste-selection", "auto-layout", "auto-layout-all", "auto-layout-selection", "undo-layout"].includes(s.command) && document.querySelector(".dialog-backdrop, [role='dialog'], dialog[open]")) return;
      const target = e.target as HTMLElement | null;
      const inTerminal = !!target?.closest?.(".terminal-host");
      const typing = !!target?.closest?.("input, textarea, select, [contenteditable='true']");
      // Ctrl + letra é do shell / do campo de texto.
      if ((inTerminal || typing) && belongsToTerminal(combo) && !s.everywhere) return;
      e.preventDefault();
      e.stopPropagation();
      runCommand(s.command);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Avisos: título da janela, selo da barra de tarefas e ir até quem precisa de você.
  const attention = useAttentionAll();
  const waiting = Object.keys(attention).length;
  useEffect(() => {
    document.title = waiting ? `(${waiting}) Zênite` : "Zênite";
    window.o.attention.badge(waiting, badgeImage(waiting));
  }, [waiting]);

  const indexRef = useRef(index);
  indexRef.current = index;
  const attentionRef = useRef(attention);
  attentionRef.current = attention;
  /** Vai até uma galáxia/universo e, se pedido, enquadra e foca um elemento dele. */
  const goTo = useCallback(async (t: { id?: string; workspaceId?: string; universeId?: string | null }) => {
    let idx = indexRef.current;
    if (t.workspaceId && idx) {
      if (idx.activeId !== t.workspaceId) idx = await window.o.workspaces.setActive(t.workspaceId);
      const ws = idx.workspaces.find((w) => w.id === t.workspaceId);
      const target = t.universeId ?? null;
      if (ws && (ws.activeUniverse ?? null) !== target) idx = await window.o.universes.setActive(ws.id, target);
      setIndex(idx);
    }
    if (t.id) requestFocus(t.id);
  }, []);
  const jump = useCallback((id: string) => goTo({ id, ...attentionRef.current[id] }), [goTo]);
  const nextAttention = useCallback(() => {
    const next = attentionQueue(attentionRef.current)[0];
    if (next) void jump(next[0]);
    return !!next;
  }, [jump]);
  const [palette, setPalette] = useState(false);
  // Modo Zen: só o canvas, sem barras nem menus; tudo por atalhos. Sai com Esc com o foco no canvas
  // (num terminal, o Esc é do terminal: clique no canvas antes).
  const [zen, setZen] = useState(false);
  const [zenHint, setZenHint] = useState(false);
  useEffect(() => {
    if (!zen) return;
    setZenHint(true);
    const hide = setTimeout(() => setZenHint(false), 3500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".terminal-host, input, textarea, select, [contenteditable='true']")) return;
      setZen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [zen]);
  useCommands((c) => {
    if (c === "toggle-zen") setZen((z) => !z);
    else if (c === "toggle-sidebar") toggleSidebar();
    else if (c === "next-attention") nextAttention();
    else if (c === "open-palette") setPalette(true);
  });
  useEffect(() => window.o.attention.onJump((id) => void jump(id)), [jump]);

  if (!index) return null;
  const active = index.workspaces.find((w) => w.id === index.activeId) ?? index.workspaces[0];
  const universe = active.universes?.find((u) => u.id === active.activeUniverse);

  return (
    <div className={`app${zen ? " zen" : ""}`}>
      {zen && zenHint && <div className="zen-hint" role="status">Modo Zen · clique no canvas e aperte Esc para sair</div>}
      {gitMissing && (
        <div className="git-missing">
          <strong>O git não está instalado.</strong> Sem ele não há memória do projeto, cópias isoladas nem commits dos agentes.
          {gitInstall ? (
            <InstallProgressBar name="o Git" progress={gitInstall} />
          ) : (
            <>
              <button className="ghost" onClick={() => void installGit()}>Instalar</button>
              {gitError && (
                <span className="git-missing-error" role="alert">
                  {gitError}{" "}
                  <button className="ghost" onClick={() => window.o.git.openInstallPage()}>Baixar o instalador</button>
                </span>
              )}
            </>
          )}
        </div>
      )}
      <UpdateDialog />
      <CloseDialog />
      <AppDialog />
      <AwayPanel onJump={(id) => void jump(id)} />
      <Composer onJump={(id) => void jump(id)} />
      <LinkDialog />
      <Sidebar index={index} collapsed={collapsed} onToggle={toggleSidebar} onChange={setIndex} />
      {/* key: trocar de galáxia/universo monta um canvas novo; os terminais do anterior seguem rodando. */}
      <ErrorBoundary
        key={universe?.id ?? active.id}
        fallback={(error, retry) => (
          <div className="canvas canvas-crash">
            <strong>O canvas falhou ao desenhar.</strong>
            <span>{error.message}</span>
            <span>Os terminais continuam rodando. Tente de novo ou troque de galáxia.</span>
            <button className="primary" onClick={retry}>
              Tentar de novo
            </button>
          </div>
        )}
      >
        <Canvas workspace={active} universe={universe} accounts={index.accounts ?? []} onIndex={setIndex} />
      </ErrorBoundary>
      {palette && <CommandPalette index={index} onGoTo={(t) => void goTo(t)} onClose={() => setPalette(false)} />}
    </div>
  );
}
