import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { AccountAgent, AccountMeta, AgentProvider, WorkspaceIndex } from "../../shared/types";
import { fromCustom, PRESETS, presetFor, type AgentPreset } from "../agents";
import { useCustomPresets } from "../presets";
import { confirmDialog } from "./AppDialog";

export interface NewTerminalInput {
  title: string;
  command: string;
  cwd: string;
  account?: string;
  accountName?: string;
  provider?: AgentProvider;
}

interface Props {
  defaultCwd: string;
  /** Galáxia ainda sem pasta de projeto: oferece usar a pasta escolhida aqui. */
  offerGalaxyDir?: boolean;
  initialPreset?: AgentPreset;
  accounts: AccountMeta[];
  onIndex(index: WorkspaceIndex): void;
  onCreate(input: NewTerminalInput, useAsGalaxyDir: boolean): void;
  onCancel(): void;
}

const NEW_ACCOUNT = "__nova__";

export function NewTerminalDialog({ defaultCwd, offerGalaxyDir, initialPreset, accounts, onIndex, onCreate, onCancel }: Props) {
  // Com contas criadas, o agente já abre na primeira delas: "sem conta" divide um login só entre todos.
  const firstAccount = (command: string, provider?: AgentProvider) => {
    const k = presetFor(command, provider).kind;
    return accounts.find((a) => a.agent === k)?.id;
  };
  const start = initialPreset ?? PRESETS[0];
  const [form, setForm] = useState<NewTerminalInput>({
    title: start.title,
    command: start.command,
    cwd: start.cwd || defaultCwd,
    provider: start.provider,
    account: firstAccount(start.command, start.provider),
  });
  const custom = useCustomPresets();
  const presets = [...PRESETS, ...custom.map(fromCustom)];
  const [newAccount, setNewAccount] = useState<string | null>(null);
  const [adopt, setAdopt] = useState(true);
  const [keyReady, setKeyReady] = useState(false);
  const [status, setStatus] = useState<Record<string, { loggedIn: boolean; dir: string }>>({});

  useEffect(() => {
    void window.o.accounts.status().then(setStatus);
  }, [accounts]);

  const browse = async () => {
    const picked = await window.o.workspaces.pickDirectory(form.cwd.trim() || undefined);
    if (picked) setForm((f) => ({ ...f, cwd: picked }));
  };

  // Contas: Claude Code, Codex e Antigravity (a OpenRouter usa a própria chave).
  const current = presetFor(form.command, form.provider);
  const kind = current.kind;
  const agent: AccountAgent | null = kind === "claude" || kind === "codex" || kind === "antigravity" ? kind : null;
  const options = agent ? accounts.filter((a) => a.agent === agent) : [];
  const selected = options.find((a) => a.id === form.account);

  const createAccount = async () => {
    if (!agent || !newAccount?.trim()) return;
    const index = await window.o.accounts.create(newAccount, agent);
    onIndex(index);
    const created = (index.accounts ?? []).filter((a) => a.agent === agent).at(-1);
    setNewAccount(null);
    if (created) setForm({ ...form, account: created.id });
  };

  const removeAccount = async (a: AccountMeta) => {
    if (!await confirmDialog({ title: `Remover a conta "${a.name}"?`, message: "O login guardado nela será apagado. Terminais que já usam essa conta continuam abertos; o perfil deles é apagado quando fecharem.", cancel: "Cancelar", ok: "Remover conta", danger: true })) return;
    onIndex(await window.o.accounts.remove(a.id));
    setForm({ ...form, account: undefined });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const account = selected ? { account: selected.id, accountName: selected.name } : { account: undefined, accountName: undefined };
    onCreate({ ...form, ...account, title: form.title.trim() || form.command.trim() || "Shell" }, !!offerGalaxyDir && adopt && !!form.cwd.trim());
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form className="dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2>Novo terminal</h2>
        <div className="preset-grid">
          {presets.map((p) => (
            <button
              type="button"
              key={p.id ?? p.kind}
              className={`preset-card${form.command === p.command && form.provider === p.provider && (!p.id || form.title === p.title) ? " active" : ""}`}
              style={{ "--agent": p.color } as React.CSSProperties}
              onClick={() => setForm({ title: p.title, command: p.command, cwd: p.cwd || form.cwd, provider: p.provider, account: firstAccount(p.command, p.provider) })}
            >
              <span className="agent-chip large">
                <p.icon size={18} />
              </span>
              <strong>{p.title}</strong>
              <small>{p.description}</small>
            </button>
          ))}
        </div>
        <label>
          Nome
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Comando <small>vazio abre só o shell</small>
          <input value={form.command} placeholder="ex.: claude --model opus" onChange={(e) => setForm({ ...form, command: e.target.value })} />
        </label>
        <label>
          Diretório de trabalho <small>vazio usa a pasta do usuário</small>
          <span className="input-with-icon">
            <input value={form.cwd} placeholder="ex.: C:\dev\meu-projeto" onChange={(e) => setForm({ ...form, cwd: e.target.value })} />
            <button type="button" className="icon-button" title="Escolher pasta" aria-label="Escolher pasta" onClick={browse}>
              <FolderOpen size={15} />
            </button>
          </span>
        </label>
        {offerGalaxyDir && form.cwd.trim() && (
          <label className="toggle">
            <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} />
            <span>
              Usar esta pasta como projeto da galáxia <small>assim os universos paralelos copiam esta pasta e permitem merge</small>
            </span>
          </label>
        )}
        {kind === "openrouter" && <OpenRouterKey onReady={setKeyReady} />}
        {current.install && <p className="field-hint">{current.install}</p>}
        {agent && (
          <label>
            Conta <small>cada conta tem o próprio login</small>
            {newAccount === null ? (
              <div className="input-row">
                <select
                  value={form.account ?? ""}
                  onChange={(e) => (e.target.value === NEW_ACCOUNT ? setNewAccount("") : setForm({ ...form, account: e.target.value || undefined }))}
                >
                  {options.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {status[a.id] && !status[a.id].loggedIn ? " · sem login" : ""}
                    </option>
                  ))}
                  <option value={NEW_ACCOUNT}>+ Nova conta…</option>
                  <option value="">Sem conta (login compartilhado)</option>
                </select>
                {selected && (
                  <button type="button" className="ghost" onClick={() => removeAccount(selected)}>
                    Remover conta
                  </button>
                )}
              </div>
            ) : (
              <div className="input-row">
                <input
                  autoFocus
                  value={newAccount}
                  placeholder="ex.: Trabalho"
                  onChange={(e) => setNewAccount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createAccount();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setNewAccount(null);
                    }
                  }}
                />
                <button type="button" className="ghost" onClick={() => void createAccount()}>
                  Criar conta
                </button>
              </div>
            )}
            {newAccount === null && !selected && (
              <span className="field-hint">Todos os terminais sem conta usam o mesmo login: logar em um troca o login de todos. Para separar, escolha ou crie uma conta.</span>
            )}
            {selected && status[selected.id]?.loggedIn && <span className="field-hint">Já logado. O login fica guardado em {status[selected.id].dir}.</span>}
            {selected && status[selected.id] && !status[selected.id].loggedIn && (
              <span className="field-hint">
                Faça o login uma vez dentro do terminal ({agent === "claude" ? "/login" : agent === "codex" ? "na tela de login do Codex" : "na tela de login do agy"}). Ele fica salvo nesta conta para as próximas vezes.
              </span>
            )}
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={kind === "openrouter" && !keyReady}>
            Criar terminal
          </button>
        </div>
      </form>
    </div>
  );
}

