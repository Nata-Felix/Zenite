import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, FolderOpen, GitBranch, TriangleAlert } from "lucide-react";
import type { GitRepoState, UniverseMeta, UniverseStatus, WorkspaceIndex, WorkspaceMeta } from "../../shared/types";
import { GitSetupDialog } from "./GitSetupDialog";
import { T } from "../vocab";
import { UniverseDiagram } from "./UniverseDiagram";
import { plural } from "../../shared/plural";

interface Base {
  workspace: WorkspaceMeta;
  onCancel(): void;
}

/** Diálogo desenhado direto no <body>: dentro da barra flutuante ele ficaria preso a ela. */
function Shell({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel(): void }) {
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Mesmo critério do processo principal: .env e variantes (exceto exemplos/modelos). */
const isSecret = (f: string) => /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/i.test(f);

function FileList({ files }: { files: string[] }) {
  const shown = files.slice(0, 8);
  return (
    <ul className="file-list">
      {shown.map((f) => (
        <li key={f}>{f}</li>
      ))}
      {files.length > shown.length && <li className="more">e mais {files.length - shown.length}…</li>}
    </ul>
  );
}

/** Por que esta galáxia ainda não pode ter cópia isolada (e merge). */
function missingGit(workspace: WorkspaceMeta, repo: GitRepoState | null): "folder" | "git" | "commit" | null {
  if (!workspace.dir) return "folder";
  if (!repo) return null;
  if (!repo.isRepo) return "git";
  if (!repo.hasCommits) return "commit";
  return null;
}

export function NewUniverseDialog({ workspace, onCancel, onCreated, onIndex }: Base & { onCreated(index: WorkspaceIndex): void; onIndex(index: WorkspaceIndex): void }) {
  const [name, setName] = useState("");
  const [clone, setClone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ isolated: boolean; files: string[] } | null>(null);
  const [repo, setRepo] = useState<GitRepoState | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    window.o.universes.preview(workspace.id).then(setPreview);
    if (workspace.dir) window.o.git.state(workspace.id, null).then(setRepo);
  }, [workspace.id, workspace.dir, refresh]);

  const missing = preview && !preview.isolated ? missingGit(workspace, repo) : null;

  /** Galáxia sem pasta: escolhe a pasta do projeto e já segue para ativar o git. */
  const chooseFolder = async () => {
    const dir = await window.o.workspaces.pickDirectory();
    if (!dir) return;
    onIndex(await window.o.workspaces.update(workspace.id, { dir }));
    const state = await window.o.git.state(workspace.id, null);
    setRepo(state);
    setRefresh((n) => n + 1);
    if (!state.isRepo || !state.hasCommits) setSettingUp(true);
  };

  const createCanvasOnly = async () => {
    setBusy(true);
    setError("");
    const r = await window.o.universes.create(workspace.id, name, clone);
    setBusy(false);
    if (r.ok) onCreated(r.index);
    else setError(r.error);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing) return;
    setBusy(true);
    setError("");
    const r = await window.o.universes.create(workspace.id, name, clone);
    setBusy(false);
    if (r.ok) onCreated(r.index);
    else setError(r.error);
  };

  return (
    <Shell title={T.openUniverseTitle} onCancel={onCancel}>
      <form className="dialog-form" onSubmit={submit}>
        <UniverseDiagram mode="branch" originLabel={T.origin} universeLabel={name.trim() || "Novo universo"} />
        <p className="dialog-text">
          Os agentes deste universo trabalham numa <strong>cópia isolada do projeto</strong> (uma branch do git). Nada do que fizerem toca a{" "}
          {T.origin} até você fazer o merge.
        </p>
        <label>
          Nome
          <input autoFocus value={name} placeholder="ex.: Novo checkout" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={clone} onChange={(e) => setClone(e.target.checked)} />
          <span>Copiar o canvas da {T.origin} (terminais, notas, imagens e sites)</span>
        </label>
        <p className="dialog-hint">Alterações ainda não commitadas na {T.origin} não vão para a cópia.</p>
        {missing && (
          <div className="git-gate">
            <TriangleAlert size={16} />
            <div>
              <strong>
                {missing === "folder"
                  ? "Esta galáxia não tem pasta de projeto."
                  : missing === "git"
                    ? "A pasta desta galáxia ainda não usa git."
                    : "O repositório ainda não tem nenhum commit."}
              </strong>
              <span>
                Sem isso não existe cópia isolada: os agentes do universo mexeriam direto nos arquivos da {T.origin} e{" "}
                <strong>não haveria merge</strong> para fazer no fim.
              </span>
            </div>
          </div>
        )}
        {preview?.isolated && (
          <div className="copy-preview">
            <span>
              {preview.files.length ? "Arquivos fora do git que vão junto (cópia própria):" : "Nenhum arquivo fora do git será copiado."}
            </span>
            {preview.files.length > 0 && <FileList files={preview.files} />}
            <span className="field-hint">Dependências como node_modules não vão: rode a instalação (ex.: npm install) dentro do universo.</span>
          </div>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          {missing ? (
            <>
              <button type="button" className="ghost" disabled={busy} title="Universo sem git: só um canvas separado, sem merge" onClick={createCanvasOnly}>
                Só canvas, sem merge
              </button>
              {missing === "folder" ? (
                <button type="button" className="primary" onClick={chooseFolder}>
                  <FolderOpen size={14} /> Escolher pasta
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => setSettingUp(true)}>
                  <GitBranch size={14} /> Ativar git
                </button>
              )}
            </>
          ) : (
            <button type="submit" className="primary" disabled={busy || !preview}>
              {busy ? "Criando…" : T.createCopy}
            </button>
          )}
        </div>
      </form>
      {settingUp && repo && (
        <GitSetupDialog
          workspace={workspace}
          state={repo}
          onClose={() => setSettingUp(false)}
          onDone={() => {
            setSettingUp(false);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </Shell>
  );
}

export function ConvergeDialog({
  workspace,
  universe,
  onCancel,
  onDone,
  onUpdate,
}: Base & { universe: UniverseMeta; onDone(index: WorkspaceIndex): void; onUpdate(): void }) {
  const [status, setStatus] = useState<UniverseStatus | null>(null);
  const [message, setMessage] = useState(`Trabalho do universo ${universe.name}`);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    window.o.universes.status(workspace.id, universe.id).then(setStatus);
  }, [workspace.id, universe.id]);

  const run = async () => {
    setBusy(true);
    setError("");
    setConflicts([]);
    if (status?.pending.length) {
      const c = await window.o.universes.commit(workspace.id, universe.id, message);
      if (!c.ok) {
        setBusy(false);
        setError(`Não consegui commitar: ${c.error}`);
        return;
      }
      setStatus(c.index);
    }
    const r = await window.o.universes.converge(workspace.id, universe.id, keep);
    setBusy(false);
    if (r.ok) onDone(r.index);
    else {
      setError(r.error);
      setConflicts(r.conflicts ?? []);
      setStatus(await window.o.universes.status(workspace.id, universe.id));
    }
  };

  const nothing = status && !status.pending.length && status.ahead === 0;
  return (
    <Shell title={T.convergeTitle} onCancel={onCancel}>
      <UniverseDiagram mode="merge" originLabel={T.origin} universeLabel={universe.name} />
      {!status ? (
        <p className="dialog-text">Lendo o estado do universo…</p>
      ) : status.updating ? (
        <p className="dialog-error">
          Este universo está no meio de uma atualização com a {T.origin}, parada em conflito. Resolva e conclua a atualização antes de fazer o merge.
        </p>
      ) : (
        <>
          <p className="dialog-text">
            Leva as mudanças da branch <code>{status.branch}</code> para <code>{status.originBranch}</code> na {T.origin}.
          </p>
          <div className="stat-row">
            <span>
              <strong>{status.ahead}</strong> {status.ahead === 1 ? "commit para levar" : "commits para levar"}
            </span>
            <span>
              <strong>{status.pending.length}</strong> {status.pending.length === 1 ? "alteração sem commit" : "alterações sem commit"}
            </span>
          </div>
          {status.pending.length > 0 && (
            <>
              <FileList files={status.pending} />
              {status.pending.some(isSecret) && (
                <p className="dialog-error">
                  {status.pending.filter(isSecret).join(", ")} não está no .gitignore e não pode ser commitado. Feche aqui, abra Variáveis (.env)
                  neste universo e clique em “Adicionar ao .gitignore”.
                </p>
              )}
              <label>
                Mensagem do commit dessas alterações
                <input value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
            </>
          )}
          {nothing && <p className="dialog-hint">Nada mudou neste universo ainda.</p>}
          <label className="toggle">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>Manter o universo aberto depois (senão ele some e a branch é apagada)</span>
          </label>
          {error && <p className="dialog-error">{error}</p>}
          {conflicts.length > 0 && <FileList files={conflicts} />}
        </>
      )}
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancelar
        </button>
        {conflicts.length > 0 || status?.updating ? (
          <button className="primary" onClick={onUpdate}>
            {status?.updating ? "Resolver conflitos" : T.update}
          </button>
        ) : (
          <button className="primary" disabled={!status || busy} onClick={run}>
            {busy ? "Fazendo merge…" : status?.pending.length ? T.commitAndMerge : T.merge}
          </button>
        )}
      </div>
    </Shell>
  );
}

export function CollapseDialog({ workspace, universe, onCancel, onDone }: Base & { universe: UniverseMeta; onDone(index: WorkspaceIndex): void }) {
  const [status, setStatus] = useState<UniverseStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.o.universes.status(workspace.id, universe.id).then(setStatus);
  }, [workspace.id, universe.id]);

  const lose = (status?.pending.length ?? 0) > 0 || (status?.ahead ?? 0) > 0;
  return (
    <Shell title={universe.isolated ? T.collapseTitle : "Fechar este universo"} onCancel={onCancel}>
      <UniverseDiagram mode="collapse" originLabel={T.origin} universeLabel={universe.name} />
      <p className="dialog-text">
        Encerra os terminais deste universo e apaga o canvas dele
        {universe.isolated ? (
          <>
            , a cópia do projeto e a branch <code>{universe.branch}</code>
          </>
        ) : null}
        . {universe.isolated ? `A ${T.origin} não é alterada.` : `Os arquivos da pasta ficam como estão: este universo não tinha cópia própria.`}
      </p>
      {lose && (
        <p className="dialog-error">
          Atenção: {plural(status!.ahead, "commit", "commits")} e {plural(status!.pending.length, "alteração", "alterações")} deste universo ainda não estão na {T.origin} e serão
          perdidos. Para guardar, use “{T.merge}”.
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="primary danger"
          disabled={busy || !status}
          onClick={async () => {
            setBusy(true);
            const r = await window.o.universes.collapse(workspace.id, universe.id);
            setBusy(false);
            if (r.ok) onDone(r.index);
          }}
        >
          {busy ? "Fechando…" : universe.isolated ? T.discard : "Fechar universo"}
        </button>
      </div>
    </Shell>
  );
}

/** Texto pronto para colar num agente que trabalha neste universo. */
function agentRequest(status: UniverseStatus, files: string[]): string {
  return [
    `Estou atualizando este universo (branch ${status.branch}) com a Origem (${status.originBranch}) e houve conflito nestes arquivos:`,
    ...files.map((f) => `- ${f}`),
    "",
    "Em cada arquivo, entre os marcadores <<<<<<< e >>>>>>> estão as duas versões: a de cima é a deste universo, a de baixo é a da Origem.",
    "Combine as duas mantendo o que cada lado quis fazer (use `zn history` e `git log` para entender o porquê), apague os marcadores e confira que o projeto ainda funciona.",
    "Não faça commit: eu concluo a atualização pelo Zênite.",
  ].join("\n");
}

export function UpdateDialog({ workspace, universe, onCancel, onDone }: Base & { universe: UniverseMeta; onDone(): void }) {
  const [status, setStatus] = useState<UniverseStatus | null>(null);
  const [message, setMessage] = useState(`Trabalho do universo ${universe.name}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [updated, setUpdated] = useState(false);

  const load = async () => setStatus(await window.o.universes.status(workspace.id, universe.id));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, universe.id]);

  const fail = (r: { error: string; conflicts?: string[] }) => {
    setError(r.error);
    setLeft(r.conflicts ?? []);
  };

  const run = async () => {
    setBusy(true);
    setError("");
    setLeft([]);
    if (status?.pending.length) {
      const c = await window.o.universes.commit(workspace.id, universe.id, message);
      if (!c.ok) {
        setBusy(false);
        setError(`Não consegui commitar: ${c.error}`);
        return;
      }
    }
    const r = await window.o.universes.update(workspace.id, universe.id);
    await load();
    setBusy(false);
    if (r.ok) setUpdated(true);
    else if (!r.conflicts?.length) fail(r);
  };

  const finish = async () => {
    setBusy(true);
    setError("");
    const r = await window.o.universes.finishUpdate(workspace.id, universe.id);
    await load();
    setBusy(false);
    if (r.ok) setUpdated(true);
    else fail(r);
  };

  const abort = async () => {
    setBusy(true);
    const r = await window.o.universes.abortUpdate(workspace.id, universe.id);
    setBusy(false);
    if (r.ok) onDone();
    else fail(r);
  };

  const conflicts = left.length ? left : (status?.conflicts ?? []);
  const copyRequest = async () => {
    await navigator.clipboard.writeText(agentRequest(status!, conflicts.length ? conflicts : status!.pending));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Shell title={T.updateTitle} onCancel={onCancel}>
      <UniverseDiagram mode="update" originLabel={T.origin} universeLabel={universe.name} />
      {!status ? (
        <p className="dialog-text">Lendo o estado do universo…</p>
      ) : updated ? (
        <>
          <p className="dialog-text">
            <strong>Universo em dia com a {T.origin}.</strong> Os commits de <code>{status.originBranch}</code> agora estão em <code>{status.branch}</code>. O próximo merge
            na {T.origin} só leva o trabalho deste universo.
          </p>
          <div className="dialog-actions">
            <button className="primary" onClick={onDone}>
              Fechar
            </button>
          </div>
        </>
      ) : status.updating ? (
        <>
          <div className="git-gate">
            <TriangleAlert size={16} />
            <div>
              <strong>
                Atualização parada: {plural(conflicts.length || status.pending.length, "arquivo precisa", "arquivos precisam")} de uma decisão.
              </strong>
              <span>
                A {T.origin} não mudou. A mesma parte foi alterada aqui e lá, e o git não sabe qual versão manter.
              </span>
            </div>
          </div>
          {conflicts.length > 0 && <FileList files={conflicts} />}
          <ol className="conflict-help">
            <li>
              Em cada arquivo, o trecho entre <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> e <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> mostra as duas versões: em cima a
              deste universo, embaixo a da {T.origin}.
            </li>
            <li>Escolha ou combine as duas e apague os marcadores. Pode ser à mão ou por um agente deste universo.</li>
            <li>Volte aqui e clique em “{T.finishUpdate}”. O Zênite confere se não sobrou marcador antes de commitar.</li>
          </ol>
          <div className="agent-ask">
            <p>Para um agente resolver, copie o pedido pronto e cole no terminal dele.</p>
            <button className="ghost" onClick={copyRequest}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar pedido para o agente"}
            </button>
          </div>
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-actions">
            <button className="ghost danger" disabled={busy} onClick={abort} title="Desfaz a atualização: o universo volta a como estava antes dela">
              {T.abortUpdate}
            </button>
            <span className="spacer" />
            <button className="ghost" onClick={onCancel} title="Fecha esta janela; a atualização continua parada até você voltar">
              Fechar
            </button>
            <button className="primary" disabled={busy} onClick={finish}>
              {busy ? "Conferindo…" : T.finishUpdate}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dialog-text">
            Traz para este universo o que a {T.origin} (<code>{status.originBranch}</code>) ganhou desde que ele foi criado. A {T.origin} não muda. Alterações ainda sem
            commit na {T.origin} não vêm.
          </p>
          <div className="stat-row">
            <span>
              <strong>{status.behind}</strong> {status.behind === 1 ? "commit novo na Origem" : "commits novos na Origem"}
            </span>
            <span>
              <strong>{status.pending.length}</strong> {status.pending.length === 1 ? "alteração sem commit aqui" : "alterações sem commit aqui"}
            </span>
          </div>
          {status.behind === 0 && <p className="dialog-hint">O universo já está em dia com a {T.origin}.</p>}
          {status.behind > 0 && status.pending.length > 0 && (
            <>
              <p className="dialog-hint">Antes de atualizar, as alterações deste universo viram um commit (assim nada se perde se houver conflito).</p>
              <FileList files={status.pending} />
              {status.pending.some(isSecret) && (
                <p className="dialog-error">
                  {status.pending.filter(isSecret).join(", ")} não está no .gitignore e não pode ser commitado. Feche aqui, abra Variáveis (.env) neste universo e clique
                  em “Adicionar ao .gitignore”.
                </p>
              )}
              <label>
                Mensagem do commit dessas alterações
                <input value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
            </>
          )}
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="ghost" onClick={onCancel}>
              {status.behind === 0 ? "Fechar" : "Cancelar"}
            </button>
            {status.behind > 0 && (
              <button className="primary" disabled={busy} onClick={run}>
                {busy ? "Atualizando…" : status.pending.length ? T.commitAndUpdate : T.update}
              </button>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
