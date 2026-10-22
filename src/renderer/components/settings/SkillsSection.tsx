import { useEffect, useState } from "react";
import { FolderOpen, Plus, RefreshCw, Share2, Trash2 } from "lucide-react";
import type { SkillsState } from "../../../shared/types";
import { plural } from "../../../shared/plural";
import { Section } from "./controls";

/** Biblioteca de skills: uma vez aqui, vale para todos os agentes e todas as contas. */
export function SkillsSection() {
  const [state, setState] = useState<SkillsState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => void window.o.skills.state().then(setState), []);

  const run = async (fn: () => Promise<SkillsState | { ok: boolean; error?: string; state: SkillsState }>) => {
    setBusy(true);
    setError("");
    const r = await fn();
    setBusy(false);
    if ("state" in r) {
      setState(r.state);
      if (!r.ok) setError(r.error ?? "Não consegui adicionar.");
    } else setState(r);
  };

  if (!state) return null;
  const conflicts = state.results.flatMap((r) => r.conflicts.map((c) => `${c} (${r.target.label})`));

  return (
    <Section title="Skills para todos os agentes">
      <p className="settings-intro">
        Uma skill adicionada aqui vai para o <strong>Claude Code</strong> (sua pasta e cada conta) e para a pasta padrão <code>~/.agents/skills</code>, lida pelo{" "}
        <strong>Codex</strong> (todas as contas), <strong>Gemini</strong> e outros. Agentes que não carregam skills recebem a lista no guia (<code>AGENTS.md</code>/
        <code>CLAUDE.md</code>) com o caminho de cada uma.
      </p>
      <ul className="skill-list">
        {state.skills.map((s) => (
          <li key={s.name}>
            <div>
              <strong>{s.name}</strong>
              {s.builtin && <span className="chip-tag">do Zênite</span>}
              <span className="setting-hint">{s.description || "Sem descrição."}</span>
            </div>
            {!s.builtin && (
              <span className="skill-actions">
                <button className="icon-button" title="Abrir a pasta da skill" onClick={() => window.o.skills.open(s.dir)}>
                  <FolderOpen size={14} />
                </button>
                <button className="icon-button danger" title="Remover de todos os agentes" disabled={busy} onClick={() => void run(() => window.o.skills.remove(s.name))}>
                  <Trash2 size={14} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="skill-buttons">
        <button className="ghost" disabled={busy} onClick={() => void run(() => window.o.skills.add())}>
          <Plus size={14} /> Adicionar skill (pasta com SKILL.md)
        </button>
        <button className="ghost" disabled={busy} title="Copia de novo para todos os agentes" onClick={() => void run(() => window.o.skills.sync())}>
          <RefreshCw size={14} /> Sincronizar
        </button>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      {state.discovered.length > 0 && (
        <div className="skill-found">
          <span className="setting-label">Encontradas nos seus agentes</span>
          <span className="setting-hint">Hoje só um agente as vê. Compartilhar copia para a biblioteca e espalha para todos.</span>
          <ul className="skill-list">
            {state.discovered.map((s) => (
              <li key={`${s.source}-${s.name}`}>
                <div>
                  <strong>{s.name}</strong>
                  <span className="chip-tag">{s.source}</span>
                  <span className="setting-hint">{s.description || "Sem descrição."}</span>
                </div>
                <button className="ghost" disabled={busy} onClick={() => void run(() => window.o.skills.add(s.dir))}>
                  <Share2 size={13} /> Compartilhar com todos
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="skill-targets">
        <summary>Onde as skills foram instaladas</summary>
        <ul>
          {state.results.map((r) => (
            <li key={r.target.root}>
              <strong>{r.target.label}</strong>: {plural(r.installed.length, "skill", "skills")} · <code>{r.target.root}</code>
            </li>
          ))}
        </ul>
        {conflicts.length > 0 && (
          <p className="setting-hint">Não substituídas porque já existe uma skill sua com o mesmo nome: {conflicts.join(", ")}.</p>
        )}
      </details>
    </Section>
  );
}
