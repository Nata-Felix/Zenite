import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Code2, Flame, Loader2, Orbit, Play, Plus, RadioTower, Rocket, Satellite, Scale, Settings2, Split, Trash2, TriangleAlert, X, Merge, Timer, ShieldCheck } from "lucide-react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import type { AccountAgent, FlowAgentOptions, FlowCondition, FlowRoute, FlowRouteRun, FlowSpec, FlowStatus, FlowType } from "../../shared/types";
import type { CanvasFlowNode } from "../nodes";
import { EditableTitle } from "./EditableTitle";
import { newFlowSpec, outputsOf } from "../../shared/flows";
import { FlowActionFields } from "./FlowActionFields";
import { ChronosFields, chronosSummary } from "./ChronosFields";
import { temporalSpec } from "../../shared/chronos";

export { newFlowSpec, outputsOf };

/** Andamento de cada astro, vindo do processo principal. */
let statuses: Record<string, FlowStatus> = {};
const listeners = new Set<() => void>();
window.o.flows.onStatus((s) => {
  statuses = { ...statuses, [s.nodeId]: s };
  listeners.forEach((l) => l());
});
export function useFlowStatus(id: string): FlowStatus | undefined {
  const [s, setS] = useState(() => statuses[id]);
  useEffect(() => {
    const on = () => setS(statuses[id]);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, [id]);
  return s;
}

export const FLOW_TYPES: { type: FlowType; label: string; hint: string; icon: typeof Rocket; color: string }[] = [
  { type: "code", label: "Código", hint: "Executa um bloco de Python ou JavaScript com a versão instalada no computador", icon: Code2, color: "#4fd1a5" },
  { type: "chronos", label: "Cronos", hint: "Controla agendamentos, datas, intervalos e a suspensão temporal de fluxos", icon: Timer, color: "#93c5fd" },
  { type: "request", label: "Requisição HTTP", hint: "Consulta uma API ou envia dados para um serviço conectado", icon: RadioTower, color: "#38bdf8" },
  { type: "transform", label: "Transformar dados", hint: "Compõe textos, extrai propriedades JSON e armazena variáveis", icon: Split, color: "#2dd4bf" },
  { type: "launch", label: "Abrir aplicativo", hint: "Inicia um aplicativo ou abre um arquivo ou atalho local", icon: Rocket, color: "#fb923c" },
  { type: "ignition", label: "Ignição", hint: "Inicia o fluxo por acionamento manual ou pela criação de um arquivo em uma pasta monitorada", icon: Rocket, color: "#f5b94a" },
  { type: "satellite", label: "Satélite", hint: "Executa um agente com conta, modelo, permissões e instruções predefinidos", icon: Satellite, color: "#7c9cff" },
  { type: "orbit", label: "Órbita", hint: "Repete uma etapa até atingir a condição de encerramento ou o limite de iterações", icon: Orbit, color: "#4fd1a5" },
  { type: "gemini", label: "Gêmeos", hint: "Encaminha a execução para a saída A ou B conforme uma condição", icon: Split, color: "#f472b6" },
  { type: "tower", label: "Torre de controle", hint: "Seleciona uma rota por regras de correspondência ou classificação por agente", icon: RadioTower, color: "#38bdf8" },
  { type: "gravity", label: "Gravidade", hint: "Distribui execuções entre as rotas conectadas por alternância ou disponibilidade de cota", icon: Scale, color: "#a78bfa" },
  { type: "thruster", label: "Propulsor", hint: "Executa um script PowerShell e disponibiliza a saída padrão em {{entrada}}", icon: Flame, color: "#fb923c" },
  { type: "convergence", label: "Convergência", hint: "Reúne resultados de caminhos paralelos antes de continuar", icon: Merge, color: "#2dd4bf" },
  { type: "approval", label: "Aprovação", hint: "Solicita autorização do usuário antes de executar as etapas conectadas à saída aprovada", icon: ShieldCheck, color: "#fbbf24" },
];
export const flowType = (t: FlowType) => FLOW_TYPES.find((f) => f.type === (t === "wait" ? "chronos" : t));

/** Configuração inicial de cada astro novo. */

const AGENTS: { value: AccountAgent; label: string }[] = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude Code" },
  { value: "antigravity", label: "Antigravity" },
];
const AGY_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const EFFORT_LABEL: Record<string, string> = { minimal: "Mínimo", low: "Baixo", medium: "Médio", high: "Alto", xhigh: "Muito alto", max: "Máximo", ultra: "Ultra" };
const OPS: { value: FlowCondition["op"]; label: string; noValue?: boolean }[] = [
  { value: "contains", label: "contém" },
  { value: "equals", label: "é igual a" },
  { value: "starts", label: "começa com" },
  { value: "filled", label: "não está vazio", noValue: true },
  { value: "empty", label: "está vazio", noValue: true },
  { value: "gt", label: "número maior que" },
  { value: "lt", label: "número menor que" },
  { value: "regex", label: "corresponde à expressão regular" },
];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function conditionText(c?: FlowCondition): string {
  if (!c) return "";
  const op = OPS.find((o) => o.value === c.op);
  return `${c.field?.trim() || "entrada"} ${op?.label ?? c.op}${op?.noValue ? "" : ` "${c.value ?? ""}"`}`;
}

