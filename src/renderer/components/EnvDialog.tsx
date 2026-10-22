import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Plus, RotateCw, ShieldAlert, Trash2 } from "lucide-react";
import type { EnvInfo, EnvVar } from "../../shared/types";

interface Props {
  workspaceId: string;
  universeId: string | null;
  /** "Origem" ou o nome do universo, para o título. */
  placeName: string;
  onClose(): void;
}

type Row = EnvVar & { rowId: number };
let nextRow = 1;
const toRows = (entries: EnvVar[]): Row[] => entries.map((e) => ({ ...e, rowId: nextRow++ }));
const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Editor simples do .env: uma linha por variável, CHAVE e valor. */
export function EnvDialog({ workspaceId, universeId, placeName, onClose }: Props) {
  const [info, setInfo] = useState<EnvInfo | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  /** Mudou por fora enquanto havia edição sem salvar: avisa em vez de apagar o que foi digitado. */
  const [outside, setOutside] = useState(false);
  const dirty = useRef(false);

  const load = (next: EnvInfo) => {
    dirty.current = false;
    setOutside(false);
    setInfo(next);
    setRows(toRows(next.entries.length ? next.entries : [{ key: "", value: "" }]));
  };
  const reload = () => window.o.env.read(workspaceId, universeId).then(load);

  useEffect(() => {
    void reload();
    // O arquivo mudou por fora (Explorer, editor, agente): recarrega se não há edição pendente.
    return window.o.env.watch(workspaceId, universeId, () => {
      if (dirty.current) setOutside(true);
      else void reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, universeId]);

  const edit = (change: (rs: Row[]) => Row[]) => {
    dirty.current = true;
    setSaved(false);
    setRows(change);
  };
  const update = (rowId: number, patch: Partial<EnvVar>) => edit((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError("");
    const next = await window.o.env.write(
      workspaceId,
      universeId,
      rows.filter((r) => r.key.trim()).map(({ key, value }) => ({ key: key.trim(), value })),
    );
    setSaving(false);
    if (next.error) setError(next.error);
    else {
      load(next);
      setSaved(true);
    }
  };

  const badKey = (k: string) => k.trim() !== "" && !VALID_KEY.test(k.trim());
  const keys = rows.map((r) => r.key.trim()).filter(Boolean);
  const dup = (k: string) => k.trim() !== "" && keys.filter((x) => x === k.trim()).length > 1;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog env-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2>Variáveis de ambiente (.env) · {placeName}</h2>
        {!info ? (
          <p className="dialog-text">Lendo…</p>
        ) : info.error && !info.file ? (
          <p className="dialog-error">{info.error}</p>
        ) : (
          <>
            <p className="dialog-text">
              Chaves e senhas que o projeto usa (ex.: <code>OPENAI_API_KEY</code>). Ficam no arquivo <code>{info.file}</code>
              {info.exists ? "" : " (será criado ao salvar)"}.
            </p>

            {outside && (
              <div className="env-warning">
                <RotateCw size={16} />
                <span>O arquivo foi alterado fora do Zênite. Recarregar mostra a versão do arquivo e descarta o que você mudou aqui.</span>
                <button className="ghost" onClick={() => void reload()}>Recarregar</button>
              </div>
            )}

            {info.gitignored === false && (
              <div className="env-warning">
                <ShieldAlert size={16} />
                <span>
                  O git <strong>não</strong> ignora este .env: ele pode ser commitado e publicado junto com o código, expondo suas chaves.
                </span>
                <button className="ghost" onClick={async () => load(await window.o.env.ignore(workspaceId, universeId))}>
                  Adicionar ao .gitignore
                </button>
              </div>
            )}

            <div className="env-table">
              <div className="env-row env-head">
                <span>Chave</span>
                <span>Valor</span>
                <button className="icon-button" title={show ? "Esconder valores" : "Mostrar valores"} onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {rows.map((r) => (
                <div className="env-row" key={r.rowId}>
                  <input
                    className={badKey(r.key) || dup(r.key) ? "invalid" : ""}
                    value={r.key}
                    placeholder="NOME_DA_CHAVE"
                    spellCheck={false}
                    title={badKey(r.key) ? "Use letras, números e _ (sem espaços), começando por letra" : dup(r.key) ? "Chave repetida" : ""}
                    onChange={(e) => update(r.rowId, { key: e.target.value.replace(/[\s-]+/g, "_").toUpperCase() })}
                  />
                  <input
                    type={show ? "text" : "password"}
                    value={r.value}
                    placeholder="valor"
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => update(r.rowId, { value: e.target.value })}
                  />
                  <button className="icon-button danger" title="Remover variável" onClick={() => edit((rs) => rs.filter((x) => x.rowId !== r.rowId))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button className="env-add" onClick={() => edit((rs) => [...rs, { key: "", value: "", rowId: nextRow++ }])}>
                <Plus size={14} /> Adicionar variável
              </button>
            </div>

            <p className="field-hint">
              Programas que já estão rodando só leem o .env ao iniciar: depois de salvar, reinicie o servidor do projeto. Comentários do arquivo são mantidos.
            </p>
            {error && <p className="dialog-error">{error}</p>}
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost env-reload" title="Ler o .env do disco de novo (descarta o que não foi salvo)" disabled={!info || saving} onClick={() => void reload()}>
            <RotateCw size={14} /> Recarregar
          </button>
          {saved && <span className="saved-hint">Salvo ✓</span>}
          <button type="button" className="ghost" onClick={onClose}>
            Fechar
          </button>
          <button className="primary" disabled={!info || saving || rows.some((r) => badKey(r.key) || dup(r.key))} onClick={save}>
            {saving ? "Salvando…" : "Salvar .env"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
