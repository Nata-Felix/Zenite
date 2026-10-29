import type { CanvasEdge, CanvasNode, CanvasState, FlowCondition, FlowRouteRun, FlowSpec, FlowStatus } from "../shared/types";
import { chronosSeconds, validateChronos } from "../shared/chronos";
import { fillData, transformData } from "../shared/flowData";

/**
 * Motor dos astros. Começa no astro do ▶ (ou na Ignição que disparou sozinha) e segue as linhas
 * no sentido em que foram desenhadas. Anda um texto só, {{entrada}}, com variáveis ao lado:
 *  - Satélite: roda o CLI sem tela; a resposta vira a nova {{entrada}} (e {{resposta}}).
 *  - Propulsor: roda o script; a saída vira a nova {{entrada}}.
 *  - Gêmeos: segue pela saída "a" se a condição bater, senão pela "b".
 *  - Torre: segue pela saída da rota escolhida (por palavra ou pela IA); sem rota, pela "else".
 *    No modo "execute", roda o executor da rota antes; sem continuação, responde a quem pediu.
 *  - Gravidade: escolhe uma das linhas que saem dele (revezando, ou pela conta com folga).
 *  - Órbita: pela saída "loop" volta a um passo anterior, até a condição bater ou acabarem as
 *    voltas ({{volta}} conta); aí segue pela "done".
 * Chegou num terminal comum do canvas: o texto é entregue a ele (colado e Enter).
 */
export interface FlowItem {
  entrada: string;
  vars: Record<string, string>;
}

type AgentResult = { ok: true; text: string } | { ok: false; error: string };

export interface FlowDeps {
  signal?: AbortSignal;
  action?(node: CanvasNode, item: FlowItem): Promise<FlowItem>;
  waitForSignal?(nodeId: string, seconds: number): Promise<string | undefined>;
  approve?(node: CanvasNode, message: string, input: string, next: CanvasNode[]): Promise<boolean>;
  runAgent(spec: FlowSpec, prompt: string, nodeId: string): Promise<AgentResult>;
  runScript(script: string): Promise<AgentResult>;
  /** Entrega o texto a um terminal aberto do canvas. */
  deliver(terminalId: string, text: string): Promise<void>;
  /** Gravidade por folga: false = a conta deste Satélite está com o limite esgotado. */
  hasQuota(spec: FlowSpec): boolean;
  status(s: FlowStatus): void;
  /** Pediram para parar (zn flow stop): o próximo passo não começa. */
  stopped?(): boolean;
  /** O texto está passando de um passo para o outro: a linha entre eles ganha o pulso de envio. */
  link?(from: string, to: string): void;
  /** Terminal que começou o fluxo (zn flow run): recebe a resposta da Torre que executa. */
  replyTo?: string;
}

/** Tempo que o pulso leva para atravessar uma ligação antes do passo seguinte (a animação ativa dura ~1,1 s). */
export const LINK_TRAVEL_MS = 1200;

/** Passos no máximo por execução: uma Órbita mal ligada não roda para sempre. */
export const MAX_STEPS = 500;

/** {{campo}} → valor (sem diferenciar maiúsculas); campo que não existe fica vazio. */
export function fill(template: string, item: FlowItem): string {
  return fillData(template, item);
}

export function matches(c: FlowCondition | undefined, item: FlowItem): boolean {
  if (!c) return true;
  const text = c.field?.trim() ? fill(c.field, item) : item.entrada;
  const value = fill(c.value ?? "", item);
  const a = text.trim().toLowerCase();
  const b = value.trim().toLowerCase();
  const num = (s: string) => Number(s.replace(",", "."));
  switch (c.op) {
    case "contains": return a.includes(b);
    case "equals": return a === b;
    case "starts": return a.startsWith(b);
    case "empty": return !a;
    case "filled": return !!a;
    case "gt": return num(a) > num(b);
    case "lt": return num(a) < num(b);
    case "regex": try { return new RegExp(value, "i").test(text); } catch { return false; }
  }
}

/** Torre no modo regra: a primeira rota com alguma das palavras dela no texto. */
export function pickRoute(spec: FlowSpec, text: string): string {
  const t = text.toLowerCase();
  for (const r of spec.routes ?? []) {
    const words = (r.match ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.some((w) => t.includes(w))) return r.id;
  }
  return "else";
}

