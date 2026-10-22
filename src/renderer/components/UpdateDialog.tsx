import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import iconUrl from "../../../build/icon.svg";
import { parseNotes, type Inline } from "../../shared/releaseNotes";
import type { UpdateState } from "../../shared/types";
import { Section, SettingRow } from "./settings/controls";

/** Estado da atualização automática, ao vivo. */
export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    window.o.updates.get().then(setState);
    return window.o.updates.onState(setState);
  }, []);
  return state;
}

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

/** "Atualização leve, 5 MB" ou "Instalador completo, 113 MB". */
export function updateKind(state: UpdateState): string | null {
  if (state.light === undefined) return null;
  const size = state.size ? `, ${mb(state.size)}` : "";
  return state.light ? `Atualização leve${size}: só os arquivos do app, sem reinstalar` : `Instalador completo${size}`;
}

/** Avisa quando uma versão nova já foi baixada. "Depois" instala na próxima vez que o app fechar. */
export function UpdateDialog() {
  const state = useUpdateState();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (state?.status !== "ready" || !state.version || dismissed === state.version) return null;
  const close = () => setDismissed(state.version!);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={close}>
      <div className="dialog update-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && close()}>
        <div className="update-head">
          <img src={iconUrl} alt="" />
          <div>
            <h2>O Zênite {state.version} está disponível</h2>
            <p className="dialog-hint">Você está na {state.current}</p>
            {updateKind(state) && <p className="dialog-hint">{updateKind(state)}</p>}
          </div>
        </div>
        {state.notes && (
          <div className="update-notes">
            <ReleaseNotes markdown={state.notes} />
          </div>
        )}
        <p className="dialog-hint">A atualização já foi baixada e será instalada na próxima vez que você sair. Reiniciar agora fecha seus terminais abertos.</p>
        <div className="dialog-actions">
          <button className="ghost" onClick={close}>
            Depois
          </button>
          <button className="primary" autoFocus onClick={() => window.o.updates.install()}>
            Reiniciar agora
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "bold" ? <strong key={i}>{p.text}</strong> : p.kind === "italic" ? <em key={i}>{p.text}</em> : p.kind === "code" ? <code key={i}>{p.text}</code> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

/** Notas da versão formatadas: títulos, listas, negrito, itálico e código. */
function ReleaseNotes({ markdown }: { markdown: string }) {
  const blocks = parseNotes(markdown);
  return (
    <div className="release-notes">
      {blocks[0]?.kind !== "heading" && <h3>O que mudou</h3>}
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          b.level <= 2 ? (
            <h3 key={i}><Text parts={b.content} /></h3>
          ) : (
            <h4 key={i}><Text parts={b.content} /></h4>
          )
        ) : b.kind === "list" ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}><Text parts={item} /></li>
            ))}
          </ul>
        ) : (
          <p key={i}><Text parts={b.content} /></p>
        ),
      )}
    </div>
  );
}

/** Versão instalada e botão para procurar atualização, na aba Sobre das Configurações. */
export function UpdateSection() {
  const state = useUpdateState();
  if (!state) return null;
  const hint = {
    dev: "Rodando pelo código-fonte: a atualização automática só funciona no app instalado.",
    idle: state.checkedAt ? `Você está na versão mais recente (${state.current}).` : `Versão instalada: ${state.current}.`,
    checking: "Procurando atualização…",
    downloading: `Baixando a versão ${state.version ?? ""}${state.size ? ` (${mb(state.size)}${state.light ? ", atualização leve" : ""})` : ""}… ${state.percent ?? 0}%`,
    ready: `Versão ${state.version} baixada. Ela será instalada quando você sair do Zênite.`,
    error: `Não consegui atualizar: ${state.error ?? "erro desconhecido"}`,
  }[state.status];

  return (
    <Section title="Atualizações">
      <SettingRow label="Atualização automática" hint={hint}>
        {state.status === "ready" ? (
          <button className="primary" onClick={() => window.o.updates.install()}>
            Reiniciar e atualizar
          </button>
        ) : (
          <button className="ghost" disabled={state.status === "dev" || state.status === "checking" || state.status === "downloading"} onClick={() => window.o.updates.check()}>
            Procurar atualização
          </button>
        )}
      </SettingRow>
    </Section>
  );
}