/** Chave da OpenRouter: salva criptografada pelo Windows; a página só sabe se existe. */
export function OpenRouterKey({ onReady }: { onReady?(ready: boolean): void }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void window.o.secrets.status().then((s) => {
      setSaved(s.openrouter);
      setEditing(!s.openrouter);
      onReady?.(s.openrouter);
      if (!s.encryption) setError("A criptografia do Windows não está disponível: não dá para guardar a chave com segurança.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    const r = await window.o.secrets.setOpenRouterKey(key);
    if (!r.ok) return setError(r.error ?? "Não consegui salvar a chave.");
    setKey("");
    setError("");
    setSaved(true);
    setEditing(false);
    onReady?.(true);
  };

  if (saved === null) return null;
  return (
    <label>
      Chave da OpenRouter <small>fica criptografada neste computador; só os terminais OpenRouter a recebem</small>
      {editing ? (
        <div className="input-row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            placeholder="sk-or-..."
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
          <button type="button" className="ghost" disabled={!key.trim()} onClick={() => void save()}>
            Salvar chave
          </button>
          {saved && (
            <button type="button" className="ghost" onClick={() => (setEditing(false), setKey(""))}>
              Cancelar
            </button>
          )}
        </div>
      ) : (
        <div className="input-row key-saved">
          <span>Chave salva</span>
          <button type="button" className="ghost" onClick={() => setEditing(true)}>
            Trocar
          </button>
        </div>
      )}
      {error && <span className="dialog-error">{error}</span>}
      {!saved && (
        <span className="field-hint">
          Crie a chave em openrouter.ai/keys. O consumo sai dos seus créditos da OpenRouter. Para escolher o modelo, use Configurações → Agentes.
        </span>
      )}
    </label>
  );
}
