import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ShellChoice } from "../../../shared/types";
import type { TabProps } from "../SettingsDialog";
import { setTerminalPrefs, TERMINAL_COLOR_THEMES, TERMINAL_FONTS, useTerminalPrefs } from "../../terminalPrefs";
import { MAX_PRESETS, PRESET_COLORS, PRESET_ICONS, saveCustomPresets, useCustomPresets, type CustomPreset } from "../../presets";
import { Choice, Section, SettingRow, Switch } from "./controls";

export function TerminalAppearance() {
  const t = useTerminalPrefs();
  return (
      <Section id="personalization-terminals" title="Aparência dos terminais">
        <SettingRow label="Fonte">
          <Choice label="Fonte" value={t.font} onChange={(font) => setTerminalPrefs({ font })} options={TERMINAL_FONTS.map((f) => ({ value: f.value, label: f.label }))} />
        </SettingRow>
        <SettingRow label="Tamanho da fonte">
          <Choice
            label="Tamanho da fonte"
            value={t.fontSize}
            onChange={(fontSize) => setTerminalPrefs({ fontSize })}
            options={[11, 12, 13, 14, 15, 16, 18, 20].map((n) => ({ value: n, label: `${n} px` }))}
          />
        </SettingRow>
        <SettingRow label="Espaço entre linhas">
          <Choice
            label="Espaço entre linhas"
            value={t.lineHeight}
            onChange={(lineHeight) => setTerminalPrefs({ lineHeight })}
            options={[
              { value: 1, label: "Justo" },
              { value: 1.15, label: "Normal" },
              { value: 1.3, label: "Folgado" },
              { value: 1.5, label: "Bem folgado" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Cores" hint="Os temas prontos valem nos dois temas do app.">
          <Choice label="Cores" value={t.colors} onChange={(colors) => setTerminalPrefs({ colors })} options={TERMINAL_COLOR_THEMES.map((c) => ({ value: c.value, label: c.label }))} />
        </SettingRow>
        <SettingRow label="Cursor">
          <Choice
            label="Cursor"
            value={t.cursorStyle}
            onChange={(cursorStyle) => setTerminalPrefs({ cursorStyle })}
            options={[
              { value: "block", label: "Bloco" },
              { value: "bar", label: "Barra" },
              { value: "underline", label: "Sublinhado" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Cursor piscando">
          <Switch label="Cursor piscando" checked={t.cursorBlink} onChange={(cursorBlink) => setTerminalPrefs({ cursorBlink })} />
        </SettingRow>
      </Section>
  );
}

export function TerminalTab({ settings, update }: TabProps) {
  const t = useTerminalPrefs();
  const [shells, setShells] = useState<{ value: ShellChoice; label: string; available: boolean }[]>([]);
  useEffect(() => void window.o.system.info().then((i) => setShells(i.shells)), []);
  return (
    <>
      <p className="settings-intro">Shell, histórico e comandos rápidos. Para fonte, cores e cursor, use Personalização.</p>
      <Section title="Histórico">
        <SettingRow label="Linhas guardadas para rolar" hint="Mais linhas usam mais memória por terminal.">
          <Choice
            label="Linhas guardadas"
            value={t.scrollback}
            onChange={(scrollback) => setTerminalPrefs({ scrollback })}
            options={[1000, 5000, 10000, 50000].map((n) => ({ value: n, label: n.toLocaleString("pt-BR") }))}
          />
        </SettingRow>
      </Section>
      <Section title="Shell">
        <SettingRow label="Shell dos terminais novos" hint="Vale para terminais abertos depois da troca. Shells que não estão instalados aparecem desativados.">
          <select className="setting-select" aria-label="Shell" value={settings.shell ?? "auto"} onChange={(e) => void update({ shell: e.target.value as ShellChoice })}>
            {shells.map((s) => (
              <option key={s.value} value={s.value} disabled={!s.available}>
                {s.label}
                {s.available ? "" : " (não encontrado)"}
              </option>
            ))}
          </select>
        </SettingRow>
      </Section>
      <PresetsSection />
    </>
  );
}

const blank = (): CustomPreset => ({ id: crypto.randomUUID(), title: "", command: "", cwd: "", icon: "rocket", color: PRESET_COLORS[0] });

/** Comandos rápidos seus: aparecem no "Novo terminal" e (os 3 primeiros) no dock. */
function PresetsSection() {
  const presets = useCustomPresets();
  const [editing, setEditing] = useState<CustomPreset | null>(null);
  const save = () => {
    if (!editing || !editing.title.trim()) return;
    const clean = { ...editing, title: editing.title.trim(), command: editing.command.trim(), cwd: editing.cwd?.trim() || undefined };
    const exists = presets.some((p) => p.id === clean.id);
    saveCustomPresets(exists ? presets.map((p) => (p.id === clean.id ? clean : p)) : [...presets, clean]);
    setEditing(null);
  };
  return (
    <Section title="Presets de terminal">
      <p className="settings-intro">Comandos que você abre sempre (ex.: <code>npm run dev</code>, <code>claude --model opus</code>). Até {MAX_PRESETS}; os 3 primeiros ficam no dock.</p>
      {presets.length > 0 && (
        <ul className="skill-list">
          {presets.map((p) => {
            const Icon = PRESET_ICONS[p.icon] ?? PRESET_ICONS.terminal;
            return (
              <li key={p.id}>
                <div>
                  <span className="preset-dot" style={{ color: p.color }}>
                    <Icon size={15} />
                  </span>
                  <strong>{p.title}</strong>
                  <span className="setting-hint">
                    <code>{p.command || "(só o shell)"}</code>
                    {p.cwd ? ` · em ${p.cwd}` : ""}
                  </span>
                </div>
                <span className="skill-actions">
                  <button className="icon-button" title="Editar" onClick={() => setEditing(p)}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-button danger" title="Remover" onClick={() => saveCustomPresets(presets.filter((x) => x.id !== p.id))}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <div className="preset-form">
          <label>
            Nome
            <input autoFocus value={editing.title} placeholder="ex.: Servidor da loja" onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </label>
          <label>
            Comando <small>vazio abre só o shell</small>
            <input value={editing.command} placeholder="ex.: npm run dev" onChange={(e) => setEditing({ ...editing, command: e.target.value })} />
          </label>
          <label>
            Pasta <small>vazio usa a da galáxia</small>
            <span className="input-row">
              <input value={editing.cwd ?? ""} placeholder="ex.: C:\dev\loja" onChange={(e) => setEditing({ ...editing, cwd: e.target.value })} />
              <button
                type="button"
                className="ghost"
                onClick={async () => {
                  const dir = await window.o.workspaces.pickDirectory(editing.cwd || undefined);
                  if (dir) setEditing({ ...editing, cwd: dir });
                }}
              >
                Escolher
              </button>
            </span>
          </label>
          <div className="preset-pickers">
            <span className="setting-label">Ícone</span>
            <div className="swatches">
              {Object.entries(PRESET_ICONS).map(([key, Icon]) => (
                <button key={key} className={`icon-pick${editing.icon === key ? " on" : ""}`} title={key} onClick={() => setEditing({ ...editing, icon: key })}>
                  <Icon size={15} />
                </button>
              ))}
            </div>
            <span className="setting-label">Cor</span>
            <div className="swatches">
              {PRESET_COLORS.map((c) => (
                <button key={c} className={`swatch${editing.color === c ? " on" : ""}`} style={{ background: c }} title={c} onClick={() => setEditing({ ...editing, color: c })} />
              ))}
            </div>
          </div>
          <div className="dialog-actions">
            <button className="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="primary" disabled={!editing.title.trim()} onClick={save}>
              Salvar preset
            </button>
          </div>
        </div>
      ) : (
        <div className="skill-buttons">
          <button className="ghost" disabled={presets.length >= MAX_PRESETS} onClick={() => setEditing(blank())}>
            <Plus size={14} /> Adicionar preset
          </button>
        </div>
      )}
    </Section>
  );
}
