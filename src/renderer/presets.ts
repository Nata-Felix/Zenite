import { useEffect, useState, type ComponentType } from "react";
import { Bot, Code, Database, FlaskConical, Globe, Rocket, Server, Sparkles, SquareTerminal, Wrench } from "lucide-react";
import { AntigravityIcon, ChatGptIcon, ClaudeIcon, CodexIcon, GrokIcon, PowerShellIcon, type IconProps } from "./components/BrandIcon";

/** Ícone do lucide ou logo oficial de um produto (BrandIcon). */
export type AnyIcon = ComponentType<IconProps>;
import { readPref, writePref } from "./prefs";

/** Preset criado pelo usuário: um comando rápido no "Novo terminal" e no dock. */
export interface CustomPreset {
  id: string;
  title: string;
  command: string;
  /** Pasta onde abre (vazio = a da galáxia). */
  cwd?: string;
  icon: string;
  color: string;
}

export const PRESET_ICONS: Record<string, AnyIcon> = {
  terminal: SquareTerminal,
  powershell: PowerShellIcon,
  claude: ClaudeIcon,
  codex: CodexIcon,
  chatgpt: ChatGptIcon,
  antigravity: AntigravityIcon,
  grok: GrokIcon,
  rocket: Rocket,
  code: Code,
  server: Server,
  database: Database,
  globe: Globe,
  bot: Bot,
  sparkles: Sparkles,
  flask: FlaskConical,
  wrench: Wrench,
};

/** Cores que funcionam nos dois temas. */
export const PRESET_COLORS = ["#e8590c", "#2f9e44", "#1971c2", "#9c36b5", "#c2255c", "#0c8599", "#868e96"];

/** No máximo 10, como no Maestri: mais que isso polui o diálogo e o dock. */
export const MAX_PRESETS = 10;

const KEY = "customPresets";
const EVENT = "zenite:presets";

export function customPresets(): CustomPreset[] {
  return readPref<CustomPreset[]>(KEY, []).filter((p) => p && p.id && p.title);
}

export function saveCustomPresets(list: CustomPreset[]): void {
  writePref(KEY, list.slice(0, MAX_PRESETS));
  window.dispatchEvent(new Event(EVENT));
}

export function useCustomPresets(): CustomPreset[] {
  const [list, setList] = useState(customPresets);
  useEffect(() => {
    const on = () => setList(customPresets());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return list;
}
