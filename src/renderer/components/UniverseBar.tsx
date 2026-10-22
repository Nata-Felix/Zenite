import { useEffect, useState } from "react";
import { ArrowDownToLine, GitBranch, GitCommitHorizontal, GitMerge, Sun, Trash2, TriangleAlert } from "lucide-react";
import { ParallelUniverseIcon } from "./ParallelUniverseIcon";
import { useCommands } from "../commands";
import type { GitRepoState, UniverseMeta, UniverseStatus, WorkspaceIndex, WorkspaceMeta } from "../../shared/types";
import { GitSetupDialog } from "./GitSetupDialog";
import { ProposalsDialog } from "./ProposalsDialog";
import { T } from "../vocab";
import { EnvDialog } from "./EnvDialog";
import { CollapseDialog, ConvergeDialog, NewUniverseDialog, UpdateDialog } from "./UniverseDialogs";
import { plural } from "../../shared/plural";

interface Props {
  workspace: WorkspaceMeta;
  universe?: UniverseMeta;
  onIndex(index: WorkspaceIndex): void;
}

type Open = "new" | "converge" | "collapse" | "update" | "env" | "git" | "proposals" | null;

/** Galáxia atual, Origem e universos paralelos, com as ações do universo aberto. */
export function UniverseBar({ workspace, universe, onIndex }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const universes = workspace.universes ?? [];
  const proposals = workspace.proposals ?? [];
  const [repo, setRepo] = useState<GitRepoState | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!workspace.dir) return setRepo(null);
    window.o.git.state(workspace.id, null).then(setRepo);
    // Ao fechar um diálogo (ex.: o git foi ativado dentro dele), confere de novo.
  }, [workspace.id, workspace.dir, refresh, open === null]);
  // Estado do universo aberto: commits novos na Origem e atualização parada em conflito.
  const [uStatus, setUStatus] = useState<UniverseStatus | null>(null);
  useEffect(() => {
    if (!universe?.isolated) return setUStatus(null);
    let alive = true;
    const read = () => window.o.universes.status(workspace.id, universe.id).then((st) => alive && setUStatus(st));
    void read();
    // A Origem pode avançar a qualquer momento (outro universo, um agente, você no terminal).
    const timer = setInterval(read, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [workspace.id, universe?.id, universe?.isolated, open === null]);
  const needsGit = !!workspace.dir && !!repo && (!repo.isRepo || !repo.hasCommits);
  const go = async (id: string | null) => onIndex(await window.o.universes.setActive(workspace.id, id));
  // O .env e "criar universo" ficam na barra inferior; os diálogos continuam aqui.
  useCommands((c) => {
    if (c === "open-env") setOpen("env");
    else if (c === "new-universe") setOpen("new");
  });

  return (
    <div className="universe-bar">
      <div className="universe-head">
        <span className="galaxy-name">{workspace.name}</span>
        <span className="universe-path" title={universe?.path ?? workspace.dir}>
          {universe?.branch && <GitBranch size={11} />}
          <span className="truncate">{universe?.branch || (universe?.path ?? workspace.dir)}</span>
        </span>
        {proposals.length > 0 && (
          <button className="env-button attention" title="Mensagens de commit sugeridas pelos agentes" onClick={() => setOpen("proposals")}>
            <GitCommitHorizontal size={12} /> {plural(proposals.length, "proposta de commit", "propostas de commit")}
          </button>
        )}
      </div>
      {needsGit && (
        <div className="git-needed">
          <TriangleAlert size={14} />
          <span>{!repo!.isRepo ? "Esta pasta ainda não usa git." : "O repositório ainda não tem commits."} Sem isso não há memória do projeto nem cópias isoladas.</span>
          <button className="primary" onClick={() => setOpen("git")}>
            Ativar git
          </button>
        </div>
      )}
      <div className="universe-chips">
        <button className={`universe-chip origin${!universe ? " active" : ""}`} onClick={() => go(null)} title={`${T.origin}: ${T.originHint}`}>
          <Sun size={13} /> {T.origin}
        </button>
        {universes.map((u) => (
          <button
            key={u.id}
            className={`universe-chip${universe?.id === u.id ? " active" : ""}`}
            onClick={() => go(u.id)}
            title={u.isolated ? `${T.universe} · branch ${u.branch}` : `${T.universe} · sem git: só um canvas separado`}
          >
            <ParallelUniverseIcon size={13} /> {u.name}
            {!u.isolated && <span className="chip-tag">só canvas</span>}
          </button>
        ))}
      </div>
      {universe && (
        <div className="universe-actions">
          {universe.isolated && (
            <button
              className={`universe-action${uStatus?.updating ? " attention" : ""}`}
              onClick={() => setOpen("update")}
              title={
                uStatus?.updating
                  ? "Atualização parada em conflito: clique para ver os arquivos e concluir"
                  : `Traz para este universo os commits novos da ${T.origin}. A ${T.origin} não muda.`
              }
            >
              {uStatus?.updating ? <TriangleAlert size={13} /> : <ArrowDownToLine size={13} />}
              {uStatus?.updating ? "Resolver conflitos" : T.update}
              {!uStatus?.updating && !!uStatus?.behind && <span className="count-badge">{uStatus.behind}</span>}
            </button>
          )}
          {universe.isolated && (
            <button className="universe-action" onClick={() => setOpen("converge")} title={`${T.convergeTitle}: leva as mudanças deste universo para a Origem`}>
              <GitMerge size={13} /> {T.merge}
            </button>
          )}
          {!universe.isolated && (
            <span className="universe-note" title="Criado sem git: não há cópia dos arquivos nem branch">
              Só canvas: os terminais daqui mexem direto na pasta da {T.origin}. Não há merge, o trabalho já está lá.
            </span>
          )}
          <button className="universe-action danger" onClick={() => setOpen("collapse")} title={universe.isolated ? `${T.collapseTitle}: apaga a cópia e a branch` : "Fecha este canvas. Os arquivos da pasta não mudam."}>
            <Trash2 size={13} /> {universe.isolated ? T.discard : "Fechar universo"}
          </button>
        </div>
      )}

      {open === "git" && repo && (
        <GitSetupDialog
          workspace={workspace}
          state={repo}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {open === "proposals" && <ProposalsDialog workspace={workspace} onIndex={onIndex} onClose={() => setOpen(null)} />}
      {open === "env" && (
        <EnvDialog workspaceId={workspace.id} universeId={universe?.id ?? null} placeName={universe?.name ?? T.origin} onClose={() => setOpen(null)} />
      )}
      {open === "new" && (
        <NewUniverseDialog
          workspace={workspace}
          onCancel={() => setOpen(null)}
          onIndex={onIndex}
          onCreated={(index) => {
            setOpen(null);
            onIndex(index);
          }}
        />
      )}
      {open === "converge" && universe && (
        <ConvergeDialog
          workspace={workspace}
          universe={universe}
          onCancel={() => setOpen(null)}
          onUpdate={() => setOpen("update")}
          onDone={(index) => {
            setOpen(null);
            onIndex(index);
          }}
        />
      )}
      {open === "update" && universe && (
        <UpdateDialog workspace={workspace} universe={universe} onCancel={() => setOpen(null)} onDone={() => setOpen(null)} />
      )}
      {open === "collapse" && universe && (
        <CollapseDialog
          workspace={workspace}
          universe={universe}
          onCancel={() => setOpen(null)}
          onDone={(index) => {
            setOpen(null);
            onIndex(index);
          }}
        />
      )}
    </div>
  );
}
