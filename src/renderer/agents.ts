import { SquareTerminal } from "lucide-react";
import { AntigravityIcon, ClaudeIcon, CodexIcon, GrokIcon, OpenRouterIcon, PowerShellIcon } from "./components/BrandIcon";
import type { AgentProvider } from "../shared/types";
import { customPresets, PRESET_ICONS, type AnyIcon, type CustomPreset } from "./presets";

export type AgentKind = "shell" | "claude" | "codex" | "antigravity" | "openrouter" | "grok" | "custom";

export interface AgentPreset {
  kind: AgentKind;
  /** Presets do usuário têm id e podem ter pasta própria. */
  id?: string;
  cwd?: string;
  title: string;
  command: string;
  description: string;
  color: string;
  icon: AnyIcon;
  /** Provedor alternativo (ex.: OpenRouter): o mesmo programa com outras variáveis. */
  provider?: AgentProvider;
  /** Como instalar, mostrado no "Novo terminal". */
  install?: string;
}

export const PRESETS: AgentPreset[] = [
  { kind: "claude", title: "Claude Code", command: "claude", description: "Agente da Anthropic", color: "var(--c-claude)", icon: ClaudeIcon },
  { kind: "codex", title: "Codex", command: "codex", description: "Agente da OpenAI", color: "var(--c-codex)", icon: CodexIcon },
  {
    kind: "antigravity",
    title: "Antigravity",
    command: "agy",
    description: "Agente do Google",
    color: "var(--c-antigravity)",
    icon: AntigravityIcon,
    install: "Precisa do Antigravity CLI (agy) instalado. Cada conta tem a própria pasta e login; dá para abrir várias ao mesmo tempo.",
  },
  {
    kind: "openrouter",
    title: "OpenRouter",
    command: "claude",
    provider: "openrouter",
    description: "Claude Code via OpenRouter",
    color: "var(--c-openrouter)",
    icon: OpenRouterIcon,
  },
  {
    kind: "grok",
    title: "Grok CLI",
    command: "grok",
    description: "Agente com o Grok (xAI)",
    color: "var(--c-grok)",
    icon: GrokIcon,
    install: "Precisa do Grok CLI instalado (ex.: npm i -g grok-dev) e da chave da xAI (GROK_API_KEY ou /login, conforme a versão).",
  },
  { kind: "shell", title: "Shell", command: "", description: "PowerShell puro", color: "var(--c-shell)", icon: PowerShellIcon },
];

const CUSTOM: AgentPreset = { kind: "custom", title: "Comando", command: "", description: "", color: "var(--c-custom)", icon: SquareTerminal };

export function fromCustom(p: CustomPreset): AgentPreset {
  return { kind: "custom", id: p.id, title: p.title, command: p.command, cwd: p.cwd, description: p.command || "Shell", color: p.color, icon: PRESET_ICONS[p.icon] ?? SquareTerminal };
}

/** Descobre o tipo de agente pelo programa que o comando executa (ou pelo preset do usuário). */
export function presetFor(command: string, provider?: AgentProvider): AgentPreset {
  if (provider) return PRESETS.find((p) => p.provider === provider) ?? CUSTOM;
  const custom = customPresets().find((p) => p.command.trim() && p.command.trim() === command.trim());
  if (custom) return fromCustom(custom);
  const program = command.trim().split(/\s+/)[0]?.split(/[\\/]/).pop()?.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase() ?? "";
  if (!program) return PRESETS.find((p) => p.kind === "shell")!;
  return PRESETS.find((p) => !p.provider && p.command && p.command === program) ?? CUSTOM;
}
