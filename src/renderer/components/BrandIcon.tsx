import type { CSSProperties } from "react";
import claude from "../assets/brands/claude.svg";
import codex from "../assets/brands/codex.svg";
import antigravity from "../assets/brands/antigravity.svg";
import grok from "../assets/brands/grok.svg";
import openrouter from "../assets/brands/openrouter.svg";
import openai from "../assets/brands/openai.svg";
import powershell from "../assets/brands/powershell.svg";

// Logos oficiais de produtos de terceiros (LobeHub Icons e o repositório do PowerShell).
// Os coloridos entram como imagem; os de uma cor só (Grok, OpenRouter, OpenAI) usam a cor do texto,
// para aparecerem no tema claro e no escuro.

export interface IconProps {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

export type IconComponent = (props: IconProps) => React.ReactElement;

function brand(src: string, mono: boolean, label: string): IconComponent {
  return function Brand({ size = 24, className, style }: IconProps) {
    const box = { width: size, height: size, flex: "none", ...style } as CSSProperties;
    if (!mono) return <img src={src} alt="" aria-label={label} className={className} style={{ ...box, objectFit: "contain" }} draggable={false} />;
    const mask = `url("${src}") center / contain no-repeat`;
    return <span role="img" aria-label={label} className={className} style={{ display: "inline-block", ...box, background: "currentColor", WebkitMask: mask, mask }} />;
  };
}

export const ClaudeIcon = brand(claude, false, "Claude");
export const CodexIcon = brand(codex, false, "Codex");
export const AntigravityIcon = brand(antigravity, false, "Antigravity");
export const GrokIcon = brand(grok, true, "Grok");
export const OpenRouterIcon = brand(openrouter, true, "OpenRouter");
export const ChatGptIcon = brand(openai, true, "ChatGPT");
export const PowerShellIcon = brand(powershell, false, "PowerShell");