/** Linha de resumo do que o astro faz, mostrada no cartão. */
export function flowSummary(spec: FlowSpec): string {
  switch (spec.type) {
    case "code": return `${spec.code?.language === "javascript" ? "JavaScript" : "Python"} · ${spec.code?.source.trim().split("\n")[0] || "Escreva o código"}`;
    case "chronos": return chronosSummary(spec.chronos);
    case "request": return `${spec.http?.method ?? "GET"} ${spec.http?.serviceId ? "Serviço conectado" : spec.http?.url || "Configure o endereço"}`;
    case "transform": return spec.transform?.operation ?? "Montar texto";
    case "launch": return spec.launch?.targetId ? "Arquivo conectado" : spec.launch?.path || "Escolha o aplicativo";
    case "convergence":
      return spec.joinMode === "first" ? "Liberação na primeira resposta" : spec.joinMode === "count" ? `Reúne ${spec.joinCount ?? 2} respostas` : "Aguarda todas as entradas conectadas";
    case "wait":
      return spec.waitMode === "signal" ? `Aguarda sinal: ${spec.signalName || "Continuar"}` : `Aguarda ${spec.waitSeconds ?? 30} segundos`;
    case "approval":
      return spec.approvalMessage || "Autorizar a próxima etapa?";
    case "ignition":
      if (spec.paused && spec.schedule && spec.schedule !== "manual") return "Pausada (só pelo ▶ Executar)";
      if (spec.schedule === "interval") return `A cada ${spec.everyMinutes ?? 60} min`;
      if (spec.schedule === "daily") return `${spec.days?.length ? spec.days.map((d) => DAYS[d]).join(", ") : "Todo dia"} às ${spec.at ?? "09:00"}`;
      if (spec.schedule === "folder") return spec.folder ? `Arquivo novo em ${spec.folder.split(/[\\/]/).filter(Boolean).pop()}` : "Escolha a pasta";
      return "Só pelo ▶ Executar";
    case "satellite":
      return [AGENTS.find((a) => a.value === (spec.agent ?? "codex"))?.label, spec.model || "modelo da conta", spec.effort ? EFFORT_LABEL[spec.effort] ?? spec.effort : ""].filter(Boolean).join(" · ");
    case "orbit":
      return `Limite: ${spec.times ?? 3} iterações${spec.until ? `, ou quando ${conditionText(spec.until)}` : ""}`;
    case "gemini":
      return `A se ${conditionText(spec.condition ?? { op: "filled" })}`;
    case "tower":
      return spec.decide === "execute" ? `Classifica e executa · ${(spec.routes ?? []).filter((r) => r.run?.agent).length} executor(es)${spec.exclusive ? " · exclusiva do Sol" : ""}` : spec.decide === "agent" ? "Classificação por agente" : "Correspondência textual";
    case "gravity":
      return spec.strategy === "quota" ? "Disponibilidade de cota" : "Alternância entre rotas";
    case "thruster":
      return spec.script?.trim().split("\n")[0] || "Escreva o script";
  }
  return "Tipo de astro não reconhecido";
}

