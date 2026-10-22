import { useEffect, useId, useState } from "react";
import { Palette } from "lucide-react";
import type { TabProps } from "../SettingsDialog";
import { ACCENTS, customAccent, setAccent, useAccent } from "../../appearance";
import { normalizeAccentHex } from "../../accentColor";
import { useTheme } from "../../theme";
import { CanvasAppearance } from "./CanvasTab";
import { TerminalAppearance } from "./TerminalTab";
import { Choice, Section, SettingRow } from "./controls";

function AccentPicker() {
  const hintId = useId();
  const selected = useAccent(), custom = selected.startsWith("#");
  const [hex, setHex] = useState(customAccent), [error, setError] = useState("");
  useEffect(() => { setHex(customAccent()); setError(""); }, [selected]);
  const commit = () => {
    const color = normalizeAccentHex(hex);
    if (!color) { setError("Use #RGB ou #RRGGBB, como #8EA2FF."); return; }
    setHex(color); setError(""); setAccent(color);
  };
  return <>
    <SettingRow label="Cor principal" hint="Cor dos botões, seleções e abas. Escolha uma cor pronta ou crie a sua.">
      <div className="swatches accent-swatches" role="group" aria-label="Cor principal">
        {ACCENTS.map((a) => <button key={a.value} type="button" className={`swatch${selected === a.value ? " on" : ""}`} style={{ background: a.swatch }} title={a.label} aria-label={a.label} aria-pressed={selected === a.value} onClick={() => setAccent(a.value)} />)}
        <button type="button" className={`swatch accent-custom${custom ? " on" : ""}`} title="Personalizada" aria-label="Cor personalizada" aria-pressed={custom} onClick={() => setAccent(customAccent())}><Palette size={14} /></button>
      </div>
    </SettingRow>
    {custom && <SettingRow label="Cor personalizada" hint={<span id={hintId} role={error ? "alert" : undefined}>{error || "Escolha no espectro ou digite o hexadecimal e pressione Enter."}</span>}>
      <input type="color" aria-label="Escolher cor principal no espectro" value={customAccent()} onChange={(e) => setAccent(e.target.value)} />
      <input className="accent-hex" aria-label="Cor principal em hexadecimal" aria-describedby={hintId} aria-invalid={!!error} type="text" value={hex} placeholder="#8EA2FF" maxLength={7} spellCheck={false} onChange={(e) => { setHex(e.target.value); setError(""); }} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
    </SettingRow>}
  </>;
}

export function PersonalizationTab({ settings, update }: TabProps) {
  const { pref, setPref } = useTheme();
  return <>
    <p className="settings-intro">Personalize a interface, o canvas, as ligações e a aparência dos terminais.</p>
    <nav className="personalization-shortcuts" aria-label="Áreas da personalização">
      {[['interface', 'Interface'], ['canvas', 'Canvas'], ['connections', 'Ligações'], ['items', 'Itens'], ['terminals', 'Terminais']].map(([id, label]) => <button key={id} type="button" className="ghost small" onClick={() => { const section = document.getElementById(`personalization-${id}`); section?.scrollIntoView({ block: "start" }); section?.focus({ preventScroll: true }); }}>{label}</button>)}
    </nav>
    <Section id="personalization-interface" title="Interface">
      <SettingRow label="Tema">
        <Choice label="Tema do aplicativo" value={pref} onChange={setPref} options={[{ value: "system", label: "Seguir o sistema" }, { value: "dark", label: "Escuro" }, { value: "light", label: "Claro" }]} />
      </SettingRow>
      <AccentPicker />
      <SettingRow label="Tamanho da interface" hint="Aumenta ou diminui textos, botões e o canvas.">
        <Choice label="Tamanho da interface" value={settings.uiScale ?? 1} onChange={(uiScale) => void update({ uiScale })} options={[0.9, 1, 1.1, 1.25].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} />
      </SettingRow>
    </Section>
    <CanvasAppearance />
    <TerminalAppearance />
  </>;
}
