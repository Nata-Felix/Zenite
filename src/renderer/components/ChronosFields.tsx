import type { ChronosSpec, FlowSpec } from "../../shared/types";
import { TIME_UNITS } from "../../shared/chronos";

const MODES: { value: ChronosSpec["mode"]; label: string }[] = [
  { value: "startup", label: "Executar ao iniciar o Zênite" },
  { value: "after-start", label: "Executar após atraso de inicialização" },
  { value: "interval", label: "Executar em intervalo recorrente" },
  { value: "daily", label: "Executar em horário recorrente" },
  { value: "date", label: "Executar em data e horário específicos" },
  { value: "delay", label: "Aguardar duração após receber uma entrada" },
  { value: "signal", label: "Aguardar recebimento de sinal" },
];
const UNITS = { seconds: "Segundos", minutes: "Minutos", hours: "Horas", days: "Dias" };
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function chronosSummary(config?: ChronosSpec): string {
  const c = config ?? { mode: "delay", value: 10, unit: "seconds" };
  const duration = `${c.value ?? 10} ${(UNITS[c.unit ?? "seconds"] ?? "Segundos").toLowerCase()}`;
  if (c.mode === "startup") return "Execução na inicialização";
  if (c.mode === "after-start") return `Após ${duration} da inicialização`;
  if (c.mode === "interval") return `Intervalo: ${duration}`;
  if (c.mode === "daily") return `Horário: ${c.at ?? "09:00"}${c.days?.length ? ` · ${c.days.map(d => DAYS[d]).join(", ")}` : " · diariamente"}`;
  if (c.mode === "date") return c.date?.replace("T", " · ") ?? "Data e horário não definidos";
  if (c.mode === "signal") return `Aguardando sinal: ${c.signalName || "Continuar"}`;
  return `Atraso após entrada: ${duration}`;
}
export function ChronosFields({ draft, set }: { draft: FlowSpec; set(patch: Partial<FlowSpec>): void }) {
  const c = draft.chronos ?? { mode: "delay", value: 10, unit: "seconds" };
  const update = (patch: Partial<ChronosSpec>) => set({ chronos: { ...c, ...patch } });
  const timed = ["after-start", "interval", "delay"].includes(c.mode);
  const automatic = c.mode !== "delay" && c.mode !== "signal";
  return <>
    <label>Modo de execução<select value={c.mode} onChange={e => update({ mode: e.target.value as ChronosSpec["mode"] })}>{MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
    {timed && <div className="flow-row">
      <label>{c.mode === "interval" ? "Intervalo" : "Duração"}<input type="number" required min={c.mode === "delay" ? 0 : 1 / TIME_UNITS[c.unit ?? "seconds"]} max={365 * 86400 / TIME_UNITS[c.unit ?? "seconds"]} step="any" value={c.value ?? 10} onChange={e => update({ value: Number(e.target.value) })} /></label>
      <label>Unidade<select value={c.unit ?? "seconds"} onChange={e => update({ unit: e.target.value as ChronosSpec["unit"] })}>{Object.entries(UNITS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>}
    {c.mode === "daily" && <>
      <label>Horário local<input type="time" required value={c.at ?? "09:00"} onChange={e => update({ at: e.target.value })} /></label>
      <div className="flow-days" role="group" aria-label="Dias da semana">{DAYS.map((d, i) => <button type="button" key={d} className={`ghost small${c.days?.includes(i) ? " on" : ""}`} aria-pressed={c.days?.includes(i) ?? false} onClick={() => update({ days: c.days?.includes(i) ? c.days.filter(v => v !== i) : [...(c.days ?? []), i].sort() })}>{d}</button>)}</div>
      <p className="dialog-hint">Sem dias selecionados, a execução ocorre diariamente.</p>
    </>}
    {c.mode === "date" && <label>Data e horário local<input type="datetime-local" required value={c.date ?? ""} onChange={e => update({ date: e.target.value })} /></label>}
    {c.mode === "signal" && <>
      <label>Identificador do sinal<input value={c.signalName ?? ""} placeholder="Continuar" onChange={e => update({ signalName: e.target.value })} /></label>
      <label>Tempo limite (segundos)<input type="number" required min={1} max={604800} value={c.timeoutSeconds ?? 3600} onChange={e => update({ timeoutSeconds: Number(e.target.value) })} /></label>
      <p className="dialog-hint">Envie o sinal pelo botão do astro ou pelo comando zn flow signal. O identificador é descritivo; o sinal é direcionado ao astro.</p>
    </>}
    {automatic && <label className="flow-check"><input type="checkbox" checked={draft.paused ?? false} onChange={e => set({ paused: e.target.checked })} /> Suspender disparos automáticos</label>}
    <label>Conteúdo da saída<textarea rows={3} value={c.output ?? "{{entrada}}"} onChange={e => update({ output: e.target.value })} /></label>
    <p className="dialog-hint">A saída Continuar é emitida após a condição configurada. {"{{entrada}}"} preserva a entrada; {"{{continue}}"} retorna true. Nos modos automáticos, a entrada inicial é definida abaixo.</p>
    {automatic && <label>Entrada inicial<textarea rows={2} value={draft.input ?? ""} onChange={e => set({ input: e.target.value })} /></label>}
    <p className="dialog-hint">Agendamentos usam o horário local do computador e são verificados a cada segundo em todas as galáxias. O Zênite deve permanecer aberto. Ao reabrir, os intervalos reiniciam e execuções vencidas não são recuperadas. O modo de inicialização também dispara uma vez ao ativar um novo Cronos.</p>
  </>;
}
