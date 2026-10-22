import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { comboOf, keysFor, resetShortcuts, setCapturingShortcut, setKeys, shortcutUsing, SHORTCUTS, useShortcutKeys, validCombo } from "../../shortcuts";
import { Section } from "./controls";

const FIXED: { label: string; keys: string }[] = [
  { label: "Arrastar qualquer elemento por qualquer ponto (não só pelo título)", keys: "Alt + arrastar" },
  { label: "Selecionar vários / uma área", keys: "Ctrl + clique / Shift + arrastar" },
  { label: "Ir ao terminal 1 a 9", keys: "Ctrl+1 … Ctrl+9" },
  { label: "Ferramentas de desenho (selecionar, retângulo, elipse, losango, seta, linha, lápis, texto)", keys: "V R O D A L P T" },
  { label: "Desfazer / refazer no canvas (mover, ligar, criar, remover, desenhos)", keys: "Ctrl+Z / Ctrl+Y" },
  { label: "Duplicar / excluir desenhos selecionados", keys: "Ctrl+D / Delete" },
];

function Keys({ combo }: { combo: string }) {
  if (!combo) return <span className="setting-hint">Nenhum</span>;
  return (
    <span className="keys">
      {combo.split("+").map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  );
}

export function ShortcutsTab() {
  const keys = useShortcutKeys();
  const [filter, setFilter] = useState("");
  const [capturing, setCapturing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Esperando a combinação nova: a próxima tecla com Ctrl/Alt vira o atalho.
  useEffect(() => {
    if (!capturing) return;
    setCapturingShortcut(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setCapturing(null);
      const combo = comboOf(e);
      if (!combo || combo.endsWith("+")) return;
      if (!validCombo(combo)) return setMessage("Use Ctrl ou Alt junto (ou uma tecla F1–F12).");
      const other = shortcutUsing(combo, capturing);
      if (other) setKeys(other.id, "");
      setKeys(capturing, combo);
      setMessage(other ? `${combo} saiu de "${other.label}".` : "");
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      setCapturingShortcut(false);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [capturing]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = SHORTCUTS.filter((s) => !filter || norm(s.label + " " + keys[s.id]).includes(norm(filter)));
  const groups = [...new Set(visible.map((s) => s.group))];

  return (
    <>
      <p className="settings-intro">
        Clique em um atalho e aperte a combinação nova. <kbd>Ctrl</kbd> + letra sozinha não funciona dentro do terminal: lá ela é do shell.
      </p>
      <div className="shortcut-tools">
        <span className="search-field">
          <Search size={14} />
          <input value={filter} placeholder="Filtrar atalhos" onChange={(e) => setFilter(e.target.value)} />
        </span>
        <button className="ghost" onClick={resetShortcuts}>
          <RotateCcw size={13} /> Restaurar padrão
        </button>
      </div>
      {message && <p className="setting-hint">{message}</p>}
      {groups.map((g) => (
        <Section key={g} title={g}>
          {visible
            .filter((s) => s.group === g)
            .map((s) => (
              <div key={s.id} className="setting-row shortcut-row">
                <span className="setting-label">{s.label}</span>
                <span className="setting-control">
                  <button className={`shortcut-keys${capturing === s.id ? " capturing" : ""}`} onClick={() => setCapturing(capturing === s.id ? null : s.id)}>
                    {capturing === s.id ? "Aperte as teclas… (Esc cancela)" : <Keys combo={keys[s.id]} />}
                  </button>
                  {keysFor(s.id) && (
                    <button className="icon-button" title="Sem atalho" onClick={() => setKeys(s.id, "")}>
                      ×
                    </button>
                  )}
                </span>
              </div>
            ))}
        </Section>
      ))}
      <Section title="Fixos">
        {FIXED.map((f) => (
          <div key={f.label} className="setting-row shortcut-row">
            <span className="setting-label">{f.label}</span>
            <span className="setting-control">
              <span className="keys fixed">{f.keys}</span>
            </span>
          </div>
        ))}
      </Section>
    </>
  );
}
