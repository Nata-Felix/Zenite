import { useEffect, useState } from "react";
import type { TabProps } from "../SettingsDialog";
import { Choice, Section, SettingRow, Switch } from "./controls";
import { SkillsSection } from "./SkillsSection";
import { OpenRouterSection } from "./OpenRouterSection";

export function GeneralTab({ settings, update }: TabProps) {
  const [blocking, setBlocking] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => window.o.system.info().then((i) => alive && setBlocking(i.sleepBlocked));
    void read();
    const t = setInterval(read, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <>
      <Section title="Links">
        <SettingRow label="Ao clicar num link" hint="Vale para links dos terminais, das notas e do resto do app. O navegador do Zênite tem um botão para pôr o site no canvas.">
          <Choice
            label="Ao clicar num link"
            value={settings.linkOpen ?? "ask"}
            onChange={(linkOpen) => void update({ linkOpen })}
            options={[
              { value: "ask", label: "Perguntar" },
              { value: "external", label: "Navegador externo" },
              { value: "zenite", label: "Navegador do Zênite" },
            ]}
          />
        </SettingRow>
      </Section>
      <Section title="Energia">
        <SettingRow
          label="Impedir a suspensão"
          hint={
            <>
              Evita que o computador durma e pare os agentes no meio do trabalho. A tela ainda pode desligar.
              {blocking !== null && (
                <strong className={`setting-status${blocking ? " on" : ""}`}>{blocking ? " Impedindo agora." : " Não está impedindo agora."}</strong>
              )}
            </>
          }
        >
          <Choice
            label="Impedir a suspensão"
            value={settings.preventSleep ?? "working"}
            onChange={(preventSleep) => void update({ preventSleep })}
            options={[
              { value: "never", label: "Nunca" },
              { value: "working", label: "Enquanto os agentes trabalham" },
              { value: "always", label: "Enquanto o Zênite estiver aberto" },
            ]}
          />
        </SettingRow>
      </Section>
      <Section title="Ao fechar">
        <SettingRow
          label="Pedir confirmação para fechar"
          hint="Pergunta antes de fechar quando há terminais abertos, para um clique errado não encerrar os agentes."
        >
          <Switch label="Pedir confirmação para fechar" checked={settings.confirmQuit !== false} onChange={(confirmQuit) => void update({ confirmQuit })} />
        </SettingRow>
      </Section>
    </>
  );
}

export function NotificationsTab({ settings, update }: TabProps) {
  return (
    <>
      <p className="settings-intro">
        Um terminal ganha um selo quando o agente <strong>termina e fica esperando</strong> (parou de gerar saída depois de trabalhar) ou quando ele{" "}
        <strong>pede atenção</strong> com <code>zn notify</code>. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> leva até o próximo.
      </p>
      <Section title="Selos">
        <SettingRow label="Número de avisos no ícone da barra de tarefas" hint="Mostra quantos terminais esperam você.">
          <Switch label="Número de avisos no ícone" checked={settings.taskbarBadge !== false} onChange={(taskbarBadge) => void update({ taskbarBadge })} />
        </SettingRow>
        <SettingRow
          label="Piscar o botão da barra de tarefas"
          hint="Quando alguém precisa de você e o Zênite está em segundo plano. Para de piscar ao voltar para a janela."
        >
          <Switch
            label="Piscar o botão da barra de tarefas"
            checked={settings.flashTaskbar === true}
            onChange={(flashTaskbar) => void update({ flashTaskbar })}
          />
        </SettingRow>
      </Section>
      <Section title="Notificações do Windows">
        <SettingRow
          label="Quando um agente pedir atenção"
          hint={
            <>
              Mostra a mensagem do <code>zn notify</code>. Clicar leva até o terminal.
            </>
          }
        >
          <Switch
            label="Quando um agente pedir atenção"
            checked={settings.notifyRequest !== false}
            onChange={(notifyRequest) => void update({ notifyRequest })}
          />
        </SettingRow>
        <SettingRow label="Quando um terminal terminar e ficar esperando" hint="Pode avisar mais do que você quer: qualquer comando que termina conta.">
          <Switch label="Quando um terminal terminar" checked={settings.notifyDone === true} onChange={(notifyDone) => void update({ notifyDone })} />
        </SettingRow>
        <p className="setting-hint">As notificações só aparecem com o Zênite em segundo plano.</p>
      </Section>
    </>
  );
}

