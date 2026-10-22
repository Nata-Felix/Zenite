import { useEffect, useState } from "react";
import { FolderOpen, History, Save, Trash2 } from "lucide-react";
import type { BackupInfoView } from "../../../shared/types";
import { humanSize, shortDate } from "../../../shared/format";
import type { TabProps } from "../SettingsDialog";
import { Section, SettingRow, Switch } from "./controls";
import { confirmDialog } from "../AppDialog";

export function DataTab({ settings, update }: TabProps) {
  const [backups, setBackups] = useState<BackupInfoView[] | null>(null);
  const [usage, setUsage] = useState<{ label: string; bytes: number }[] | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void window.o.backups.list().then(setBackups);
    void window.o.system.usage().then(setUsage);
    void window.o.system.info().then((i) => setDataDir(i.dataDir));
  }, []);

  const restore = async (b: BackupInfoView) => {
    const ok = await confirmDialog({
      title: `Restaurar o backup de ${shortDate(b.created)}?`,
      message: "Galáxias, canvases, notas e tabelas voltam a como estavam. O estado de agora é guardado antes, como um backup novo — dá para desfazer. Terminais abertos continuam rodando.",
      cancel: "Cancelar",
      ok: "Restaurar",
    });
    if (!ok) return;
    setBusy(true);
    const r = await window.o.backups.restore(b.id);
    // Se deu certo, a interface recarrega sozinha.
    if (!r.ok) {
      setBusy(false);
      setError(r.error ?? "Não consegui restaurar.");
    }
  };

  return (
    <>
      <Section title="Backups">
        <SettingRow label="Backup automático" hint="Ao abrir, a cada 6 horas e ao fechar. Guarda galáxias, canvases, notas e tabelas (não guarda mídia, universos nem logins). Ficam os 30 mais recentes.">
          <Switch label="Backup automático" checked={settings.autoBackup !== false} onChange={(autoBackup) => void update({ autoBackup })} />
        </SettingRow>
        <div className="skill-buttons">
          <button
            className="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setBackups(await window.o.backups.create());
              setBusy(false);
            }}
          >
            <Save size={14} /> Fazer backup agora
          </button>
          <button className="ghost" onClick={() => window.o.backups.open()}>
            <FolderOpen size={14} /> Abrir pasta de backups
          </button>
        </div>
        {error && <p className="dialog-error">{error}</p>}
        {backups && backups.length === 0 && <p className="setting-hint">Nenhum backup ainda.</p>}
        {backups && backups.length > 0 && (
          <ul className="skill-list">
            {backups.map((b) => (
              <li key={b.id}>
                <div>
                  <strong>{shortDate(b.created)}</strong>
                  <span className="chip-tag">{b.reason}</span>
                  <span className="setting-hint">
                    {b.canvases} {b.canvases === 1 ? "canvas" : "canvases"} · {humanSize(b.bytes)}
                  </span>
                </div>
                <span className="skill-actions">
                  <button className="ghost small" disabled={busy} onClick={() => void restore(b)}>
                    <History size={13} /> Restaurar
                  </button>
                  <button
                    className="icon-button danger"
                    title="Apagar este backup"
                    disabled={busy}
                    onClick={async () => setBackups(await window.o.backups.remove(b.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Espaço usado">
        {!usage ? (
          <p className="setting-hint">Calculando…</p>
        ) : (
          <ul className="usage-list">
            {usage.map((u) => (
              <li key={u.label}>
                <span>{u.label}</span>
                <strong>{humanSize(u.bytes)}</strong>
              </li>
            ))}
          </ul>
        )}
        <SettingRow label="Pasta de dados" hint={<code className="path-code">{dataDir}</code>}>
          <button className="ghost" onClick={() => window.o.system.openDataDir()}>
            <FolderOpen size={14} /> Abrir
          </button>
        </SettingRow>
      </Section>
    </>
  );
}
