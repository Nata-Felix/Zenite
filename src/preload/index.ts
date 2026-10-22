import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type { OApi } from "../shared/types";

function subscribe<A extends unknown[]>(channel: string, listener: (...args: A) => void): () => void {
  const wrapped = (_e: IpcRendererEvent, ...args: unknown[]) => listener(...(args as A));
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: OApi = {
  galaxyArchive: {
    export: (id, options) => ipcRenderer.invoke("galaxy:export", id, options),
    pick: () => ipcRenderer.invoke("galaxy:pickImport"),
    import: (ticket, options) => ipcRenderer.invoke("galaxy:import", ticket, options),
  },
  pty: {
    runtime: id => ipcRenderer.invoke("pty:runtime", id),
    create: (req) => ipcRenderer.invoke("pty:create", req),
    restart: (req) => ipcRenderer.invoke("pty:restart", req),
    promoteSun: (req) => ipcRenderer.invoke("pty:promoteSun", req),
    cliTheme: (command, account, provider) => ipcRenderer.invoke("pty:cliTheme", command, account, provider),
    write: (id, data) => ipcRenderer.send("pty:write", id, data),
    resize: (id, cols, rows) => ipcRenderer.send("pty:resize", id, cols, rows),
    kill: (id) => ipcRenderer.send("pty:kill", id),
    onData: (listener) => subscribe("pty:data", listener),
    onExit: (listener) => subscribe("pty:exit", listener),
    onStats: (listener) => subscribe("pty:stats", listener),
    onUsage: (listener) => subscribe("usage:update", listener),
    tasks: () => ipcRenderer.invoke("tasks:get"),
    onTasks: (listener) => subscribe("tasks:changed", listener),
    dismissLimit: (id) => ipcRenderer.send("usage:dismiss", id),
    killProcess: (terminalId, pid) => ipcRenderer.invoke("proc:kill", terminalId, pid),
  },
  workspaces: {
    isolationStatus: () => ipcRenderer.invoke("isolation:status"),
    prepareIsolation: () => ipcRenderer.invoke("isolation:prepare"),
    installDocker: () => ipcRenderer.invoke("isolation:install-docker"),
    revokeDirectAccess: () => ipcRenderer.invoke("isolation:revoke"),
    list: () => ipcRenderer.invoke("workspaces:list"),
    create: (name, dir) => ipcRenderer.invoke("workspaces:create", name, dir),
    update: (id, changes) => ipcRenderer.invoke("workspaces:update", id, changes),
    remove: (id) => ipcRenderer.invoke("workspaces:remove", id),
    setActive: (id) => ipcRenderer.invoke("workspaces:setActive", id),
    pickDirectory: (start) => ipcRenderer.invoke("workspaces:pickDirectory", start),
    onChanged: (listener) => subscribe("index:changed", listener),
    setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  },
  search: {
    items: () => ipcRenderer.invoke("search:items"),
  },
  skills: {
    state: () => ipcRenderer.invoke("skills:state"),
    add: (dir) => ipcRenderer.invoke("skills:add", dir),
    remove: (name) => ipcRenderer.invoke("skills:remove", name),
    sync: () => ipcRenderer.invoke("skills:sync"),
    open: (path) => ipcRenderer.send("skills:open", path),
  },
  backups: {
    list: () => ipcRenderer.invoke("backups:list"),
    create: () => ipcRenderer.invoke("backups:create"),
    remove: (id) => ipcRenderer.invoke("backups:remove", id),
    restore: (id) => ipcRenderer.invoke("backups:restore", id),
    open: () => ipcRenderer.send("backups:open"),
  },
  system: {
    usage: () => ipcRenderer.invoke("system:usage"),
    info: () => ipcRenderer.invoke("system:info"),
    openDataDir: () => ipcRenderer.send("system:openDataDir"),
    openUrl: (url) => ipcRenderer.send("system:openUrl", url),
    openLink: (url, how) => ipcRenderer.send("system:openLink", url, how),
    onLinkAsk: (listener) => subscribe("link:ask", listener),
    onAddSite: (listener) => subscribe("browser:addSite", listener),
    readClipboard: () => ipcRenderer.invoke("clipboard:read"),
    writeClipboard: (text) => ipcRenderer.invoke("clipboard:write", text),
    terminalMenu: (opts) => ipcRenderer.invoke("terminal:menu", opts),
    onConfirmClose: (listener) => subscribe("app:confirmClose", listener),
    closeShown: () => ipcRenderer.send("app:closeShown"),
    answerClose: (close, dontAskAgain) => ipcRenderer.send("app:closeAnswer", close, dontAskAgain),
  },
  dialogs: {
    onAsk: (listener) => subscribe("dialog:ask", listener),
    onClose: (listener) => subscribe("dialog:close", listener),
    shown: (id) => ipcRenderer.send("dialog:shown", id),
    answer: (id, ok, checked) => ipcRenderer.send("dialog:answer", id, ok, checked),
  },
  attention: {
    get: () => ipcRenderer.invoke("attention:get"),
    onChanged: (listener) => subscribe("attention:changed", listener),
    onJump: (listener) => subscribe("attention:jump", listener),
    focus: (id) => ipcRenderer.send("attention:focus", id),
    clear: (id) => ipcRenderer.send("attention:clear", id),
    badge: (count, dataUrl) => ipcRenderer.send("attention:badge", count, dataUrl),
  },
  proposals: {
    apply: (wsId, pid, edited) => ipcRenderer.invoke("proposals:apply", wsId, pid, edited),
    discard: (wsId, pid) => ipcRenderer.invoke("proposals:discard", wsId, pid),
  },
  elements: {
    pickSkill: () => ipcRenderer.invoke("integration:pickSkill"),
    readSkill: (id, file) => ipcRenderer.invoke("integration:skill", id, file),
    useService: (id, request) => ipcRenderer.invoke("integration:service", id, request),
    readNote: (id) => ipcRenderer.invoke("note:read", id),
    writeNote: (id, content) => ipcRenderer.send("note:write", id, content),
    onNoteChanged: (listener) => subscribe("note:changed", listener),
    pickMedia: (kind) => ipcRenderer.invoke("media:pick", kind),
    importMedia: (path) => ipcRenderer.invoke("media:import", path),
    pathForFile: (file) => webUtils.getPathForFile(file),
    registerWeb: (nodeId, wcId) => ipcRenderer.send("web:register", nodeId, wcId),
    inspectReady: (wcId) => ipcRenderer.invoke("web:inspectReady", wcId),
    removed: (node) => ipcRenderer.send("element:removed", node),
    restored: (node) => ipcRenderer.send("element:restored", node),
    readTable: (id) => ipcRenderer.invoke("table:read", id),
    writeTable: (id, rows) => ipcRenderer.send("table:write", id, rows),
    onTableChanged: (listener) => subscribe("table:changed", listener),
    fileInfo: (path) => ipcRenderer.invoke("file:info", path),
    listDir: (path) => ipcRenderer.invoke("dir:list", path),
    pickFile: () => ipcRenderer.invoke("file:pick"),
    openPath: (path) => ipcRenderer.invoke("file:open", path),
    revealPath: (path) => ipcRenderer.send("file:reveal", path),
    setWebZoom: (wcId, factor) => ipcRenderer.send("web:zoom", wcId, factor),
    webviewPreload: pathToFileURL(join(__dirname, "webview.js")).href,
  },
  git: {
    version: () => ipcRenderer.invoke("git:version"),
    state: (wsId, uid) => ipcRenderer.invoke("git:state", wsId, uid),
    identity: (wsId) => ipcRenderer.invoke("git:identity", wsId),
    setIdentity: (name, email) => ipcRenderer.invoke("git:setIdentity", name, email),
    init: (wsId) => ipcRenderer.invoke("git:init", wsId),
    firstCommit: (wsId) => ipcRenderer.invoke("git:firstCommit", wsId),
    openInstallPage: () => ipcRenderer.send("git:installPage"),
  },
  env: {
    read: (wsId, uid) => ipcRenderer.invoke("env:read", wsId, uid),
    write: (wsId, uid, entries) => ipcRenderer.invoke("env:write", wsId, uid, entries),
    ignore: (wsId, uid) => ipcRenderer.invoke("env:ignore", wsId, uid),
    watch: (wsId, uid, listener) => {
      const off = subscribe("env:changed", listener);
      ipcRenderer.send("env:watch", wsId, uid);
      return () => {
        off();
        ipcRenderer.send("env:unwatch");
      };
    },
  },
  accounts: {
    create: (name, agent) => ipcRenderer.invoke("accounts:create", name, agent),
    remove: (id) => ipcRenderer.invoke("accounts:remove", id),
    status: () => ipcRenderer.invoke("accounts:status"),
  },
  universes: {
    create: (wsId, name, clone) => ipcRenderer.invoke("universes:create", wsId, name, clone),
    setActive: (wsId, uid) => ipcRenderer.invoke("universes:setActive", wsId, uid),
    status: (wsId, uid) => ipcRenderer.invoke("universes:status", wsId, uid),
    preview: (wsId) => ipcRenderer.invoke("universes:preview", wsId),
    commit: (wsId, uid, msg) => ipcRenderer.invoke("universes:commit", wsId, uid, msg),
    converge: (wsId, uid, keep) => ipcRenderer.invoke("universes:converge", wsId, uid, keep),
    collapse: (wsId, uid) => ipcRenderer.invoke("universes:collapse", wsId, uid),
    update: (wsId, uid) => ipcRenderer.invoke("universes:update", wsId, uid),
    finishUpdate: (wsId, uid) => ipcRenderer.invoke("universes:finishUpdate", wsId, uid),
    abortUpdate: (wsId, uid) => ipcRenderer.invoke("universes:abortUpdate", wsId, uid),
  },
  canvas: {
    mounted: (id) => ipcRenderer.send("canvas:mounted", id),
    onPatch: (listener) => subscribe("canvas:patch", listener),
    onOps: (listener) => subscribe("canvas:ops", listener),
    opsResult: (requestId, reply) => ipcRenderer.send("canvas:opsResult", requestId, reply),
    onUi: (listener) => subscribe("canvas:ui", listener),
    uiResult: (requestId, reply) => ipcRenderer.send("canvas:uiResult", requestId, reply),
    onFlow: (listener) => subscribe("canvas:flow", listener),
    load: (id) => ipcRenderer.invoke("canvas:load", id),
    save: (id, state) => ipcRenderer.invoke("canvas:save", id, state),
    saveNow: (id, state) => {
      ipcRenderer.sendSync("canvas:saveNow", id, state);
    },
    export: (state, kinds, name) => ipcRenderer.invoke("canvas:export", state, kinds, name),
    import: (id, state, at) => ipcRenderer.invoke("canvas:import", id, state, at),
  },
  flows: {
    prepareCode: (language, nodeId) => ipcRenderer.invoke("flows:prepareCode", language, nodeId),
    signal: (nodeId, input) => ipcRenderer.invoke("flows:signal", nodeId, input),
    stop: (nodeId) => ipcRenderer.invoke("flows:stop", nodeId),
    options: () => ipcRenderer.invoke("flows:options"),
    run: (canvasId, state, triggerId) => ipcRenderer.invoke("flows:run", canvasId, state, triggerId),
    onStatus: (listener) => subscribe("flow:status", listener),
  },
  canvasClipboard: {
    get: () => ipcRenderer.invoke("canvas-clipboard:get"),
    capture: (id, state, ids, mode) => ipcRenderer.invoke("canvas-clipboard:capture", id, state, ids, mode),
    paste: (id, state, at) => ipcRenderer.invoke("canvas-clipboard:paste", id, state, at),
    clear: (id, state) => ipcRenderer.invoke("canvas-clipboard:clear", id, state),
    onChanged: (listener) => subscribe("canvas-clipboard:changed", listener),
  },
  updates: {
    get: () => ipcRenderer.invoke("update:get"),
    check: () => ipcRenderer.invoke("update:check"),
    install: () => ipcRenderer.send("update:install"),
    onState: (listener) => subscribe("update:state", listener),
  },
  secrets: {
    status: () => ipcRenderer.invoke("secrets:status"),
    setOpenRouterKey: (key) => ipcRenderer.invoke("secrets:setOpenRouter", key),
    removeOpenRouterKey: () => ipcRenderer.invoke("secrets:removeOpenRouter"),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld("o", api);
