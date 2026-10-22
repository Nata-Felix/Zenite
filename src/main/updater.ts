import { app, ipcMain, net, type BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { spawn } from "node:child_process";
import { join } from "node:path";
// O fs comum do Electron trata app.asar como pasta; aqui ele precisa ser um arquivo qualquer.
import * as ofs from "original-fs";
import { htmlToMarkdown } from "../shared/releaseNotes";
import type { UpdateState } from "../shared/types";
import { APP_FILES, chooseLight, extractPackage, startProcessCommand, SWAP_SCRIPT, verifyPackage, type AppUpdateManifest } from "./appUpdate";

const CHECK_EVERY = 4 * 60 * 60 * 1000;
const POWERSHELL = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

let installing = false;
/** O app está fechando para instalar a atualização (não perguntar "Fechar o Zênite?"). */
export const isInstallingUpdate = () => installing;

/** Notas da versão em Markdown: o latest.yml já traz Markdown; o feed do GitHub traz HTML. */
export function notesToMarkdown(notes: UpdateInfo["releaseNotes"]): string {
  const raw = Array.isArray(notes) ? notes.map((n) => n.note ?? "").join("\n") : (notes ?? "");
  return /<\/?[a-z][^>]*>/i.test(raw) ? htmlToMarkdown(raw) : raw.trim();
}

/**
 * Onde ficam os Releases. Fixo no código: a atualização leve troca só o app.asar e mantém o
 * app-update.yml antigo da instalação, que até a 0.28 apontava para Nata-Felix/zenite-releases.
 */
const RELEASES = { owner: "Nata-Felix", repo: "O" };

/** Pasta de uma versão no Release. ZENITE_UPDATE_FEED aponta para um servidor local nos testes. */
function releaseBase(version: string): string {
  const feed = process.env.ZENITE_UPDATE_FEED;
  if (feed) return feed.replace(/\/?$/, "/");
  return `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/download/v${version}/`;
}

/**
 * Atualização pelo GitHub Releases: baixa em segundo plano e instala ao sair do app, ou na hora
 * se o usuário pedir. Só roda no app instalado; em `npm start` fica parado.
 *
 * Se a versão nova usa o mesmo Electron, baixa só os arquivos do app (app-update.json +
 * app-<versão>.tar.gz, ~5 MB) e troca app.asar/app.asar.unpacked com um processo auxiliar
 * quando o app fecha. Em qualquer outro caso, ou se algo falhar, usa o instalador completo.
 */
export function startUpdater(getWin: () => BrowserWindow | null): void {
  let state: UpdateState = { current: app.getVersion(), status: app.isPackaged ? "idle" : "dev" };
  const set = (changes: Partial<UpdateState>) => {
    state = { ...state, ...changes };
    getWin()?.webContents.send("update:state", state);
  };
  const base = join(app.getPath("userData"), "app-update");
  const resultFile = join(base, "result.json");
  const log = (msg: string) => {
    try {
      ofs.mkdirSync(base, { recursive: true });
      const file = join(base, "updater.log");
      if (ofs.existsSync(file) && ofs.statSync(file).size > 64 * 1024) ofs.rmSync(file);
      ofs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
    } catch {
      // Log é só para diagnóstico.
    }
  };
  /** Arquivos novos já extraídos, esperando o app fechar. */
  let staged: { version: string; dir: string } | null = null;
  let swapStarted = false;

  ipcMain.handle("update:get", () => state);
  ipcMain.handle("update:check", () => check());
  ipcMain.on("update:install", () => {
    if (state.status !== "ready") return;
    installing = true;
    if (staged) void startSwap(true).then(() => app.quit());
    else autoUpdater.quitAndInstall(true, true);
  });

  if (!app.isPackaged) return;

  const failedVersion = cleanUp();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => set({ status: "checking", error: undefined }));
  autoUpdater.on("update-not-available", () => set({ status: "idle", checkedAt: Date.now() }));
  autoUpdater.on("update-available", (info) => void onAvailable(info));
  autoUpdater.on("download-progress", (p) => set({ status: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => set({ status: "ready", version: info.version, light: false, notes: notesToMarkdown(info.releaseNotes), checkedAt: Date.now() }));
  autoUpdater.on("error", (err) => {
    // Repositório ainda sem nenhum Release publicado: não é erro, só não há versão nova.
    if (/\b404\b|No published versions/i.test(err.message)) set({ status: "idle", checkedAt: Date.now() });
    else set({ status: "error", error: err.message.split("\n")[0] });
  });
  // Saiu sem "Reiniciar agora": troca os arquivos e não reabre.
  app.on("will-quit", (e) => {
    if (!staged || swapStarted) return;
    e.preventDefault();
    void startSwap(false).then(() => app.quit());
  });

  async function onAvailable(info: UpdateInfo): Promise<void> {
    const fullSize = info.files?.[0]?.size;
    set({ status: "downloading", version: info.version, percent: 0, light: undefined, size: fullSize });
    try {
      if (await downloadLight(info)) return;
    } catch (e) {
      log(`atualização leve falhou, indo para o instalador completo: ${(e as Error).message}`);
    }
    staged = null;
    // Num teste com servidor local, o instalador completo instalaria por cima do Zênite de verdade
    // (ele vai para a pasta registrada no Windows, não para a cópia em teste).
    if (process.env.ZENITE_UPDATE_FEED) {
      set({ status: "error", light: false, error: "instalador completo desligado com ZENITE_UPDATE_FEED (teste)" });
      return;
    }
    set({ status: "downloading", light: false, size: fullSize, percent: 0 });
    autoUpdater.downloadUpdate().catch(() => {
      // O evento "error" já atualizou o estado.
    });
  }

  /** Tenta a atualização leve. false = não se aplica (usa o instalador completo). */
  async function downloadLight(info: UpdateInfo): Promise<boolean> {
    if (process.platform !== "win32") return false;
    const root = releaseBase(info.version);
    const res = await net.fetch(root + "app-update.json", { cache: "no-store" });
    if (!res.ok) {
      log(`sem app-update.json para ${info.version} (HTTP ${res.status})`);
      return false;
    }
    const manifest = (await res.json()) as AppUpdateManifest;
    const decision = chooseLight(manifest, {
      version: info.version,
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      writable: canWrite(process.resourcesPath),
      failedVersion,
    });
    log(`${info.version}: ${decision.light ? "leve" : "completa"} (${decision.reason})`);
    if (!decision.light) return false;

    set({ light: true, size: manifest.size, percent: 0 });
    const data = await download(root + manifest.url, manifest.size);
    if (!verifyPackage(data, manifest)) throw new Error("o pacote baixado não confere com o sha512 do app-update.json");
    const dir = join(base, info.version);
    ofs.rmSync(dir, { recursive: true, force: true });
    extractPackage(data, dir, ofs);
    for (const f of APP_FILES) if (!ofs.existsSync(join(dir, f))) throw new Error(`falta ${f} no pacote`);
    staged = { version: info.version, dir };
    set({ status: "ready", version: info.version, light: true, size: manifest.size, notes: notesToMarkdown(info.releaseNotes), checkedAt: Date.now() });
    return true;
  }

  async function download(url: string, size: number): Promise<Buffer> {
    const res = await net.fetch(url, { cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      got += value.length;
      if (got > size) throw new Error("o pacote baixado é maior que o esperado");
      set({ percent: Math.round((got / size) * 100) });
    }
    return Buffer.concat(chunks);
  }

  /**
   * Abre o processo auxiliar que espera o app fechar e troca os arquivos. Ele precisa sobreviver
   * ao app: o Node põe os filhos num job do Windows que morre junto com o pai, e um PowerShell
   * aberto com detached sai sem rodar nada (fica sem console). Então um PowerShell de partida abre
   * o auxiliar com Start-Process (o neto fica fora do job); o app espera só esse de partida.
   */
  function startSwap(relaunch: boolean): Promise<void> {
    if (!staged || swapStarted) return Promise.resolve();
    swapStarted = true;
    const { version, dir } = staged;
    return new Promise((done) => {
      try {
        const script = join(base, "swap.ps1");
        ofs.writeFileSync(script, SWAP_SCRIPT);
        const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-AppPid", String(process.pid), "-Resources", process.resourcesPath];
        args.push("-Staged", dir, "-Exe", process.execPath, "-Relaunch", relaunch ? "1" : "0", "-Result", resultFile, "-Version", version);
        const boot = spawn(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", startProcessCommand(POWERSHELL, args)], { stdio: "ignore", windowsHide: true });
        const timer = setTimeout(done, 15_000);
        const finish = (how: string) => {
          clearTimeout(timer);
          log(`troca dos arquivos para ${version} agendada (reabrir: ${relaunch}; partida: ${how})`);
          done();
        };
        boot.on("exit", (code) => finish(`saiu com ${code}`));
        boot.on("error", (e) => finish(`erro ${e.message}`));
      } catch (e) {
        log(`não consegui abrir o processo de troca: ${(e as Error).message}`);
        done();
      }
    });
  }

  /** Lê o resultado da última troca e apaga sobras. Devolve a versão cuja troca falhou. */
  function cleanUp(): string | undefined {
    let failed: string | undefined;
    try {
      if (ofs.existsSync(resultFile)) {
        const r = JSON.parse(ofs.readFileSync(resultFile, "utf8").replace(/^﻿/, "")) as { ok: boolean; version: string; error?: string };
        log(`última troca (${r.version}): ${r.ok ? "ok" : `falhou: ${r.error}`}`);
        // Falhou para a versão que já está instalada (veio pelo instalador completo): esquece.
        if (!r.ok && r.version !== app.getVersion()) failed = r.version;
        else ofs.rmSync(resultFile);
      }
      for (const name of ofs.existsSync(base) ? ofs.readdirSync(base) : []) {
        if (ofs.statSync(join(base, name)).isDirectory()) ofs.rmSync(join(base, name), { recursive: true, force: true });
      }
    } catch (e) {
      log(`limpeza: ${(e as Error).message}`);
    }
    return failed;
  }

  async function check(): Promise<UpdateState> {
    if (!app.isPackaged || state.status === "downloading" || state.status === "ready") return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // O evento "error" já atualizou o estado.
    }
    return state;
  }

  if (process.env.ZENITE_UPDATE_FEED) {
    autoUpdater.setFeedURL({ provider: "generic", url: process.env.ZENITE_UPDATE_FEED });
    autoUpdater.autoInstallOnAppQuit = false;
  } else autoUpdater.setFeedURL({ provider: "github", ...RELEASES, releaseType: "release" });
  setTimeout(() => void check(), 10_000);
  setInterval(() => void check(), CHECK_EVERY);
}

/** Dá para criar arquivos na pasta? (instalação por máquina em Arquivos de Programas não dá) */
function canWrite(dir: string): boolean {
  const probe = join(dir, `.zenite-write-test-${process.pid}`);
  try {
    ofs.writeFileSync(probe, "");
    ofs.rmSync(probe);
    return true;
  } catch {
    return false;
  }
}
