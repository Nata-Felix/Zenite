import { spawn } from "node:child_process";
import { delimiter } from "node:path";
import type { InstallProgress } from "../shared/types";
import { wingetPath } from "./codeRuntime";
import { missingFrom, readPathNow } from "./freshPath";

const UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };

/**
 * Lê um trecho da saída do WinGet e diz em que fase está. O WinGet redesenha a barra com \r e
 * gira um spinner com \b; aqui só interessa a última informação útil. Entende inglês e português.
 */
export function parseWingetProgress(chunk: string): Partial<InstallProgress> | null {
  const text = chunk.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/[\b]/g, "");
  let found: Partial<InstallProgress> | null = null;
  for (const raw of text.split(/[\r\n]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const bytes = /([\d.,]+)\s*(B|KB|MB|GB)\s*\/\s*([\d.,]+)\s*(B|KB|MB|GB)/i.exec(line);
    const percent = /(\d{1,3})\s*%/.exec(line);
    if (bytes) {
      const done = Number(bytes[1].replace(",", ".")) * UNITS[bytes[2].toUpperCase()];
      const total = Number(bytes[3].replace(",", ".")) * UNITS[bytes[4].toUpperCase()];
      found = { phase: "baixando", percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : undefined };
    } else if (/^(Downloading|Baixando)\b/i.test(line)) found = { phase: "baixando" };
    else if (/Starting package install|Iniciando (a )?instala/i.test(line)) found = { phase: "instalando" };
    else if (/Successfully installed|Instalad[oa] com (ê|e)xito/i.test(line)) found = { phase: "concluido", percent: 100 };
    // Percentual sem tamanho aparece no download e também em alguns instaladores; vale para a fase atual.
    else if (percent && /[█▒]/.test(line)) found = { ...(found ?? {}), percent: Math.min(100, Number(percent[1])) };
  }
  return found;
}

/** Junta a leitura nova ao estado atual; devolve o mesmo objeto quando nada mudou (não precisa avisar). */
export function nextProgress(state: InstallProgress, read: Partial<InstallProgress> | null): InstallProgress {
  if (!read) return state;
  // Mudar de fase zera o percentual: o da instalação não continua o do download.
  const merged: InstallProgress = read.phase && read.phase !== state.phase ? { phase: read.phase, percent: read.percent } : { ...state, ...read };
  return merged.phase === state.phase && merged.percent === state.percent ? state : merged;
}

/** Instala um pacote pelo WinGet, avisando cada mudança de fase ou percentual. */
export function wingetInstall(id: string, onProgress: (progress: InstallProgress) => void, timeout = 30 * 60_000): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== "win32") return Promise.resolve({ ok: false, error: "Instale pelo gerenciador de pacotes do sistema e tente novamente." });
  const winget = wingetPath();
  if (!winget) return Promise.resolve({ ok: false, error: "O WinGet não está disponível. Instale o Instalador de Aplicativo do Windows (Microsoft Store) e tente novamente." });
  return new Promise(resolve => {
    let state: InstallProgress = { phase: "preparando" };
    let output = "";
    onProgress(state);
    const child = spawn(winget, ["install", "--id", id, "--exact", "--source", "winget", "--silent", "--no-upgrade", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { windowsHide: true });
    const timer = setTimeout(() => child.kill(), timeout);
    const read = (data: Buffer) => {
      const chunk = data.toString("utf8");
      output = (output + chunk).slice(-8000);
      const next = nextProgress(state, parseWingetProgress(chunk));
      if (next === state) return;
      state = next;
      onProgress(state);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", error => { clearTimeout(timer); resolve({ ok: false, error: error.message }); });
    child.on("close", code => {
      clearTimeout(timer);
      readPathNow();
      // O processo principal também procura git e docker pelo PATH: sem isso, só reabrindo o Zênite.
      const extra = missingFrom(process.env.PATH ?? "");
      if (extra.length) process.env.PATH = [process.env.PATH ?? "", ...extra].join(delimiter);
      if (code === 0) return resolve({ ok: true });
      const clean = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/[\b]./g, "").split(/[\r\n]+/).filter(l => l.trim() && !/[█▒]/.test(l)).join("\n").trim();
      resolve({ ok: false, error: (clean || `O WinGet terminou com o código ${code}.`).slice(-1000) });
    });
  });
}