export function AgentsTab({ settings, update }: TabProps) {
  const [isolation, setIsolation] = useState<{ available: boolean; prepared: boolean; error?: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [isolationError, setIsolationError] = useState("");
  useEffect(() => { let alive = true; void window.o.workspaces.isolationStatus().then(s => alive && setIsolation(s)); return () => { alive = false; }; }, []);
  return (
    <>
      <Section title="Proteção pelo canvas">
        <SettingRow label="Executar terminais em ambiente isolado" hint="Os arquivos do computador não ficam disponíveis diretamente. Use elementos conectados ou solicite acesso ao Zênite. O perfil de login de cada conta é preservado entre aberturas. A mudança encerra os terminais; abra-os novamente. O primeiro uso exige preparar o ambiente e fazer login nele. Aplicativos e comandos precisam ser compatíveis com Linux.">
          <Switch label="Executar terminais em ambiente isolado" checked={settings.isolatedAgents !== false} onChange={isolatedAgents => void update({ isolatedAgents })} />
        </SettingRow>
        {settings.isolatedAgents === false && <p className="integration-error">Isolamento desativado: os terminais nativos podem acessar o computador diretamente, conforme as permissões do próprio agente.</p>}
        <SettingRow label={preparing ? "Preparando o ambiente…" : isolation?.prepared ? "Ambiente preparado" : "Preparar o primeiro uso"} hint="Requer Docker Desktop em execução. A preparação baixa os agentes e pode levar alguns minutos. Os logins existentes no computador não são copiados.">
          <button className="ghost" disabled={preparing} onClick={async () => { setPreparing(true); setIsolationError(""); try { const result = await window.o.workspaces.prepareIsolation(); if (!result.ok) setIsolationError(result.error ?? "Não foi possível preparar."); setIsolation(await window.o.workspaces.isolationStatus()); } catch (e) { setIsolationError(String(e)); } finally { setPreparing(false); } }}>Preparar ambiente</button>
        </SettingRow>
        <SettingRow label="Memória de cada terminal isolado" hint="Limite por contêiner. Vale para os terminais abertos depois da mudança.">
          <Choice label="Memória de cada terminal isolado" value={settings.isolatedMemoryGb ?? 6} options={[2, 4, 6, 8, 12, 16].map(gb => ({ value: gb, label: `${gb} GB` }))} onChange={isolatedMemoryGb => void update({ isolatedMemoryGb })} />
        </SettingRow>
        <SettingRow label="Processadores de cada terminal isolado" hint="Núcleos (threads) por contêiner. Vale para os terminais abertos depois da mudança.">
          <Choice label="Processadores de cada terminal isolado" value={settings.isolatedCpus ?? 4} options={[1, 2, 4, 6, 8].map(cpus => ({ value: cpus, label: String(cpus) }))} onChange={isolatedCpus => void update({ isolatedCpus })} />
        </SettingRow>
        {isolation && !isolation.available && <p className="setting-hint">O ambiente de isolamento não está disponível. Abra o Docker Desktop e tente novamente.</p>}
        {isolationError && <p className="integration-error" role="alert">{isolationError.slice(-1500)}</p>}
        <SettingRow label="Permissões lembradas nesta sessão" hint="Revoga as autorizações de acesso direto concedidas aos terminais. Sempre perguntar não guarda autorizações automáticas; Sandbox não permite acesso fora dos elementos conectados.">
          <button className="ghost" onClick={() => void window.o.workspaces.revokeDirectAccess()}>Revogar permissões</button>
        </SettingRow>
      </Section>
      <Section title="Permissões">
        <SettingRow
          label="Permissões dos agentes"
          hint={
            <>
              Vale para Claude Code, Codex e Antigravity, em terminais novos e ao dar Reload.{" "}
              <strong>Sempre perguntar</strong>: pedem confirmação antes de comandos e edições, como vêm de fábrica.{" "}
                <strong>Sandbox</strong>: trabalham sem perguntar, mas presos à pasta do projeto. O Claude Code não abre nesse modo no Windows, pois não oferece sandbox.{" "}
              <strong>Acesso total</strong>: sem perguntar e sem sandbox; podem fazer qualquer coisa no computador.
            </>
          }
        >
          <Choice
            label="Permissões dos agentes"
            value={settings.agentPermissions ?? "ask"}
            onChange={(agentPermissions) => void update({ agentPermissions })}
            options={[
              { value: "ask", label: "Sempre perguntar" },
              { value: "sandbox", label: "Sandbox" },
              { value: "full", label: "Acesso total" },
            ]}
          />
        </SettingRow>
      </Section>
      <SkillsSection />
      <OpenRouterSection settings={settings} update={update} />
      <Section title="Git como memória">
        <SettingRow
          label="Ensinar os agentes a usar o git como memória"
          hint={
            <>
              Escreve um bloco de regras (buscar no histórico antes de ler arquivos, commitar com o porquê) no <code>~/.claude/CLAUDE.md</code>, no{" "}
              <code>~/.codex/AGENTS.md</code> e nas pastas das contas. O bloco é marcado e não mexe no resto do arquivo; desligar remove o bloco. Para commitar
              à mão, ajuste também "Commits dos agentes" em Editar galáxia.
            </>
          }
        >
          <Switch label="Ensinar os agentes a usar o git" checked={settings.agentGuide !== false} onChange={(agentGuide) => void update({ agentGuide })} />
        </SettingRow>
      </Section>
    </>
  );
}
