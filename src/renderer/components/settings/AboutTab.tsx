import { useEffect, useState } from "react";
import { Bug, ExternalLink } from "lucide-react";
import iconUrl from "../../../../build/icon.svg";
import { Section, SettingRow } from "./controls";
import { UpdateSection } from "../UpdateDialog";

const REPO = "https://github.com/Nata-Felix/Zenite";

export function AboutTab() {
  const [info, setInfo] = useState<{ version: string; electron: string; platform: string } | null>(null);
  useEffect(() => void window.o.system.info().then(setInfo), []);
  return (
    <>
      <div className="about-head">
        <img src={iconUrl} alt="" width={64} height={64} />
        <div>
          <strong>Zênite</strong>
          <span className="setting-hint">Canvas infinito para terminais e agentes de IA. Código aberto (Apache-2.0).</span>
          {info && (
            <span className="setting-hint">
              Versão {info.version} · Electron {info.electron} · {info.platform}
            </span>
          )}
        </div>
      </div>
      <UpdateSection />
      <Section title="Projeto">
        <SettingRow label="Código-fonte" hint="Repositório no GitHub.">
          <button className="ghost" onClick={() => window.o.system.openUrl(REPO)}>
            <ExternalLink size={14} /> Abrir
          </button>
        </SettingRow>
        <SettingRow label="Relatar um problema" hint="Abre uma issue nova no GitHub. Conte o que fez, o que esperava e o que aconteceu.">
          <button className="ghost" onClick={() => window.o.system.openUrl(`${REPO}/issues/new`)}>
            <Bug size={14} /> Relatar
          </button>
        </SettingRow>
      </Section>
    </>
  );
}
