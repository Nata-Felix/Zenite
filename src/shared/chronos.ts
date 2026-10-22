import type { ChronosSpec, FlowSpec } from "./types";

export const TIME_UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
export function validateChronos(config: ChronosSpec): void {
  if (!["startup", "after-start", "interval", "daily", "date", "delay", "signal"].includes(config.mode)) throw new Error("Modo do Cronos inválido.");
  if (config.unit && !Object.prototype.hasOwnProperty.call(TIME_UNITS, config.unit)) throw new Error("Unidade de tempo inválida.");
  if (["delay", "after-start", "interval"].includes(config.mode)) chronosSeconds(config);
  if (config.mode === "signal" && (!Number.isFinite(config.timeoutSeconds ?? 3600) || (config.timeoutSeconds ?? 3600) < 1 || (config.timeoutSeconds ?? 3600) > 604800)) throw new Error("O limite do sinal deve ficar entre 1 segundo e 7 dias.");
  if (config.mode === "date" && !Number.isFinite(new Date(config.date ?? "").getTime())) throw new Error("Informe uma data e um horário válidos.");
  if (config.mode === "daily") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.at ?? "09:00")) throw new Error("Informe um horário válido no formato HH:MM.");
    if (config.days && (!Array.isArray(config.days) || config.days.some(d => !Number.isInteger(d) || d < 0 || d > 6))) throw new Error("Dias da semana inválidos.");
  }
}
export function chronosSeconds(config: ChronosSpec): number {
  const seconds = (config.value ?? 10) * TIME_UNITS[config.unit ?? "seconds"];
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 365 * 86400) throw new Error("A duração deve estar entre 0 segundos e 365 dias.");
  if (config.mode !== "delay" && seconds < 1) throw new Error("O intervalo mínimo é de 1 segundo.");
  return seconds;
}

/** Converte configurações anteriores sem alterar as conexões ou descartar a entrada. */
export function temporalSpec(spec: FlowSpec): FlowSpec {
  if (spec.type === "wait") return { ...spec, type: "chronos", chronos: spec.waitMode === "signal"
    ? { mode: "signal", signalName: spec.signalName, timeoutSeconds: spec.timeoutSeconds ?? 3600 }
    : { mode: "delay", value: spec.waitSeconds ?? 30, unit: "seconds" } };
  if (spec.type === "ignition" && (spec.schedule === "interval" || spec.schedule === "daily")) return { ...spec, type: "chronos", chronos: spec.schedule === "interval"
    ? { mode: "interval", value: spec.everyMinutes ?? 60, unit: "minutes" }
    : { mode: "daily", at: spec.at ?? "09:00", days: spec.days } };
  return spec;
}

/** Estado por sessão do aplicativo: não recupera execuções vencidas durante o fechamento. */
export class ChronosScheduler {
  private clocks = new Map<string, { key: string; start: number; last: number; fired: boolean }>();
  tick(id: string, spec: FlowSpec, now: Date): boolean {
    const config = spec.chronos;
    if (!config || spec.paused) { this.clocks.delete(id); return false; }
    validateChronos(config);
    if (config.mode === "delay" || config.mode === "signal") return false;
    const { output: _output, signalName: _signalName, ...timing } = config;
    const key = JSON.stringify(timing);
    let clock = this.clocks.get(id);
    const time = now.getTime();
    if (!clock || clock.key !== key) {
      clock = { key, start: time, last: time, fired: false };
      this.clocks.set(id, clock);
    }
    let due = false;
    if (config.mode === "startup") due = !clock.fired;
    if (config.mode === "after-start") due = !clock.fired && time - clock.start >= chronosSeconds(config) * 1000;
    if (config.mode === "interval") due = time - clock.last >= chronosSeconds(config) * 1000;
    if (config.mode === "date") {
      const target = new Date(config.date ?? "").getTime();
      if (!Number.isFinite(target)) throw new Error("Informe uma data e um horário válidos.");
      due = !clock.fired && clock.start < target && time >= target;
    }
    if (config.mode === "daily") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.at ?? "09:00")) throw new Error("Informe um horário válido no formato HH:MM.");
      const [h, m] = (config.at ?? "09:00").split(":").map(Number);
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
      due = (!config.days?.length || config.days.includes(now.getDay())) && clock.last < target && time >= target;
    }
    if (due) { clock.last = time; clock.fired = true; }
    return due;
  }
  retain(ids: Set<string>): void { for (const id of this.clocks.keys()) if (!ids.has(id)) this.clocks.delete(id); }
}