/** Pedido à IA da Torre: os nomes das rotas e, quando houver, o critério de cada uma. */
export function towerPrompt(spec: FlowSpec, item: FlowItem): string {
  const routes = (spec.routes ?? []).filter((r) => r.label.trim());
  const criteria = routes.some((r) => r.criteria?.trim()) ? `\n\nCaminhos:\n${routes.map((r) => `- ${r.label}${r.criteria?.trim() ? `: ${r.criteria.trim()}` : ""}`).join("\n")}\nSe nenhum servir, responda Outros.` : "";
  return `${spec.prompt?.trim() ? fill(spec.prompt, item) + "\n\n" : ""}Escolha o caminho para o texto abaixo. Responda só com um destes nomes: ${routes.map((r) => r.label).join(", ")}.${criteria}\n\nTexto:\n${item.entrada}`;
}

/** Executor da rota; sem limite na conta dele, usa a alternativa (se houver). */
export function routeSpec(run: FlowRouteRun, deps: Pick<FlowDeps, "hasQuota">): FlowSpec {
  const main: FlowSpec = { type: "satellite", agent: run.agent, account: run.account, model: run.model, effort: run.effort, permission: run.permission };
  return run.fallback?.agent && !deps.hasQuota(main) ? { ...main, account: undefined, model: undefined, effort: undefined, ...run.fallback } : main;
}

/** Torre no modo IA: acha o nome de uma rota na resposta do agente. */
export function routeFromAnswer(spec: FlowSpec, answer: string): string {
  const a = answer.trim().toLowerCase();
  const routes = spec.routes ?? [];
  return (routes.find((r) => a === r.label.trim().toLowerCase()) ?? routes.find((r) => r.label.trim() && a.includes(r.label.trim().toLowerCase())))?.id ?? "else";
}

const isFlow = (n?: CanvasNode) => n?.kind === "flow" && !!n.element?.flow;
const handleOf = (e: CanvasEdge) => e.sourceHandle || "out";

/** Revezamento da Gravidade: guarda a vez de cada astro entre execuções. */
const turns = new Map<string, number>();

