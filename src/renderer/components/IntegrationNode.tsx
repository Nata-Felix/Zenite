import { memo, useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { IntegrationReply, ServiceRequest, ServiceSpec } from "../../shared/types";
import type { CanvasFlowNode } from "../nodes";
import { ElementShell } from "./ElementShell";

function IntegrationNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const e = data.element!;
  const skill = e.kind === "skill";
  const spec = e.service ?? { transport: "http", endpoint: "" };
  const [result, setResult] = useState<IntegrationReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<ServiceRequest["method"]>("GET");
  const [path, setPath] = useState("");
  const [payload, setPayload] = useState("{}");
  const [tool, setTool] = useState("");
  const generation = useRef(0);
  const config = JSON.stringify(e.service);
  useEffect(() => { generation.current++; setResult(null); setBusy(false); }, [config, e.path]);
  useEffect(() => () => { generation.current++; }, []);
  const edit = (changes: Partial<ServiceSpec>) => data.actions.editElement(e.id, { service: { ...spec, ...changes } });
  const run = async (request?: ServiceRequest, file?: string) => {
    const current = ++generation.current;
    setBusy(true); setResult(null);
    window.dispatchEvent(new Event("zenite:flush-canvas"));
    try {
      const r = skill ? await window.o.elements.readSkill(e.id, file) : await window.o.elements.useService(e.id, request!);
      if (current === generation.current) setResult(r);
    } catch (error) { if (current === generation.current) setResult({ ok: false, error: (error as Error).message }); }
    finally { if (current === generation.current) setBusy(false); }
  };
  useEffect(() => { const timer = setTimeout(() => { if (skill && e.path) void run(); }, 0); return () => clearTimeout(timer); }, [e.path]);
  const send = () => {
    try {
      const parsed: unknown = JSON.parse(payload || "{}");
      if (spec.transport === "mcp" && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("Os argumentos precisam ser um objeto JSON.");
      void run(spec.transport === "mcp" ? { action: "call", tool, arguments: parsed as Record<string, unknown> } : { action: "request", method, path, ...(method === "GET" ? {} : { body: parsed }) });
    } catch (error) { setResult({ ok: false, error: `JSON inválido: ${(error as Error).message}` }); }
  };
  const skillData = skill && result?.ok ? result.data as { content: string; file: string; files: string[] } : null;
  return (
    <ElementShell element={e} actions={data.actions} selected={!!selected} minWidth={320} minHeight={260}>
      <div className="integration-body nodrag nowheel" onKeyDown={(event) => event.stopPropagation()}>
        <p className="integration-hint">{skill ? "Ligue aos agentes que devem ler estas instruções. A skill permanece nesta pasta, sem instalação global." : "Ligue aos agentes que poderão usar este serviço. As permissões gerais do Zênite também se aplicam."}</p>
        {skill ? <>
          <label>Pasta da skill<input aria-label="Pasta da skill" value={e.path ?? ""} onChange={(event) => data.actions.editElement(e.id, { path: event.target.value })} spellCheck={false} /></label>
          <div className="integration-actions">
            <button className="ghost" onClick={async () => { const p = await window.o.elements.pickSkill(); if (p) data.actions.editElement(e.id, { path: p.path }); }}>Escolher pasta</button>
            <button className="ghost" disabled={busy || !e.path} onClick={() => void run()}>Recarregar skill</button>
          </div>
          {skillData && <>
            <details><summary>Arquivos de apoio ({skillData.files.length})</summary><div className="integration-files">{skillData.files.map((f) => <button className="ghost" key={f} disabled={busy} onClick={() => void run(undefined, f)}>{f}</button>)}</div></details>
            <strong>{skillData.file}</strong><pre className="integration-result">{skillData.content}</pre>
          </>}
        </> : <>
          <label>Tipo de conexão<select aria-label="Tipo de conexão" value={spec.transport} onChange={(event) => edit({ transport: event.target.value as ServiceSpec["transport"] })}><option value="http">API HTTP / webhook</option><option value="mcp">MCP por HTTP (2025)</option></select></label>
          <label>Endereço do serviço<input aria-label="Endereço do serviço" placeholder={spec.transport === "mcp" ? "https://servico.com/mcp" : "https://api.exemplo.com/v1"} value={spec.endpoint} onChange={(event) => edit({ endpoint: event.target.value })} spellCheck={false} /></label>
          <label>Variável do token (opcional)<input aria-label="Variável do token" placeholder="EXEMPLO_API_TOKEN" value={spec.tokenEnv ?? ""} onChange={(event) => edit({ tokenEnv: event.target.value || undefined })} spellCheck={false} /></label>
          <p className="integration-hint">Informe o nome da variável do .env desta galáxia. O valor será enviado como Bearer, sem ser salvo no canvas.</p>
          <label className="integration-toggle"><input type="checkbox" checked={!!spec.allowWrites} onChange={(event) => edit({ allowWrites: event.target.checked })} />Permitir enviar dados e executar operações</label>
          {spec.transport === "mcp" && <label>Ferramentas autorizadas (uma por linha)<textarea aria-label="Ferramentas autorizadas" rows={2} value={(spec.tools ?? []).join("\n")} onChange={(event) => edit({ tools: event.target.value.split("\n") })} spellCheck={false} /></label>}
          <div className="integration-actions"><button className="primary" disabled={busy || !spec.endpoint} onClick={() => void run({ action: "test" })}>{busy ? "Aguardando…" : spec.transport === "mcp" ? "Buscar ferramentas" : "Testar conexão"}</button></div>
          <details><summary>{spec.transport === "mcp" ? "Chamar ferramenta" : "Fazer requisição"}</summary>
            {spec.transport === "mcp" ? <label>Ferramenta<select aria-label="Ferramenta" value={tool} onChange={(event) => setTool(event.target.value)}><option value="">Escolha uma ferramenta autorizada</option>{spec.tools?.filter(Boolean).map((t, i) => <option key={`${t}-${i}`} value={t}>{t}</option>)}</select></label> : <>
              <label>Método<select aria-label="Método HTTP" value={method} onChange={(event) => setMethod(event.target.value as ServiceRequest["method"])}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} disabled={m !== "GET" && !spec.allowWrites}>{m}</option>)}</select></label>
              <label>Caminho relativo<input aria-label="Caminho relativo" value={path} placeholder="clientes?limite=10" onChange={(event) => setPath(event.target.value)} /></label>
            </>}
            {(spec.transport === "mcp" || method !== "GET") && <label>{spec.transport === "mcp" ? "Argumentos JSON" : "Dados JSON"}<textarea aria-label="Dados JSON" value={payload} onChange={(event) => setPayload(event.target.value)} rows={3} spellCheck={false} /></label>}
            <button className="ghost" disabled={busy || !spec.endpoint || (spec.transport === "mcp" && (!spec.allowWrites || !spec.tools?.includes(tool))) || (method !== "GET" && !spec.allowWrites)} onClick={send}>Executar</button>
          </details>
        </>}
        <div aria-live="polite" role="status">{busy ? "Aguardando resposta…" : result && !result.ok ? <span className="integration-error">{result.error}</span> : !skill && result?.ok ? <><strong>Resposta recebida</strong><pre className="integration-result">{JSON.stringify(result.data, null, 2)}</pre></> : null}</div>
      </div>
    </ElementShell>
  );
}

export const IntegrationNode = memo(IntegrationNodeImpl);
