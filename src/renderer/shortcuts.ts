import { useEffect, useState } from "react";
import type { Command } from "./commands";
import { readPref, writePref } from "./prefs";

/**
 * Atalhos do app num só lugar: o padrão de cada um, a troca feita pelo usuário e a regra
 * que protege o terminal (Ctrl + letra é do shell: lá dentro esses atalhos não valem).
 * Ferramentas de desenho (V, R, O...) e Ctrl+1…9 são fixos e ficam fora daqui.
 */
export interface Shortcut {
  id: string;
  label: string;
  group: "Geral" | "Navegação" | "Canvas" | "Criar";
  keys: string;
  command: Command;
  /** Vale também dentro do terminal (rouba a combinação do CLI). */
  everywhere?: boolean;
}

export const SHORTCUTS: Shortcut[] = [
  { id: "palette", label: "Busca rápida", group: "Geral", keys: "Ctrl+Shift+P", command: "open-palette" },
  { id: "composer", label: "Caixa de mensagem para os agentes", group: "Geral", keys: "Ctrl+K", command: "open-composer", everywhere: true },
  { id: "palette-alt", label: "Busca rápida (fora do terminal)", group: "Geral", keys: "Ctrl+P", command: "open-palette" },
  { id: "settings", label: "Abrir configurações", group: "Geral", keys: "Ctrl+,", command: "open-settings" },
  { id: "sidebar", label: "Recolher ou expandir a barra lateral", group: "Geral", keys: "Ctrl+Shift+B", command: "toggle-sidebar" },
  { id: "zen", label: "Modo Zen: só o canvas (para sair, clique no canvas e aperte Esc)", group: "Geral", keys: "Alt+Z", command: "toggle-zen" },
  { id: "attention", label: "Ir ao próximo que precisa de você", group: "Navegação", keys: "Ctrl+Shift+A", command: "next-attention" },
  { id: "next", label: "Próximo elemento", group: "Navegação", keys: "Ctrl+Tab", command: "next-element" },
  { id: "prev", label: "Elemento anterior", group: "Navegação", keys: "Ctrl+Shift+Tab", command: "prev-element" },
  { id: "fit", label: "Enquadrar tudo", group: "Canvas", keys: "", command: "fit-view" },
  { id: "summary", label: "Visão resumida: só cartões e ligações (clique num cartão para abrir)", group: "Canvas", keys: "Alt+S", command: "toggle-summary" },
  { id: "select-all", label: "Selecionar todo o canvas", group: "Canvas", keys: "Ctrl+A", command: "select-all" },
  { id: "copy", label: "Copiar elementos selecionados", group: "Canvas", keys: "Ctrl+C", command: "copy-selection" },
  { id: "cut", label: "Recortar elementos selecionados", group: "Canvas", keys: "Ctrl+X", command: "cut-selection" },
  { id: "paste", label: "Colar elementos no canvas", group: "Canvas", keys: "Ctrl+V", command: "paste-selection" },
  { id: "fit-selection", label: "Enquadrar a seleção", group: "Canvas", keys: "Ctrl+Alt+\\", command: "fit-selection" },
  { id: "grid", label: "Organizar a seleção em grade", group: "Canvas", keys: "Ctrl+Alt+G", command: "grid-selection" },
  { id: "auto-layout", label: "Organizar automaticamente (seleção ou canvas)", group: "Canvas", keys: "Ctrl+Alt+O", command: "auto-layout" },
  { id: "undo-layout", label: "Desfazer última organização automática", group: "Canvas", keys: "", command: "undo-layout" },
  { id: "minimap", label: "Mostrar ou esconder o minimapa", group: "Canvas", keys: "", command: "toggle-minimap" },
  { id: "new-terminal", label: "Novo terminal", group: "Criar", keys: "Ctrl+Shift+T", command: "new-terminal" },
  { id: "new-note", label: "Nova nota", group: "Criar", keys: "", command: "new-element:note" },
  { id: "new-table", label: "Nova tabela", group: "Criar", keys: "", command: "new-element:table" },
  { id: "new-web", label: "Novo site", group: "Criar", keys: "", command: "new-element:web" },
  { id: "new-file", label: "Adicionar arquivo", group: "Criar", keys: "", command: "new-element:file" },
  { id: "new-folder", label: "Adicionar pasta", group: "Criar", keys: "", command: "new-element:folder" },
];

const KEY = "shortcuts";
const EVENT = "zenite:shortcuts";

/** Trocas feitas pelo usuário: id -> teclas ("" = sem atalho). */
function overrides(): Record<string, string> {
  return readPref<Record<string, string>>(KEY, {});
}

export function keysFor(id: string): string {
  const o = overrides();
  return id in o ? o[id] : (SHORTCUTS.find((s) => s.id === id)?.keys ?? "");
}

export function setKeys(id: string, keys: string): void {
  const o = overrides();
  const def = SHORTCUTS.find((s) => s.id === id)?.keys;
  if (keys === def) delete o[id];
  else o[id] = keys;
  writePref(KEY, o);
  window.dispatchEvent(new Event(EVENT));
}

export function resetShortcuts(): void {
  writePref(KEY, {});
  window.dispatchEvent(new Event(EVENT));
}

/** Atalhos atuais (padrão + trocas), atualizados quando mudam. */
export function useShortcutKeys(): Record<string, string> {
  const read = () => Object.fromEntries(SHORTCUTS.map((s) => [s.id, keysFor(s.id)]));
  const [keys, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return keys;
}

const CODE_NAMES: Record<string, string> = {
  Backslash: "\\",
  IntlBackslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Espaço",
};

/** "Ctrl+Shift+A" a partir do evento (pela tecla física: funciona em qualquer layout). */
export function comboOf(e: KeyboardEvent): string {
  const code = e.code;
  let key: string;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else key = CODE_NAMES[code] ?? e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) key = "";
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", key].filter(Boolean).join("+");
}

/** Combinações que o terminal usa (Ctrl+letra, sem Shift/Alt) e teclas sem modificador. */
export function belongsToTerminal(combo: string): boolean {
  return /^Ctrl\+[A-Z]$/.test(combo) || !combo.includes("+");
}

/** Combinação que pode virar atalho: precisa de Ctrl ou Alt (ou ser uma tecla F). */
export function validCombo(combo: string): boolean {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  return !!key && (parts.includes("Ctrl") || parts.includes("Alt") || /^F\d+$/.test(key));
}

/** Qual atalho usa estas teclas (para avisar conflito). */
export function shortcutUsing(combo: string, exceptId?: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id !== exceptId && keysFor(s.id) === combo);
}

/** Enquanto a tela de atalhos espera uma combinação nova, os atalhos não disparam. */
let capturing = false;
export function setCapturingShortcut(on: boolean): void {
  capturing = on;
}
export function isCapturingShortcut(): boolean {
  return capturing;
}