export async function runFlow(canvas: CanvasState, startId: string, deps: FlowDeps, input?: string): Promise<void> {
  const start = canvas.nodes.find((n) => n.id === startId);
  if (!isFlow(start)) throw new Error("Comece o fluxo por um astro.");
  const laps = new Map<string, number>();
  let steps = 0;

  const out = (id: string) => canvas.edges.filter((e) => e.source === id);
  const nodeOf = (id: string) => canvas.nodes.find((n) => n.id === id);
  // Somente entradas alcançáveis a partir deste início participam da coleta.
  const reachable = new Set<string>();
  const pendingIds = [startId];
  while (pendingIds.length) {
    const id = pendingIds.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    if (isFlow(nodeOf(id))) pendingIds.push(...out(id).map((e) => e.target));
  }
  const joins = new Map<string, Map<string, FlowItem>>();
  const emitted = new Set<string>();
  const incoming = (id: string) => canvas.edges.filter((e) => e.target === id && reachable.has(e.source) && isFlow(nodeOf(e.source)));
  const stopped = () => deps.signal?.aborted || deps.stopped?.();

  const visit = async (node: CanvasNode, item: FlowItem, arrival?: CanvasEdge): Promise<void> => {
    if (stopped()) {
      deps.status({ nodeId: node.id, state: "error", done: 0, total: 0, message: "Parado antes deste passo.", at: Date.now() });
      return;
    }
    if (++steps > MAX_STEPS) {
      deps.status({ nodeId: node.id, state: "error", done: 0, total: 0, message: `Parou: mais de ${MAX_STEPS} passos (veja as Órbitas).`, at: Date.now() });
      return;
    }
    if (node.kind === "terminal") {
      await deps.deliver(node.id, item.entrada).catch(() => {});
      return;
    }
    if (node.kind === "file" && node.element?.openOnFlow) {
      try {
        deps.status({ nodeId: node.id, state: "running", done: 0, total: 0, at: Date.now() });
        if (!deps.action) throw new Error("Abertura de aplicativos indisponível.");
        await deps.action(node, item);
        if (stopped()) throw new Error("Fluxo parado.");
        deps.status({ nodeId: node.id, state: "ok", done: 1, total: 1, message: "Abertura solicitada ao sistema", at: Date.now() });
      } catch (e) { deps.status({ nodeId: node.id, state: "error", done: 0, total: 0, message: (e as Error).message, at: Date.now() }); }
      return;
    }
    if (!isFlow(node)) return;
    const spec = node.element!.flow!;
    const report = (state: FlowStatus["state"], message?: string, done = 0, total = 0) => deps.status({ nodeId: node.id, state, done, total, message, at: Date.now() });
    let next = item;
    let take: (e: CanvasEdge) => boolean = (e) => handleOf(e) === "out";
    try {
      switch (spec.type) {
        case "transform":
          report("running");
          if (!spec.transform) throw new Error("Configure a transformação.");
          next = transformData(spec.transform, item);
          report("ok");
          break;
        case "request":
        case "launch":
        case "code":
          report("running");
          if (!deps.action) throw new Error("Ação indisponível.");
          next = await deps.action(node, item);
          if (stopped()) throw new Error("Fluxo parado.");
          if (spec.type === "launch" && spec.launch?.targetId) take = e => handleOf(e) === "out" && e.target !== spec.launch?.targetId;
          report("ok");
          break;
        case "convergence": {
          if (emitted.has(node.id)) return;
          const descendants = out(node.id).map((e) => e.target);
          const checked = new Set<string>();
          while (descendants.length) {
            const id = descendants.pop()!;
            if (id === node.id) throw new Error("Use a Convergência fora de ciclos: a coleta acontece uma vez por execução.");
            if (checked.has(id)) continue;
            checked.add(id);
            if (isFlow(nodeOf(id))) descendants.push(...out(id).map((e) => e.target));
          }
          const expected = incoming(node.id);
          if (!arrival || !expected.length) throw new Error("Comece por um astro anterior e ligue as entradas da Convergência.");
          const mode = spec.joinMode ?? "all";
          if (!["all", "first", "count"].includes(mode)) throw new Error("Modo de Convergência inválido.");
          const required = mode === "first" ? 1 : mode === "count" ? spec.joinCount ?? 2 : expected.length;
          if (!Number.isInteger(required) || required < 1 || required > expected.length) throw new Error(`Escolha uma quantidade entre 1 e ${expected.length}.`);
          const collected = joins.get(node.id) ?? new Map<string, FlowItem>();
          collected.set(arrival.id, item);
          joins.set(node.id, collected);
          const missing = expected.filter((e) => !collected.has(e.id)).map((e) => nodeOf(e.source)?.element?.title ?? e.source);
          if (collected.size < required) {
            report("running", `Recebidos ${collected.size}/${required}. Faltam: ${missing.join(", ")}`, collected.size, required);
            return;
          }
          emitted.add(node.id);
          const results = expected.filter((e) => collected.has(e.id)).map((e) => ({ astro: nodeOf(e.source)?.element?.title ?? e.source, entrada: collected.get(e.id)!.entrada }));
          next = { entrada: results.map((r) => `${r.astro}:\n${r.entrada}`).join("\n\n"), vars: { ...item.vars, resultados: JSON.stringify(results) } };
          report("ok", `Reunidos ${collected.size}/${required}`, collected.size, required);
          break;
        }
        case "chronos":
        case "wait": {
          const cron = spec.type === "chronos" ? spec.chronos ?? { mode: "delay" as const, value: 10, unit: "seconds" as const } : undefined;
          if (cron) validateChronos(cron);
          if (cron) take = e => handleOf(e) === "continue" || handleOf(e) === "out";
          if (cron && cron.mode !== "delay" && cron.mode !== "signal") {
            next = { ...item, vars: { ...item.vars, continue: "true" } };
            next.entrada = fill(cron.output ?? "{{entrada}}", next);
            report("ok", "Condição temporal atendida");
            break;
          }
          if (cron ? cron.mode === "signal" : spec.waitMode === "signal") {
            const timeout = cron?.timeoutSeconds ?? spec.timeoutSeconds ?? 3600;
            if (!Number.isFinite(timeout) || timeout < 1 || timeout > 604800) throw new Error("O limite do sinal deve ficar entre 1 segundo e 7 dias.");
            if (!deps.waitForSignal) throw new Error("Espera por sinal indisponível.");
            report("running", `Aguardando sinal: ${cron?.signalName?.trim() || spec.signalName?.trim() || "Continuar"}`);
            const received = await deps.waitForSignal(node.id, timeout);
            if (received !== undefined) next = { entrada: received, vars: { ...item.vars, sinal: received } };
          } else {
            const seconds = cron ? chronosSeconds(cron) : spec.waitSeconds ?? 30;
            if (!Number.isFinite(seconds) || seconds < 0 || seconds > (cron ? 365 * 86400 : 604800)) throw new Error("A duração da espera está fora do intervalo permitido.");
            const until = Date.now() + seconds * 1000;
            let last = -1;
            while (Date.now() < until) {
              if (stopped()) throw new Error("Espera cancelada: fluxo parado.");
              const remaining = Math.ceil((until - Date.now()) / 1000);
              if (remaining !== last) report("running", `Faltam ${remaining} s`, Math.floor(seconds - remaining), Math.ceil(seconds));
              last = remaining;
              await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(1, until - Date.now()))));
            }
          }
          if (stopped()) throw new Error("Espera cancelada: fluxo parado.");
          if (cron) {
            next = { ...next, vars: { ...next.vars, continue: "true" } };
            next.entrada = fill(cron.output ?? "{{entrada}}", next);
          }
          report("ok", "Espera concluída");
          break;
        }
        case "approval": {
          if (!deps.approve) throw new Error("Aprovação indisponível. Abra o Zênite.");
          report("running", "Aguardando sua aprovação");
          const approved = await deps.approve(node, fill(spec.approvalMessage || "Autorizar a próxima etapa?", item), item.entrada,
            out(node.id).filter((e) => handleOf(e) === "approved").map((e) => nodeOf(e.target)).filter((n): n is CanvasNode => !!n));
          if (stopped()) throw new Error("Aprovação cancelada: fluxo parado.");
          take = (e) => handleOf(e) === (approved ? "approved" : "rejected");
          report("ok", approved ? "Aprovado pelo usuário" : "Recusado pelo usuário");
          break;
        }
        case "ignition":
          report("ok");
          break;
        case "satellite": {
          if (!spec.prompt?.trim()) throw new Error("Escreva o prompt do satélite.");
          report("running");
          const r = await deps.runAgent(spec, fill(spec.prompt, item), node.id);
          if (!r.ok) throw new Error(r.error);
          next = { entrada: r.text, vars: { ...item.vars, resposta: r.text } };
          report("ok");
          break;
        }
        case "thruster": {
          if (!spec.script?.trim()) throw new Error("Escreva o script.");
          report("running");
          const r = await deps.runScript(fill(spec.script, item));
          if (!r.ok) throw new Error(r.error);
          next = { entrada: r.text, vars: { ...item.vars, saida: r.text } };
          report("ok");
          break;
        }
        case "gemini": {
          const yes = matches(spec.condition ?? { op: "filled" }, item);
          take = (e) => handleOf(e) === (yes ? "a" : "b");
          report("ok", yes ? "Caminho A" : "Caminho B");
          break;
        }
        case "tower": {
          // Classificar e executar: os termos decidem de graça; a IA só entra quando nenhum bateu.
          let route = spec.decide === "agent" ? "else" : pickRoute(spec, item.entrada);
          if (spec.decide === "agent" || (spec.decide === "execute" && route === "else")) {
            report("running");
            const r = await deps.runAgent(spec, towerPrompt(spec, item), node.id);
            if (!r.ok) throw new Error(r.error);
            route = routeFromAnswer(spec, r.text);
          }
          const chosen = spec.routes?.find((r) => r.id === route);
          const label = chosen?.label || "Outros";
          take = (e) => handleOf(e) === route;
          const runs = spec.decide === "execute" && !!chosen?.run?.agent;
          if (runs) {
            report("running", `${label}: executando`);
            const r = await deps.runAgent(routeSpec(chosen!.run!, deps), fill(chosen!.run!.prompt?.trim() || "{{entrada}}", item), node.id);
            if (!r.ok) throw new Error(`${label}: ${r.error}`);
            next = { entrada: r.text, vars: { ...item.vars, resposta: r.text, rota: label } };
          }
          // Quem pediu (zn flow run) recebe a resposta quando a rota não continua no canvas.
          if (spec.decide === "execute" && deps.replyTo && !out(node.id).some(take)) {
            const text = runs ? next.entrada : route === "else" ? "Nenhuma rota serve para este pedido. Pergunte ao usuário como seguir." : `Rota "${label}" escolhida, mas ela não tem executor nem continuação.`;
            await deps.deliver(deps.replyTo, `[Torre "${node.element!.title}" · ${label}]\n${text}`).catch(() => {});
          }
          report("ok", label);
          break;
        }
        case "gravity": {
          const edges = out(node.id);
          if (!edges.length) throw new Error("Ligue os caminhos que vão dividir o trabalho.");
          const ok = spec.strategy === "quota" ? edges.filter((e) => { const t = nodeOf(e.target); return !t?.element?.flow || t.element.flow.type !== "satellite" || deps.hasQuota(t.element.flow); }) : edges;
          if (!ok.length) throw new Error("Todas as contas ligadas estão com o limite esgotado.");
          const turn = turns.get(node.id) ?? 0;
          const chosen = ok[turn % ok.length];
          turns.set(node.id, turn + 1);
          take = (e) => e.id === chosen.id;
          report("ok", nodeOf(chosen.target)?.element?.title ?? nodeOf(chosen.target)?.terminal?.title);
          break;
        }
        case "orbit": {
          const lap = (laps.get(node.id) ?? 0) + 1;
          laps.set(node.id, lap);
          const max = Math.max(1, spec.times ?? 3);
          const stop = (spec.until && matches(spec.until, item)) || lap >= max;
          next = { ...item, vars: { ...item.vars, volta: String(lap) } };
          if (stop) laps.delete(node.id);
          take = (e) => handleOf(e) === (stop ? "done" : "loop");
          report(stop ? "ok" : "running", stop ? `Terminou na volta ${lap}` : `Volta ${lap} de ${max}`, lap, max);
          break;
        }
      }
    } catch (e) {
      report("error", (e as Error).message);
      // Se todos os ramos falharem antes da junção, ela também deve explicar por que não continuou.
      const blocked = out(node.id).map((edge) => edge.target);
      const checked = new Set<string>([node.id]);
      while (blocked.length) {
        const id = blocked.pop()!;
        if (checked.has(id)) continue;
        checked.add(id);
        const target = nodeOf(id);
        if (!isFlow(target)) continue;
        if (target!.element!.flow!.type === "convergence" && !emitted.has(id) && !joins.has(id)) joins.set(id, new Map());
        blocked.push(...out(id).map((edge) => edge.target));
      }
      return;
    }
    await Promise.all(out(node.id).filter(take).map(async (e) => {
      const target = nodeOf(e.target);
      if (!target) return;
      if (deps.link) {
        // Acende a ligação e espera o pulso atravessá-la antes de o próximo passo começar.
        deps.link(node.id, target.id);
        await new Promise((resolve) => setTimeout(resolve, LINK_TRAVEL_MS));
      }
      await visit(target, { entrada: next.entrada, vars: { ...next.vars } }, e);
    }));
  };

  // Sem texto (▶, relógio ou zn flow run sem texto): usa o texto inicial do astro.
  await visit(start!, { entrada: input || start!.element!.flow!.input || "", vars: {} });
  for (const [id, collected] of joins) {
    if (emitted.has(id)) continue;
    const missing = incoming(id).filter((e) => !collected.has(e.id)).map((e) => nodeOf(e.source)?.element?.title ?? e.source);
    deps.status({ nodeId: id, state: "error", done: collected.size, total: incoming(id).length,
      message: `Coleta incompleta. Caminhos sem resposta (falha ou não executados): ${missing.join(", ")}`, at: Date.now() });
  }
}

/** A Ignição deve disparar agora? lastRun = última vez que rodou sozinha (ms). */
export function ignitionDue(spec: FlowSpec, lastRun: number, now: Date): boolean {
  if (spec.type !== "ignition") return false;
  if (spec.schedule === "interval") {
    const every = Math.max(1, spec.everyMinutes ?? 60) * 60_000;
    return now.getTime() - lastRun >= every;
  }
  if (spec.schedule === "daily") {
    const [h, m] = (spec.at ?? "09:00").split(":").map(Number);
    if (spec.days?.length && !spec.days.includes(now.getDay())) return false;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0).getTime();
    return now.getTime() >= today && lastRun < today;
  }
  return false;
}
