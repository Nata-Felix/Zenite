import { randomUUID } from "node:crypto";
import { remapBlackHoleMembers, withBlackHoleContents } from "../shared/blackHoles";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeKind, nodeTitle, storedEdge, type CanvasClipboardState, type CanvasEdge, type CanvasNode, type CanvasState, type CanvasTransferResult } from "../shared/types";
import type { ArchiveBatch } from "./canvasArchive";
import { ElementService, uniqueTitle } from "./elements";
import { WorkspaceStore } from "./workspaceStore";

interface Payload {
  version: 1;
  mode: "copy" | "cut";
  sourceCanvasId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  notes: Record<string, string>;
  tables: Record<string, string[][]>;
  pastes: number;
}

const emptyCanvas = (): CanvasState => ({ version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

/** Área de transferência do app. Recortes ficam guardados em disco até colar ou devolver. */
export class CanvasClipboard {
  private file: string;
  private payload: Payload | null = null;

  constructor(dataDir: string, private store: WorkspaceStore, private elements: ElementService) {
    this.file = join(dataDir, "canvas-clipboard.json");
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8")) as Payload;
      if (saved.version === 1 && ["copy", "cut"].includes(saved.mode) && Array.isArray(saved.nodes) && saved.nodes.length) this.payload = saved;
    } catch { /* Primeiro uso: não há área de transferência salva. */ }
  }

  state(): CanvasClipboardState | null {
    const p = this.payload;
    return p ? { mode: p.mode, count: p.nodes.length, sourceCanvasId: p.sourceCanvasId } : null;
  }

  capture(canvasId: string, state: CanvasState, ids: string[], mode: "copy" | "cut"): CanvasTransferResult {
    this.adopt(canvasId, state);
    const wanted = withBlackHoleContents(state.nodes, ids);
    const chosen = state.nodes.filter((n) => wanted.has(n.id));
    if (!chosen.length) throw new Error("Selecione um elemento do canvas primeiro.");
    // Prepara todos os dados antes de mexer no recorte anterior ou no canvas de origem.
    const next: Payload = { version: 1, mode, sourceCanvasId: canvasId, nodes: structuredClone(chosen), edges: [], notes: {}, tables: {}, pastes: 0 };
    try {
      for (const n of next.nodes) {
        if (nodeKind(n) === "note") next.notes[n.id] = this.elements.readNote(n.id);
        if (nodeKind(n) === "table") next.tables[n.id] = this.elements.readTable(n.id);
        if (mode === "copy" && (n.kind === "image" || n.kind === "video") && n.element?.file) {
          const file = this.elements.duplicateMedia(n.element.file);
          if (!file) throw new Error(`Não foi possível copiar a mídia de "${nodeTitle(n)}".`);
          // O snapshot não depende da mídia original continuar no canvas.
          n.element.file = file;
        }
      }
    } catch (error) {
      // Só apaga as cópias que já foram criadas, nunca a mídia da origem.
      for (const n of next.nodes) {
        const original = chosen.find((o) => o.id === n.id);
        if (n.element?.file && n.element.file !== original?.element?.file) this.elements.cleanup(n);
      }
      throw error;
    }
    if (mode === "copy") next.edges = structuredClone(state.edges.filter((e) => wanted.has(e.source) && wanted.has(e.target)));
    const restoredCanvasId = this.releasePrevious();
    this.persist(next);
    let current = this.current(canvasId);
    if (mode === "cut") {
      current = this.write(canvasId, {
        ...current,
        nodes: current.nodes.filter((n) => !wanted.has(n.id)),
        edges: current.edges.filter((e) => !wanted.has(e.source) && !wanted.has(e.target)),
      });
    }
    return { ok: true, state: current, inserted: [], clipboard: this.state(), restoredCanvasId };
  }

  paste(canvasId: string, state: CanvasState, at: { x: number; y: number }): CanvasTransferResult {
    this.adopt(canvasId, state);
    const p = this.payload;
    if (!p) throw new Error("Copie ou recorte um elemento do canvas antes de colar.");
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) throw new Error("A posição para colar não é válida.");
    const current = this.current(canvasId);
    const names = current.nodes.map(nodeTitle);
    const copies: CanvasNode[] = [];
    const ids = new Map<string, string>();
    const allIds = new Set(this.store.places().flatMap((place) => this.store.loadCanvas(place.canvasId)?.nodes.map((n) => n.id) ?? []));
    if (p.mode === "cut" && p.nodes.some((n) => allIds.has(n.id))) throw new Error("Um elemento recortado já está em outro canvas. Use Desfazer recorte para recuperá-lo.");
    try {
      for (const original of p.nodes) {
        const n = structuredClone(original);
        const id = p.mode === "cut" ? n.id : randomUUID();
        ids.set(n.id, id);
        n.id = id;
        const title = uniqueTitle(`${nodeTitle(n)}${p.mode === "copy" ? " - cópia" : ""}`, names);
        names.push(title);
        if (n.terminal) n.terminal = { ...n.terminal, id, title };
        if (n.element) n.element = { ...n.element, id, title };
        if (p.mode === "copy" && (n.kind === "image" || n.kind === "video") && n.element?.file) {
          const file = this.elements.duplicateMedia(n.element.file);
          if (!file) throw new Error(`Não foi possível colar a mídia de "${nodeTitle(n)}".`);
          n.element.file = file;
        }
        copies.push(n);
        if (n.kind === "note" && (p.mode === "copy" || !existsSync(this.elements.notePath(id)))) this.elements.writeNote(id, p.notes[original.id] ?? "", false);
        if (n.kind === "table" && (p.mode === "copy" || !existsSync(this.elements.tablePath(id)))) this.elements.writeTable(id, p.tables[original.id], false);
      }
      remapBlackHoleMembers(copies, ids);
      for (const n of copies) {
        const flow = n.element?.flow;
        if (flow?.http?.serviceId) flow.http.serviceId = ids.get(flow.http.serviceId) ?? flow.http.serviceId;
        if (flow?.launch?.targetId) flow.launch.targetId = ids.get(flow.launch.targetId) ?? flow.launch.targetId;
      }
      const left = Math.min(...copies.map((n) => n.x));
      const top = Math.min(...copies.map((n) => n.y));
      const right = Math.max(...copies.map((n) => n.x + n.width));
      const bottom = Math.max(...copies.map((n) => n.y + n.height));
      const offset = p.mode === "copy" ? p.pastes * 24 : 0;
      const dx = at.x - (left + right) / 2 + offset, dy = at.y - (top + bottom) / 2 + offset;
      const compactOffset = copies.some(n => n.kind === "blackhole") && p.mode === "copy" && Math.hypot(dx, dy) < 24 ? 24 : 0;
      for (const n of copies) {
        n.x += dx; n.y += dy;
        if (n.summary) n.summary = { x: n.summary.x + dx + compactOffset, y: n.summary.y + dy + compactOffset };
      }
      const edges = p.mode === "copy" ? p.edges.map((e) => storedEdge({ ...e, id: randomUUID(), source: ids.get(e.source)!, target: ids.get(e.target)! })) : [];
      const saved = this.write(canvasId, { ...current, nodes: [...current.nodes, ...copies], edges: [...current.edges, ...edges] });
      if (p.mode === "cut") this.persist(null);
      else this.persist({ ...p, pastes: p.pastes + 1 });
      return { ok: true, state: saved, inserted: copies.map((n) => n.id), clipboard: this.state() };
    } catch (error) {
      // O conteúdo recortado continua guardado; cópias incompletas são descartadas.
      if (p.mode === "copy" && !copies.some((n) => this.current(canvasId).nodes.some((c) => c.id === n.id))) copies.forEach((n) => this.elements.cleanup(n));
      throw error;
    }
  }

  /**
   * Põe no canvas os elementos de um .zenite, com ids novos, centrados em `at`. A mídia já foi
   * copiada para a pasta do app; se algo falhar, ela é apagada junto.
   */
  insert(canvasId: string, state: CanvasState, batch: ArchiveBatch, at: { x: number; y: number }): CanvasTransferResult {
    try {
      this.adopt(canvasId, state);
      const current = this.current(canvasId);
      const names = current.nodes.map(nodeTitle);
      const ids = new Map<string, string>();
      const nodes = batch.nodes.map((original) => {
        const n = structuredClone(original);
        const id = randomUUID();
        ids.set(n.id, id);
        n.id = id;
        if (n.kind !== "draw") {
          const title = uniqueTitle(nodeTitle(n), names);
          names.push(title);
          if (n.terminal) n.terminal = { ...n.terminal, id, title };
          if (n.element) n.element = { ...n.element, id, title };
        }
        return n;
      });
      remapBlackHoleMembers(nodes, ids);
      for (const n of nodes) {
        const flow = n.element?.flow;
        if (flow?.http?.serviceId) flow.http.serviceId = ids.get(flow.http.serviceId) ?? "missing-service";
        if (flow?.launch?.targetId) flow.launch.targetId = ids.get(flow.launch.targetId) ?? "missing-file";
      }
      const left = Math.min(...nodes.map((n) => n.x));
      const top = Math.min(...nodes.map((n) => n.y));
      const right = Math.max(...nodes.map((n) => n.x + n.width));
      const bottom = Math.max(...nodes.map((n) => n.y + n.height));
      const dx = at.x - (left + right) / 2, dy = at.y - (top + bottom) / 2;
      for (const n of nodes) {
        n.x += dx; n.y += dy;
        if (n.summary) n.summary = { x: n.summary.x + dx, y: n.summary.y + dy };
      }
      batch.nodes.forEach((original, i) => {
        const id = nodes[i].id;
        if (original.kind === "note") this.elements.writeNote(id, batch.notes[original.id] ?? "", false);
        if (original.kind === "table") this.elements.writeTable(id, batch.tables[original.id], false);
      });
      const edges = batch.edges.map((e) => storedEdge({ ...e, id: randomUUID(), source: ids.get(e.source)!, target: ids.get(e.target)! }));
      const saved = this.write(canvasId, { ...current, nodes: [...current.nodes, ...nodes], edges: [...current.edges, ...edges] });
      return { ok: true, state: saved, inserted: nodes.map((n) => n.id), clipboard: this.state() };
    } catch (error) {
      // Só a mídia copiada do arquivo. Os ids de notas e tabelas do lote são os do canvas exportado,
      // que pode ser este mesmo: apagar por eles levaria os originais.
      batch.nodes.filter((n) => n.kind === "image" || n.kind === "video").forEach((n) => this.elements.cleanup(n));
      throw error;
    }
  }

  clear(canvasId: string, state: CanvasState): CanvasTransferResult {
    this.adopt(canvasId, state);
    const restoredCanvasId = this.releasePrevious();
    return { ok: true, state: this.current(canvasId), inserted: [], clipboard: this.state(), restoredCanvasId };
  }

  private releasePrevious(): string | undefined {
    const p = this.payload;
    if (!p) return;
    let restored: string | undefined;
    if (p.mode === "cut") {
      const canvasId = this.store.place(p.sourceCanvasId) ? p.sourceCanvasId : this.store.list().activeId;
      const allIds = new Set(this.store.places().flatMap((place) => this.store.loadCanvas(place.canvasId)?.nodes.map((n) => n.id) ?? []));
      const missing = p.nodes.filter((n) => !allIds.has(n.id));
      if (missing.length) {
        const current = this.current(canvasId);
        const names = current.nodes.map(nodeTitle);
        const nodes = missing.map((original) => {
          const n = structuredClone(original);
          const title = uniqueTitle(nodeTitle(n), names);
          names.push(title);
          if (n.terminal) n.terminal.title = title;
          if (n.element) n.element.title = title;
          return n;
        });
        this.write(canvasId, { ...current, nodes: [...current.nodes, ...nodes] });
        restored = canvasId;
      }
    }
    this.persist(null);
    if (p.mode === "copy") p.nodes.filter((n) => n.kind === "image" || n.kind === "video").forEach((n) => this.elements.cleanup(n));
    return restored;
  }

  private adopt(canvasId: string, state: CanvasState): void {
    if (!this.store.place(canvasId)) throw new Error("O canvas de destino não existe mais.");
    if ((state.revision ?? 0) !== (this.store.loadCanvas(canvasId)?.revision ?? 0)) throw new Error("O canvas mudou. Reabra-o antes de transferir os elementos.");
    this.store.saveCanvas(canvasId, state);
  }

  private current(canvasId: string): CanvasState {
    return this.store.loadCanvas(canvasId) ?? emptyCanvas();
  }

  private write(canvasId: string, state: CanvasState): CanvasState {
    const next = { ...state, revision: (state.revision ?? 0) + 1 };
    this.store.saveCanvas(canvasId, next);
    return next;
  }

  private persist(payload: Payload | null): void {
    if (payload) {
      mkdirSync(join(this.file, ".."), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(payload), "utf8");
      renameSync(`${this.file}.tmp`, this.file);
    } else rmSync(this.file, { force: true });
    this.payload = payload;
  }
}
