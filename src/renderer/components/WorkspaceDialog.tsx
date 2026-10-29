import { useEffect, useState } from "react";
import { DEFAULT_COPY_PATTERNS, type PathGrantInfo, type WorkspaceMeta } from "../../shared/types";
import { T } from "../vocab";

interface Props {
  initial?: WorkspaceMeta;
  onSubmit(name: string, dir: string, copyPatterns: string[], agentCommits: "auto" | "suggest"): void;
  onCancel(): void;
}

export function WorkspaceDialog({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dir, setDir] = useState(initial?.dir ?? "");
  const [mode, setMode] = useState<"auto" | "suggest">(initial?.agentCommits ?? "auto");
  const [patterns, setPatterns] = useState((initial?.copyPatterns ?? DEFAULT_COPY_PATTERNS).join("\n"));
  const [grants, setGrants] = useState<PathGrantInfo[]>([]);
  useEffect(() => {
    if (initial) void window.o.workspaces.pathGrants(initial.id).then(setGrants);
  }, [initial]);
  // Revogar vale na hora, sem esperar o Salvar: é uma permissão, não um campo do formulário.
  const revoke = async (entry: string) => setGrants(await window.o.workspaces.revokePathGrant(initial!.id, entry));

  const browse = async () => {
    const picked = await window.o.workspaces.pickDirectory();
    if (!picked) return;
    setDir(picked);
    // Sem nome ainda: usa o nome da pasta.
    if (!name.trim()) setName(picked.split(/[\\/]/).filter(Boolean).pop() ?? "");
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name, dir, patterns.split("\n"), mode);
        }}
      >
        <h2>{initial ? T.editGalaxy : T.newGalaxy}</h2>
        <label>
          Nome
          <input autoFocus value={name} placeholder="ex.: Meu projeto" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Pasta do projeto <small>terminais novos abrem aqui</small>
          <div className="input-row">
            <input value={dir} placeholder="ex.: C:\dev\meu-projeto" onChange={(e) => setDir(e.target.value)} />
            <button type="button" className="ghost" onClick={browse}>
              Procurar…
            </button>
          </div>
        </label>
        <fieldset className="radio-group">
          <legend>Commits dos agentes</legend>
          <label className="toggle">
            <input type="radio" name="agent-commits" checked={mode === "auto"} onChange={() => setMode("auto")} />
            <span>
              <strong>Automático</strong> — os agentes commitam sozinhos, no formato padrão (título + porquê).
            </span>
          </label>
          <label className="toggle">
            <input type="radio" name="agent-commits" checked={mode === "suggest"} onChange={() => setMode("suggest")} />
            <span>
              <strong>Só sugerir</strong> — os agentes deixam a mensagem pronta e você commita do seu jeito.
            </span>
          </label>
        </fieldset>
        <label>
          Arquivos fora do git que cada universo novo recebe <small>um padrão por linha</small>
          <textarea rows={4} value={patterns} spellCheck={false} onChange={(e) => setPatterns(e.target.value)} />
          <span className="field-hint">
            Ex.: <code>.env</code>, <code>**/.env.local</code>, <code>config/*.json</code>. Cada universo recebe uma cópia própria, então dá para
            mudar a porta ou o banco de um universo sem afetar os outros.
          </span>
        </label>
        {grants.length > 0 && (
          <fieldset className="radio-group">
            <legend>O Sol desta galáxia pode ligar, sem perguntar</legend>
            {grants.map((g) => (
              <div key={g.entry} className="path-grant">
                <span>
                  <strong>{g.label}</strong>
                  {g.detail && <small>{g.detail}</small>}
                </span>
                <button type="button" className="ghost" onClick={() => void revoke(g.entry)}>
                  Revogar
                </button>
              </div>
            ))}
            <span className="field-hint">Liberado no pop-up com "Lembrar". Depois de revogar, o Zênite volta a perguntar. O que já está ligado no canvas continua até você apagar a ligação.</span>
          </fieldset>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            {initial ? "Salvar" : "Criar"}
          </button>
        </div>
      </form>
    </div>
  );
}