/** Saídas de cada astro (id da bolinha e nome). Uma só = a saída padrão, sem nome. */

function ConditionFields({ value, onChange }: { value?: FlowCondition; onChange(c: FlowCondition): void }) {
  const c = value ?? { op: "contains" as const, value: "" };
  const op = OPS.find((o) => o.value === c.op);
  return (
    <div className="flow-row three">
      <label>Campo<input value={c.field ?? ""} placeholder="{{entrada}}" onChange={(e) => onChange({ ...c, field: e.target.value })} /></label>
      <label>Regra
        <select value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as FlowCondition["op"] })}>
          {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label>Valor<input value={c.value ?? ""} disabled={op?.noValue} placeholder="OK" onChange={(e) => onChange({ ...c, value: e.target.value })} /></label>
    </div>
  );
}

/** Conta, modelo, esforço e permissão de quem roda um CLI sem tela (Satélite e Torre com IA). */
function AgentFields({ draft, set, noPermission }: { draft: FlowSpec; set(p: Partial<FlowSpec>): void; noPermission?: boolean }) {
  const [opts, setOpts] = useState<FlowAgentOptions | null>(null);
  useEffect(() => void window.o.flows.options().then(setOpts), []);
  const agent = draft.agent ?? "codex";
  const accounts = (opts?.accounts ?? []).filter((a) => a.agent === agent);
  const codex = opts?.codexModels[draft.account ?? ""] ?? opts?.codexModels[""] ?? [];
  const models = agent === "codex" ? codex.map((m) => ({ slug: m.slug, name: m.name })) : agent === "antigravity" ? (opts?.antigravityModels ?? []) : (opts?.claudeModels ?? []);
  const efforts = agent === "codex" ? (codex.find((m) => m.slug === draft.model)?.efforts ?? []) : agent === "antigravity" ? AGY_EFFORTS : [];
  return (
    <>
      {!opts && <p className="dialog-hint">Carregando contas e modelos…</p>}
      <div className="flow-row">
        <label>Agente
          <select value={agent} onChange={(e) => set({ agent: e.target.value as AccountAgent, account: "", model: "", effort: "" })}>
            {AGENTS.map((a) => <option key={a.value} value={a.value}>{a.label}{opts && !opts.installed[a.value] ? " (não instalado)" : ""}</option>)}
          </select>
        </label>
        <label>Conta
          <select value={draft.account ?? ""} onChange={(e) => set({ account: e.target.value, model: "", effort: "" })}>
            <option value="">Conta padrão</option>
            {accounts.map((a) => <option key={a.id} value={a.id} disabled={!a.loggedIn}>{a.name}{a.loggedIn ? "" : " (sem login)"}</option>)}
          </select>
        </label>
      </div>
      <div className="flow-row">
        <label>Modelo
          <select value={draft.model ?? ""} onChange={(e) => set({ model: e.target.value, effort: "" })}>
            <option value="">Modelo padrão da conta</option>
            {models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </label>
        <label>Esforço
          <select value={draft.effort ?? ""} disabled={!efforts.length} onChange={(e) => set({ effort: e.target.value })}>
            <option value="">{efforts.length ? "Esforço padrão do modelo" : agent === "codex" ? "Escolha um modelo" : "Não se aplica"}</option>
            {efforts.map((e) => <option key={e} value={e}>{EFFORT_LABEL[e] ?? e}</option>)}
          </select>
        </label>
      </div>
      {!noPermission && <label>Permissão
        <select value={draft.permission ?? "sandbox"} onChange={(e) => set({ permission: e.target.value as FlowSpec["permission"] })}>
          <option value="read">Somente leitura</option>
          <option value="sandbox">Sandbox (restrito à pasta da galáxia)</option>
          <option value="full">Acesso total</option>
        </select>
      </label>}
    </>
  );
}

/** Uma rota do modo "Classificar e executar": quando vale e quem faz o trabalho. */
function TowerRoute({ route, index, onChange, onRemove }: { route: FlowRoute; index: number; onChange(r: FlowRoute): void; onRemove(): void }) {
  const run = route.run ?? {};
  const setRun = (patch: Partial<FlowRouteRun>) => onChange({ ...route, run: { ...run, ...patch } });
  const fallback = run.fallback;
  return (
    <fieldset className="radio-group">
      <legend>{route.label || `Caminho ${index + 1}`}</legend>
      <div className="flow-row route">
        <label>Rota<input value={route.label} placeholder={`Caminho ${index + 1}`} onChange={(e) => onChange({ ...route, label: e.target.value })} /></label>
        <label>Termos (opcional)<input value={route.match ?? ""} placeholder="pesquise, compare" onChange={(e) => onChange({ ...route, match: e.target.value })} /></label>
        <button type="button" className="icon-button" title="Remover rota" onClick={onRemove}><Trash2 size={14} /></button>
      </div>
      <label>Quando vale<input value={route.criteria ?? ""} placeholder="só ler e resumir, sem mexer em código" onChange={(e) => onChange({ ...route, criteria: e.target.value })} /></label>
      <label className="toggle"><input type="checkbox" checked={!!run.agent} onChange={(e) => onChange({ ...route, run: e.target.checked ? { agent: "codex", permission: "sandbox" } : undefined })} /><span>A Torre executa esta rota (desmarcado: segue pela saída para o que estiver ligado)</span></label>
      {run.agent && (
        <>
          <AgentFields draft={{ type: "satellite", ...run }} set={(p) => setRun(p as Partial<FlowRouteRun>)} />
          <label>Pedido ao executor (opcional)<textarea rows={2} value={run.prompt ?? ""} placeholder="Pesquise e devolva em tópicos: {{entrada}}" onChange={(e) => setRun({ prompt: e.target.value })} /></label>
          <label className="toggle"><input type="checkbox" checked={!!fallback} onChange={(e) => setRun({ fallback: e.target.checked ? { agent: "claude" } : undefined })} /><span>Se a conta estiver sem limite, usar outro agente</span></label>
          {fallback && <AgentFields noPermission draft={{ type: "satellite", ...fallback }} set={(p) => setRun({ fallback: { ...fallback, ...(p as FlowRouteRun["fallback"]) } })} />}
        </>
      )}
    </fieldset>
  );
}

/** Modal de configuração de cada astro. */
function FlowConfig({ nodeId, spec, title, onSave, onClose }: { nodeId: string; spec: FlowSpec; title: string; onSave(spec: FlowSpec, title: string): void; onClose(): void }) {
  const [draft, setDraft] = useState<FlowSpec>(() => temporalSpec(spec));
  const [name, setName] = useState(title);
  const set = (patch: Partial<FlowSpec>) => setDraft((d) => ({ ...d, ...patch }));
  const t = flowType(draft.type) ?? FLOW_TYPES[0];
  const routes = draft.routes ?? [];
  const vars = <p className="dialog-hint">{"{{entrada}}"} é o texto que chegou do passo anterior; {"{{resposta}}"}, a última resposta de um Satélite; {"{{volta}}"}, a volta da Órbita.</p>;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog flow-dialog"
        role="dialog"
        aria-labelledby="flow-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft, name.trim() || title);
        }}
      >
        <h2 id="flow-title">
          <t.icon size={18} style={{ color: t.color }} /> {t.label}
        </h2>
        <p className="dialog-text">{t.hint}.</p>
        <label>Nome<input value={name} placeholder={t.label} onChange={(e) => setName(e.target.value)} /></label>
        <FlowActionFields id={nodeId} draft={draft} set={set} />
        {draft.type === "chronos" && <ChronosFields draft={draft} set={set} />}

        {spec.type === "convergence" && <>
          <label>Critério de liberação<select value={draft.joinMode ?? "all"} onChange={(e) => set({ joinMode: e.target.value as FlowSpec["joinMode"] })}>
            <option value="all">Quando todas as entradas responderem</option>
            <option value="first">Na primeira resposta</option>
            <option value="count">Ao receber uma quantidade mínima</option>
          </select></label>
          {draft.joinMode === "count" && <label>Quantidade de respostas<input type="number" min={1} step={1} required value={draft.joinCount ?? 2} onChange={(e) => set({ joinCount: Number(e.target.value) })} /></label>}
          <p className="dialog-hint">Ligue os caminhos paralelos à entrada deste astro. Cada linha conta uma vez; a coleta acontece uma vez por execução. Os caminhos precisam chegar aqui: uma falha ou rota não executada deixa a coleta incompleta. Use fora de ciclos.</p>
          <p className="dialog-hint">Os textos reunidos seguem como {"{{entrada}}"}; {"{{resultados}}"} contém a lista com os nomes e as respostas. As outras tarefas continuam mesmo quando a primeira resposta libera este passo.</p>
        </>}

        {spec.type === "approval" && <>
          <label>Mensagem de aprovação<textarea rows={4} value={draft.approvalMessage ?? ""} placeholder="Autorizar a publicação deste resultado?" onChange={(e) => set({ approvalMessage: e.target.value })} /></label>
          <p className="dialog-hint">Você verá a entrada e os próximos passos antes de decidir. Fechar a confirmação equivale a recusar. Ligue as saídas <b>Aprovado</b> e <b>Recusado</b> aos caminhos correspondentes.</p>
          <p className="dialog-hint">A aprovação vale para esta passagem e mantém as permissões globais, inclusive o Sandbox.</p>
          {vars}
        </>}

        {draft.type === "ignition" && (
          <>
            <label>Gatilho de execução
              <select value={draft.schedule ?? "manual"} onChange={(e) => set({ schedule: e.target.value as FlowSpec["schedule"] })}>
                <option value="manual">Acionamento manual</option>
                <option value="folder">Criação de arquivo em pasta monitorada</option>
              </select>
            </label>
            {draft.schedule === "folder" && (
              <label>Pasta
                <div className="flow-pick">
                  <input value={draft.folder ?? ""} placeholder="C:\entrada" onChange={(e) => set({ folder: e.target.value })} />
                  <button type="button" className="ghost" onClick={() => void window.o.workspaces.pickDirectory(draft.folder).then((d: string | null) => d && set({ folder: d }))}>Escolher…</button>
                </div>
              </label>
            )}
            {draft.schedule !== "folder" && <label>Entrada inicial<textarea rows={3} value={draft.input ?? ""} placeholder="Dados de entrada do fluxo" onChange={(e) => set({ input: e.target.value })} /></label>}
            <p className="dialog-hint">{draft.schedule === "folder" ? "O caminho do arquivo novo segue como {{entrada}}." : "O texto segue como {{entrada}} para o próximo passo."} Os disparos automáticos só acontecem com o Zênite aberto. Ligado a um terminal do canvas, o texto é digitado nele.</p>
          </>
        )}

        {spec.type === "satellite" && (
          <>
            <AgentFields draft={draft} set={set} />
            <label>Prompt fixo
              <textarea rows={5} value={draft.prompt ?? ""} placeholder={"Resuma em uma linha: {{entrada}}"} onChange={(e) => set({ prompt: e.target.value })} />
            </label>
            {vars}
            <p className="dialog-hint">A resposta segue como {"{{entrada}}"}. Cada execução começa do zero, sem memória da anterior.</p>
          </>
        )}

        {spec.type === "orbit" && (
          <>
            <label>Limite de iterações<input type="number" min={1} max={100} value={draft.times ?? 3} onChange={(e) => set({ times: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} /></label>
            <label className="flow-check"><input type="checkbox" checked={!!draft.until} onChange={(e) => set({ until: e.target.checked ? { op: "contains", value: "" } : undefined })} /> Habilitar condição de encerramento</label>
            {draft.until && <ConditionFields value={draft.until} onChange={(until) => set({ until })} />}
            <p className="dialog-hint">Ligue a saída <b>Volta</b> ao passo que deve ser refeito (pode ser um anterior) e a <b>Segue</b> ao que vem depois.</p>
            {vars}
          </>
        )}

        {spec.type === "gemini" && (
          <>
            <p className="dialog-hint">Quando a condição for atendida, a execução é direcionada à saída <b>A</b> ; caso contrário, à saída <b>B</b>.</p>
            <ConditionFields value={draft.condition} onChange={(condition) => set({ condition })} />
            {vars}
          </>
        )}

        {spec.type === "tower" && (
          <>
            <label>Método de seleção da rota
              <select value={draft.decide ?? "rules"} onChange={(e) => set({ decide: e.target.value as FlowSpec["decide"] })}>
                <option value="rules">Correspondência textual</option>
                <option value="agent">Classificação por agente</option>
                <option value="execute">Classificar e executar</option>
              </select>
            </label>
            {routes.map((r, i) => draft.decide === "execute" ? (
              <TowerRoute key={r.id} route={r} index={i} onChange={(route) => set({ routes: routes.map((x) => (x.id === r.id ? route : x)) })} onRemove={() => set({ routes: routes.filter((x) => x.id !== r.id) })} />
            ) : (
              <div className="flow-row route" key={r.id}>
                <label>Rota<input value={r.label} placeholder={`Caminho ${i + 1}`} onChange={(e) => set({ routes: routes.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} /></label>
                {(draft.decide ?? "rules") === "rules" && <label>Termos de correspondência<input value={r.match ?? ""} placeholder="erro, falha" onChange={(e) => set({ routes: routes.map((x) => (x.id === r.id ? { ...x, match: e.target.value } : x)) })} /></label>}
                {draft.decide === "agent" && <label>Quando vale<input value={r.criteria ?? ""} placeholder="reclamações e erros" onChange={(e) => set({ routes: routes.map((x) => (x.id === r.id ? { ...x, criteria: e.target.value } : x)) })} /></label>}
                <button type="button" className="icon-button" title="Remover rota" onClick={() => set({ routes: routes.filter((x) => x.id !== r.id) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="ghost small" onClick={() => set({ routes: [...routes, { id: `r${Date.now().toString(36)}`, label: "", match: "" }] })}><Plus size={13} /> Adicionar rota</button>
            <p className="dialog-hint">{(draft.decide ?? "rules") === "rules" ? "Separe os termos por vírgulas. A primeira rota com correspondência será selecionada." : draft.decide === "execute" ? "Os termos decidem primeiro; se nenhum bater, a IA abaixo escolhe pelo critério de cada rota. O executor da rota faz o trabalho e a resposta sai pela saída dela. Se a saída não estiver ligada a nada, a resposta volta para quem pediu (zn flow run)." : "A IA recebe o texto, os nomes das rotas e o critério de cada uma, e responde com um deles."} Na ausência de correspondência, utiliza a saída <b>Outros</b>.</p>
            {draft.decide === "execute" && (
              <label className="toggle"><input type="checkbox" checked={!!draft.exclusive} onChange={(e) => set({ exclusive: e.target.checked })} /><span><strong>Torre exclusiva do Sol</strong> — ligada ao Sol, ele só delega por ela: sem zn ask direto e sem recrutar.</span></label>
            )}
            {(draft.decide === "agent" || draft.decide === "execute") && (
              <>
                {draft.decide === "execute" && <p className="dialog-hint"><b>Quem classifica</b> (usado só quando os termos não decidem):</p>}
                <AgentFields draft={draft} set={set} />
                <label>Instrução extra (opcional)<textarea rows={3} value={draft.prompt ?? ""} placeholder="Direcione reclamações para a rota Suporte." onChange={(e) => set({ prompt: e.target.value })} /></label>
              </>
            )}
          </>
        )}

        {spec.type === "gravity" && (
          <>
            <label>Estratégia de distribuição
              <select value={draft.strategy ?? "rotate"} onChange={(e) => set({ strategy: e.target.value as FlowSpec["strategy"] })}>
                <option value="rotate">Alternância sequencial (round-robin)</option>
                <option value="quota">Disponibilidade de cota (ignora contas sem cota)</option>
              </select>
            </label>
            <p className="dialog-hint">Ligue a saída a dois ou mais caminhos (Satélites, terminais, outros astros). Cada execução vai para um só deles.</p>
          </>
        )}

        {spec.type === "thruster" && (
          <>
            <label>Script do PowerShell
              <textarea rows={7} value={draft.script ?? ""} placeholder={'Add-Content resultados.txt "{{entrada}}"\n"gravado"'} onChange={(e) => set({ script: e.target.value })} />
            </label>
            <p className="dialog-hint">Roda na pasta da galáxia. O que o script escrever na saída segue como {"{{entrada}}"}; se der erro, o fluxo para aqui.</p>
            {vars}
          </>
        )}

        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button className="primary" type="submit">Salvar</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Astro no canvas: tipo, resumo, saídas com nome, andamento e os botões Configurar e Executar. */
function FlowNodeImpl({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const el = data.element!;
  const spec = el.flow ?? newFlowSpec("ignition");
  const t = flowType(spec.type) ?? { label: "Astro antigo", icon: TriangleAlert, color: "#868e96", hint: "" };
  const status = useFlowStatus(id);
  const [editing, setEditing] = useState(false);
  const running = status?.state === "running";
  const outputs = outputsOf(spec);
  const updateInternals = useUpdateNodeInternals();
  const handleKey = outputs.map((o) => o.id).join(",");
  useEffect(() => updateInternals(id), [handleKey, id, updateInternals]);
  return (
    <div className={`flow-node${selected ? " selected" : ""}${status ? ` ${status.state}` : ""}`} style={{ "--agent": t.color } as React.CSSProperties}>
      {spec.type !== "ignition" && <Handle type="target" position={Position.Left} />}
      <div className="flow-head drag-handle">
        <span className="flow-icon"><t.icon size={16} /></span>
        <span className="flow-title">
          <strong><EditableTitle value={el.title} onChange={(next) => data.actions.rename(id, next)} /></strong>
          <small>{t.label}</small>
        </span>
        <button className="icon-button nodrag" title="Executar a partir daqui" disabled={running} onClick={() => data.actions.runFlow(id)}><Play size={14} /></button>
        <button className="icon-button nodrag" title="Configurar" onClick={() => setEditing(true)}><Settings2 size={14} /></button>
        <button className="icon-button nodrag" title="Remover" onClick={() => data.actions.close(id)}><X size={14} /></button>
      </div>
      <div className="flow-summary" title={flowSummary(spec)}>{flowSummary(spec)}</div>
      {outputs.length > 0 && (
        <div className="flow-outputs">
          {outputs.map((o) => (
            <div className="flow-output" key={o.id}>
              <span>{o.label}</span>
              <Handle type="source" position={Position.Right} id={o.id} />
            </div>
          ))}
        </div>
      )}
      <div className="flow-foot">
        {running && <button className="ghost small nodrag" title="Parar este fluxo; os agentes em andamento terminam o passo atual" onClick={() => void window.o.flows.stop(id).then((r) => { if (!r.ok) window.alert(r.error); })}>Parar</button>}
        {running && (spec.type === "wait" && spec.waitMode === "signal" || spec.type === "chronos" && spec.chronos?.mode === "signal") && <button className="ghost small nodrag" onClick={() => void window.o.flows.signal(id).then((r) => { if (!r.ok) window.alert(r.error); })}>Enviar sinal</button>}
        {status ? (
          <span className={`flow-status ${status.state}`} title={status.message ?? ""}>
            {running ? <Loader2 size={12} className="reload-spinning" /> : status.state === "ok" ? <Check size={12} /> : <TriangleAlert size={12} />} {status.message ?? (status.state === "ok" ? "Concluído" : running ? "Em execução" : "")}
          </span>
        ) : (
          <span className="flow-status">Pronto</span>
        )}
      </div>
      {outputs.length === 0 && <Handle type="source" position={Position.Right} />}
      {editing && (
        <FlowConfig
          nodeId={id}
          spec={spec}
          title={el.title}
          onClose={() => setEditing(false)}
          onSave={(next, title) => {
            data.actions.editElement(id, { flow: next });
            if (title !== el.title) data.actions.rename(id, title);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

export const FlowNode = memo(FlowNodeImpl);
