import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ARCHIVE_KINDS } from "./canvasArchive";
import { mediaKind, type ElementService } from "./elements";
import type { WorkspaceStore } from "./workspaceStore";
import type { CanvasNode, CanvasState, GalaxyArchiveInfo, GalaxyArchiveOptions, WorkspaceMeta } from "../shared/types";

const MAGIC = Buffer.from("ZENITE-GALAXY-1\n");
const MAX_HEADER = 32 * 1024 * 1024;
const MAX_FILES = 50_000;
const MAX_BYTES = 32 * 1024 * 1024 * 1024;
const SKIP = new Set([".git", "node_modules", ".venv", "venv", ".cache", ".codex", ".claude", ".aws", ".ssh", ".gnupg"]);
const ENV = /^\.env(?:\..+)?$/i;
const optionsOf = (raw: GalaxyArchiveOptions): GalaxyArchiveOptions => ({ contents: raw?.contents === true, media: raw?.media === true, env: raw?.env === true });
type ArchivedCanvas = { name: string; state: CanvasState; project: string; notes: Record<string, string>; tables: Record<string, string[][]> };
type Entry = { path: string; size: number; sha256: string; category: "contents" | "media" | "env" };
interface Header { version: 1; name: string; options: GalaxyArchiveOptions; canvases: ArchivedCanvas[]; files: Entry[]; directories: string[] }

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Nomes portáveis, sem travessia, streams NTFS, nomes de dispositivo ou colisões por caixa. */
function safePath(raw: unknown): string {
  if (typeof raw !== "string" || !raw || raw.length > 2048 || raw.includes("\\") || raw.split("/").some(p => !p || p === "." || p === ".." || /[<>:"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error("O pacote contém um caminho inválido.");
  return raw;
}

function cleanNode(node: CanvasNode): CanvasNode {
  const n = structuredClone(node);
  if (n.terminal) {
    const { id, title, command, cwd, appearance } = n.terminal;
    n.terminal = { id, title, command, cwd, ...(appearance ? { appearance } : {}) };
  }
  if (n.element?.flow) {
    delete n.element.flow.account;
    if (["ignition", "chronos"].includes(n.element.flow.type)) n.element.flow.paused = true;
  }
  if (n.element?.service) {
    const { transport, endpoint, tokenEnv, tools, allowWrites } = n.element.service;
    n.element.service = { transport, endpoint, tokenEnv, tools, allowWrites };
  }
  return n;
}

function infoOf(h: Header): GalaxyArchiveInfo {
  return { name: h.name, canvases: h.canvases.length, elements: h.canvases.reduce((sum, c) => sum + c.state.nodes.length, 0), files: h.files.length, bytes: h.files.reduce((sum, f) => sum + f.size, 0), options: h.options };
}

export function exportGalaxy(path: string, workspaceId: string, raw: GalaxyArchiveOptions, store: WorkspaceStore, elements: ElementService): GalaxyArchiveInfo {
  const workspace = store.list().workspaces.find(w => w.id === workspaceId);
  if (!workspace) throw new Error("Galáxia não encontrada.");
  const options = optionsOf(raw);
  const header: Header = { version: 1, name: workspace.name, options, canvases: [], files: [], directories: [] };
  const sources: string[] = [], seen = new Set<string>();
  let bytes = 0;
  const addFile = (source: string, dest: string, category: Entry["category"]) => {
    if (source === resolve(path) || source === resolve(path + ".tmp")) throw new Error("Salve o pacote fora da pasta do projeto para não incluir a própria exportação.");
    safePath(dest);
    if (seen.has(dest.toLowerCase())) return;
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`O arquivo não é regular: ${basename(source)}`);
    bytes += stat.size;
    if (bytes > MAX_BYTES || sources.length >= MAX_FILES) throw new Error("O pacote excede o limite de 32 GB ou 50 mil arquivos. Exclua conteúdos ou mídia.");
    const hash = createHash("sha256"), fd = openSync(source, "r"), buffer = Buffer.alloc(1024 * 1024);
    try { let n; while ((n = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); }
    finally { closeSync(fd); }
    seen.add(dest.toLowerCase()); sources.push(source);
    header.files.push({ path: dest, size: stat.size, sha256: hash.digest("hex"), category });
  };
  const copyTree = (source: string, dest: string, depth = 0) => {
    if (depth > 64) throw new Error("A pasta tem mais de 64 níveis.");
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      const env = ENV.test(basename(source));
      const media = !!mediaKind(source);
      if (env ? options.env : media ? options.contents && options.media : options.contents) addFile(source, dest, env ? "env" : media ? "media" : "contents");
    } else if (stat.isDirectory()) {
      if (options.contents) { if (header.directories.length >= MAX_FILES) throw new Error("O pacote excede 50 mil pastas."); header.directories.push(safePath(dest)); }
      for (const item of readdirSync(source, { withFileTypes: true })) {
        if (SKIP.has(item.name) || item.isSymbolicLink()) continue;
        // Só procura .env quando conteúdos estiverem desmarcados.
        if (!options.contents && !options.env) continue;
        copyTree(join(source, item.name), `${dest}/${item.name}`, depth + 1);
      }
    }
  };
  const places = [{ id: workspace.id, name: "Origem", dir: workspace.dir }, ...(workspace.universes ?? []).map(u => ({ id: u.id, name: u.name, dir: u.path }))];
  for (const [i, place] of places.entries()) {
    const project = `projects/${i}`;
    const root = place.dir ? resolve(place.dir) : "";
    if (root && (options.contents || options.env) && existsSync(root)) {
      if (within(root, resolve(path))) throw new Error("Salve o pacote fora da pasta do projeto para evitar incluir a própria exportação.");
      copyTree(root, project);
    }
    const original = store.loadCanvas(place.id) ?? { version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const state = structuredClone(original);
    state.nodes = state.nodes.map(cleanNode);
    const notes: Record<string, string> = {}, tables: Record<string, string[][]> = {};
    for (const n of state.nodes) {
      if (n.terminal) {
        const cwd = n.terminal.cwd ? resolve(n.terminal.cwd) : root;
        n.terminal.cwd = root && cwd && within(root, cwd) ? `${project}/${relative(root, cwd).split(sep).join("/")}`.replace(/\/$/, "") : project;
      }
      const e = n.element;
      if (!e) continue;
      if (options.contents && n.kind === "note") notes[n.id] = elements.readNote(n.id);
      if (options.contents && n.kind === "table") tables[n.id] = elements.readTable(n.id);
      if (e.path) {
        const source = resolve(e.path);
        if (options.contents && existsSync(source) && !lstatSync(source).isSymbolicLink()) {
          if (root && within(root, source)) e.path = `${project}/${relative(root, source).split(sep).join("/")}`.replace(/\/$/, "");
          else { const dest = `resources/${i}/${n.id}/${basename(source)}`; copyTree(source, dest); e.path = dest; }
        } else delete e.path;
      }
      if (e.file) {
        if (options.media && ["image", "video"].includes(n.kind ?? "")) {
          const source = elements.mediaPath(e.file), dest = `media/${i}/${n.id}${extname(e.file)}`;
          if (!existsSync(source)) throw new Error(`A mídia de "${e.title}" não foi encontrada.`);
          addFile(source, dest, "media"); e.file = dest;
        } else delete e.file;
      }
      if (e.flow?.folder) {
        const source = resolve(e.flow.folder);
        e.flow.folder = root && within(root, source) ? `${project}/${relative(root, source).split(sep).join("/")}`.replace(/\/$/, "") : "";
      }
      if (e.flow?.launch?.path) {
        const source = resolve(root || ".", e.flow.launch.path);
        e.flow.launch.path = root && within(root, source) ? `${project}/${relative(root, source).split(sep).join("/")}` : "";
      }
    }
    header.canvases.push({ name: place.name, project, state, notes, tables });
  }
  const json = Buffer.from(JSON.stringify(header));
  if (json.length > MAX_HEADER) throw new Error("Metadados do pacote maiores que 32 MB.");
  const length = Buffer.alloc(4); length.writeUInt32LE(json.length);
  const tmp = path + ".tmp", out = openSync(tmp, "wx");
  try {
    writeSync(out, MAGIC); writeSync(out, length); writeSync(out, json);
    const buffer = Buffer.alloc(1024 * 1024);
    sources.forEach((source, i) => {
      const fd = openSync(source, "r"), hash = createHash("sha256"); let left = header.files[i].size;
      try {
        while (left > 0) { const n = readSync(fd, buffer, 0, Math.min(left, buffer.length), null); if (!n) throw new Error("Um arquivo mudou durante a exportação. Tente novamente."); hash.update(buffer.subarray(0, n)); writeSync(out, buffer, 0, n); left -= n; }
        if (hash.digest("hex") !== header.files[i].sha256 || fstatSync(fd).size !== header.files[i].size) throw new Error("Um arquivo mudou durante a exportação. Tente novamente.");
      } finally { closeSync(fd); }
    });
  } catch (error) { closeSync(out); rmSync(tmp, { force: true }); throw error; }
  closeSync(out);
  try { renameSync(tmp, path); } catch (error) { rmSync(tmp, { force: true }); throw error; }
  return infoOf(header);
}

function readHeader(fd: number): Header {
  const read = (size: number) => { const b = Buffer.alloc(size); if (readSync(fd, b, 0, size, null) !== size) throw new Error("Pacote de galáxia incompleto."); return b; };
  if (!read(MAGIC.length).equals(MAGIC)) throw new Error("Escolha um pacote de galáxia .zenite-galaxia.");
  const size = read(4).readUInt32LE();
  if (size < 2 || size > MAX_HEADER) throw new Error("Cabeçalho de galáxia inválido.");
  let h: Header;
  try { h = JSON.parse(read(size).toString("utf8")); } catch { throw new Error("Cabeçalho de galáxia inválido."); }
  if (h.version !== 1 || typeof h.name !== "string" || !h.name.trim() || !Array.isArray(h.canvases) || !h.canvases.length || h.canvases.length > 1000 || !Array.isArray(h.files) || h.files.length > MAX_FILES) throw new Error("Estrutura do pacote inválida.");
  h.options = optionsOf(h.options);
  h.directories ??= [];
  if (!Array.isArray(h.directories) || h.directories.length > 50_000) throw new Error("Lista de pastas inválida.");
  for (const dir of h.directories) if (!/^(projects|resources)\//.test(safePath(dir))) throw new Error("Pasta inválida no pacote.");
  let total = 0; const paths = new Set<string>();
  for (const file of h.files) {
    const safe = safePath(file.path);
    if (!/^(projects|resources|media)\//.test(safe) || paths.has(safe.toLowerCase()) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || !["contents", "media", "env"].includes(file.category)) throw new Error("Lista de arquivos inválida.");
    // Um .env não pode se disfarçar de conteúdo/mídia para passar sem consentimento.
    if (safe.split("/").some(p => ENV.test(p)) && file.category !== "env") throw new Error("Pacote inválido: .env sem classificação de credencial.");
    if (file.category === "env" && !h.options.env || file.category === "media" && !h.options.media || file.category === "contents" && !h.options.contents) throw new Error("As opções do pacote não correspondem aos arquivos.");
    paths.add(safe.toLowerCase()); total += file.size;
    if (total > MAX_BYTES) throw new Error("O pacote excede 32 GB.");
  }
  if (fstatSync(fd).size !== MAGIC.length + 4 + size + total) throw new Error("O tamanho do pacote não corresponde ao conteúdo.");
  const ids = new Set<string>();
  h.canvases.forEach((c, i) => {
    if (typeof c.name !== "string" || c.project !== `projects/${i}` || c.state?.version !== 1 || !Array.isArray(c.state.nodes) || !Array.isArray(c.state.edges) || c.state.nodes.length > 50_000) throw new Error("Canvas inválido no pacote.");
    const local = new Set<string>();
    for (const n of c.state.nodes) {
      if (!n || typeof n.id !== "string" || !n.id || ids.has(n.id) || !ARCHIVE_KINDS.includes(n.kind ?? "terminal") || ![n.x, n.y, n.width, n.height].every(Number.isFinite)) throw new Error("Elemento inválido no pacote.");
      if ((n.kind ?? "terminal") === "terminal" ? !n.terminal : n.kind === "draw" ? !n.draw : !n.element) throw new Error("Elemento incompleto no pacote.");
      ids.add(n.id); local.add(n.id);
      for (const file of [n.terminal?.cwd, n.element?.path, n.element?.file, n.element?.flow?.folder, n.element?.flow?.launch?.path].filter(Boolean)) {
        if (!/^(projects|resources|media)\//.test(safePath(file))) throw new Error("Referência de arquivo inválida.");
      }
    }
    if (c.state.edges.some(e => !local.has(e.source) || !local.has(e.target))) throw new Error("Ligação inválida no pacote.");
  });
  return h;
}

export function inspectGalaxy(path: string): GalaxyArchiveInfo {
  const fd = openSync(path, "r"); try { return infoOf(readHeader(fd)); } finally { closeSync(fd); }
}

/** Importação sempre usa uma pasta nova; caminhos do pacote nunca escrevem no projeto existente. */
export function importGalaxy(path: string, raw: GalaxyArchiveOptions, dataDir: string, store: WorkspaceStore, elements: ElementService) {
  const fd = openSync(path, "r"), selected = optionsOf(raw), id = randomUUID();
  const target = join(dataDir, "galaxias-importadas", id), importedMedia: string[] = [], writtenNotes: string[] = [], writtenTables: string[] = [];
  try {
    const h = readHeader(fd);
    const options = { contents: selected.contents && h.options.contents, media: selected.media && h.options.media, env: selected.env && h.options.env };
    mkdirSync(target, { recursive: true });
    if (options.contents) for (const dir of h.directories) mkdirSync(join(target, ...dir.split("/")), { recursive: true });
    const buffer = Buffer.alloc(1024 * 1024);
    for (const file of h.files) {
      const wanted = options[file.category === "contents" ? "contents" : file.category === "media" ? "media" : "env"];
      const dest = join(target, ...safePath(file.path).split("/"));
      if (!within(target, dest)) throw new Error("Arquivo fora da pasta de importação.");
      if (wanted) mkdirSync(dirname(dest), { recursive: true });
      const out = wanted ? openSync(dest, "wx") : null, hash = createHash("sha256"); let left = file.size;
      try {
        while (left > 0) { const n = readSync(fd, buffer, 0, Math.min(left, buffer.length), null); if (!n) throw new Error("Pacote incompleto."); hash.update(buffer.subarray(0, n)); if (out !== null) writeSync(out, buffer, 0, n); left -= n; }
        if (hash.digest("hex") !== file.sha256) throw new Error("O pacote contém um arquivo danificado.");
      } finally { if (out !== null) closeSync(out); }
    }
    const nodeIds = new Map<string, string>(h.canvases.flatMap(c => c.state.nodes.map(n => [n.id, randomUUID()] as const)));
    const canvases = h.canvases.map((canvas, i) => {
      const canvasId = i === 0 ? id : randomUUID(), project = join(target, ...canvas.project.split("/"));
      mkdirSync(project, { recursive: true });
      const remap = (file: string) => join(target, ...safePath(file).split("/"));
      const nodes = canvas.state.nodes.map(original => {
        const n = cleanNode(original), newId = nodeIds.get(n.id)!;
        n.id = newId;
        if (n.terminal) { n.terminal.id = newId; n.terminal.cwd = n.terminal.cwd ? remap(n.terminal.cwd) : project; mkdirSync(n.terminal.cwd, { recursive: true }); }
        const e = n.element;
        if (e) {
          e.id = newId;
          if (e.path) { if (options.contents) e.path = remap(e.path); else delete e.path; }
          if (e.file) {
            const imported = options.media ? elements.importMedia(remap(e.file)) : null;
            if (imported) { e.file = imported.file; importedMedia.push(elements.mediaPath(imported.file)); } else delete e.file;
          }
          if (e.flow?.folder) e.flow.folder = remap(e.flow.folder);
          if (e.flow?.launch?.path) e.flow.launch.path = options.contents ? remap(e.flow.launch.path) : "";
          if (e.flow?.http?.serviceId) e.flow.http.serviceId = nodeIds.get(e.flow.http.serviceId) ?? "missing-service";
          if (e.flow?.launch?.targetId) e.flow.launch.targetId = nodeIds.get(e.flow.launch.targetId) ?? "missing-file";
          if (e.blackHole) e.blackHole.members = e.blackHole.members.map(old => nodeIds.get(old)).filter((key): key is string => !!key);
          if (n.kind === "note" && options.contents && typeof canvas.notes?.[original.id] === "string") { elements.writeNote(newId, canvas.notes[original.id], false); writtenNotes.push(elements.notePath(newId)); }
          if (n.kind === "table" && options.contents && Array.isArray(canvas.tables?.[original.id])) { elements.writeTable(newId, canvas.tables[original.id], false); writtenTables.push(elements.tablePath(newId)); }
        }
        return n;
      });
      const viewport = canvas.state.viewport;
      const state: CanvasState = { version: 1, nodes, edges: canvas.state.edges.map(e => ({ ...e, id: randomUUID(), source: nodeIds.get(e.source)!, target: nodeIds.get(e.target)! })), viewport: viewport && [viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) ? viewport : { x: 0, y: 0, zoom: 1 } };
      return { id: canvasId, state, project, name: canvas.name };
    });
    const taken = new Set(store.list().workspaces.map(w => w.name.toLowerCase()));
    let name = h.name; for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${h.name} (${i})`;
    const workspace: WorkspaceMeta = { id, name, dir: canvases[0].project, universes: canvases.slice(1).map(c => ({ id: c.id, name: c.name, path: c.project, branch: "", worktree: "", isolated: false })) };
    return { workspaceId: id, index: store.registerImported(workspace, canvases) };
  } catch (error) {
    // Pasta criada por esta tentativa, sempre sob dataDir/galaxias-importadas/<UUID>.
    if (within(join(dataDir, "galaxias-importadas"), target) && basename(target) === id) rmSync(target, { recursive: true, force: true });
    for (const file of [...importedMedia, ...writtenNotes, ...writtenTables]) rmSync(file, { force: true });
    throw error;
  } finally { closeSync(fd); }
}
