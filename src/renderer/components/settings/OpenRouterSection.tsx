import { useEffect, useState } from "react";
import type { TabProps } from "../SettingsDialog";
import { Section, SettingRow } from "./controls";

/** OpenRouter: chave (criptografada; a página só sabe se existe) e modelo do Claude Code. */
export function OpenRouterSection({ settings, update }: TabProps) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState(settings.openrouterModel ?? "");

  const refresh = () => void window.o.secrets.status().then((s) => setSaved(s.openrouter));
  useEffect(refresh, []);

  const save = async () => {
    const r = await window.o.secrets.setOpenRouterKey(key);
    if (!r.ok) return setError(r.error ?? "Não consegui salvar a chave.");
    setKey("");
    setError("");
    refresh();
  };

  return (
    <Section title="OpenRouter">
      <SettingRow
        label="Chave da API"
        hint={
          saved
            ? "Salva e criptografada pelo Windows neste computador. Só os terminais OpenRouter a recebem."
            : "Crie em openrouter.ai/keys. Fica criptografada pelo Windows; nunca vai para o canvas nem para os backups."
        }
      >
        <div className="input-row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            placeholder={saved ? "Nova chave para trocar" : "sk-or-..."}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
          <button className="ghost" disabled={!key.trim()} onClick={() => void save()}>
            {saved ? "Trocar" : "Salvar"}
          </button>
          {saved && (
            <button
              className="ghost danger"
              onClick={async () => {
                await window.o.secrets.removeOpenRouterKey();
                refresh();
              }}
            >
              Remover
            </button>
          )}
        </div>
      </SettingRow>
      {error && <p className="dialog-error">{error}</p>}
      <SettingRow label="Modelo" hint="Nome do modelo na OpenRouter (ex.: anthropic/claude-sonnet-4.5). Vazio usa o padrão do Claude Code. Vale para terminais novos.">
        <input
          value={model}
          placeholder="padrão"
          spellCheck={false}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => void update({ openrouterModel: model.trim() || undefined })}
        />
      </SettingRow>
    </Section>
  );
}
