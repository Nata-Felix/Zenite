import type { FlowSpec, FlowType } from "./types";

/** Nome de cada astro, como aparece no canvas e no zn. */
export const FLOW_LABEL: Record<FlowType, string> = {
  chronos: "Cronos",
  ignition: "Ignição",
  satellite: "Satélite",
  orbit: "Órbita",
  gemini: "Gêmeos",
  tower: "Torre de controle",
  gravity: "Gravidade",
  thruster: "Propulsor",
  convergence: "Convergência",
  wait: "Espera",
  approval: "Aprovação",
  request: "Requisição HTTP",
  transform: "Transformar dados",
  launch: "Abrir aplicativo",
  code: "Código",
};

export const FLOW_TYPE_LIST = Object.keys(FLOW_LABEL) as FlowType[];

export function newFlowSpec(type: FlowType): FlowSpec {
  if (type === "code") return { type, code: { language: "python", source: "" } };
  if (type === "chronos") return { type, chronos: { mode: "delay", value: 10, unit: "seconds", output: "{{entrada}}" } };
  if (type === "request") return { type, http: { method: "GET", url: "", bodyType: "json" } };
  if (type === "transform") return { type, transform: { operation: "template", value: "{{entrada}}" } };
  if (type === "launch") return { type, launch: { mode: "open", path: "" } };
  if (type === "satellite") return { type, agent: "codex", permission: "sandbox" };
  if (type === "tower") return { type, decide: "rules", routes: [{ id: "r1", label: "Caminho 1", match: "" }, { id: "r2", label: "Caminho 2", match: "" }] };
  if (type === "orbit") return { type, times: 3 };
  if (type === "gemini") return { type, condition: { op: "contains", value: "" } };
  if (type === "ignition") return { type, schedule: "manual" };
  if (type === "gravity") return { type, strategy: "rotate" };
  if (type === "convergence") return { type, joinMode: "all", joinCount: 2 };
  if (type === "wait") return { type, waitMode: "timer", waitSeconds: 30, timeoutSeconds: 3600 };
  if (type === "approval") return { type, approvalMessage: "Autorizar a próxima etapa?" };
  return { type };
}

/** Saídas com nome de um astro (vazio = uma saída só). */
export function outputsOf(spec: FlowSpec): { id: string; label: string }[] {
  if (spec.type === "chronos") return [{ id: "continue", label: "Continuar" }];
  if (spec.type === "approval") return [{ id: "approved", label: "Aprovado" }, { id: "rejected", label: "Recusado" }];
  if (spec.type === "gemini") return [{ id: "a", label: "A · sim" }, { id: "b", label: "B · não" }];
  if (spec.type === "orbit") return [{ id: "loop", label: "Volta" }, { id: "done", label: "Segue" }];
  if (spec.type === "tower") return [...(spec.routes ?? []).map((r) => ({ id: r.id, label: r.label || "Rota" })), { id: "else", label: "Outros" }];
  return [];
}
