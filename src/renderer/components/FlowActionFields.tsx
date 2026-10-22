import { useNodes, useEdges } from "@xyflow/react";
import { useEffect, useState } from "react";
import type { FlowSpec, FlowTransformSpec, FlowHttpSpec } from "../../shared/types";
import type { CanvasFlowNode } from "../nodes";

const OPERATIONS: [FlowTransformSpec["operation"], string][] = [
  ["template", "Montar texto"], ["json-field", "Extrair campo JSON"], ["json-format", "Formatar JSON"],
  ["replace", "Substituir texto"], ["split", "Separar texto em lista"], ["join", "Juntar lista em texto"], ["set-variable", "Guardar variável"],
];

export function FlowActionFields({ id, draft, set }: { id: string; draft: FlowSpec; set(patch: Partial<FlowSpec>): void }) {
  const nodes = useNodes<CanvasFlowNode>();
  const edges = useEdges();
  const connected = nodes.filter(n => edges.some(e => e.source === id && e.target === n.id || e.target === id && e.source === n.id));
  if (draft.type === "code") return <CodeFields id={id} draft={draft} set={set} />;
  if (draft.type === "request") {
    const http = draft.http ?? {};
    const patch = (p: Partial<FlowHttpSpec>) => set({ http: { ...http, ...p } });
    return <>
      <label>Destino<select value={http.serviceId ?? ""} onChange={e => patch({ serviceId: e.target.value || undefined })}>
        <option value="">Endereço próprio</option>
        {connected.filter(n => n.data.element?.service?.transport === "http").map(n => <option key={n.id} value={n.id}>{n.data.element?.title}</option>)}
      </select></label>
      {http.serviceId ? <label>Caminho no serviço<input value={http.path ?? ""} placeholder="clientes/{{codigo}}" onChange={e => patch({ path: e.target.value })} /></label> : <>
        <label>Endereço HTTP(S)<input required type="url" value={http.url ?? ""} placeholder="https://api.exemplo.com/dados" onChange={e => patch({ url: e.target.value })} /></label>
        <label>Variável com token Bearer (opcional)<input value={http.tokenEnv ?? ""} placeholder="API_TOKEN" onChange={e => patch({ tokenEnv: e.target.value })} /></label>
      </>}
      <label>Método<select value={http.method ?? "GET"} onChange={e => patch({ method: e.target.value as FlowHttpSpec["method"] })}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => <option key={m}>{m}</option>)}</select></label>
      {http.method && http.method !== "GET" && <>
        <label>Formato dos dados<select value={http.bodyType ?? "json"} onChange={e => patch({ bodyType: e.target.value as "json" | "text" })}><option value="json">JSON</option><option value="text">Texto</option></select></label>
        <label>Dados enviados<textarea rows={4} value={http.body ?? ""} placeholder={'{"mensagem":"{{entrada}}"}'} onChange={e => patch({ body: e.target.value })} /></label>
      </>}
      <p className="dialog-hint">A resposta segue como {"{{entrada}}"} e {"{{resposta}}"}; o código fica em {"{{status_http}}"}. Use o nome da variável do .env, sem colar o segredo. Para usar um serviço, ligue-o diretamente a este astro.</p>
      <PermissionsHint />
    </>;
  }
  if (draft.type === "transform") {
    const config = draft.transform ?? { operation: "template" };
    const patch = (p: Partial<FlowTransformSpec>) => set({ transform: { ...config, ...p } });
    return <>
      <label>Operação<select value={config.operation} onChange={e => patch({ operation: e.target.value as FlowTransformSpec["operation"] })}>{OPERATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {config.operation === "json-field" && <label>Campo JSON<input value={config.field ?? ""} placeholder="cliente.nome ou itens[0].id" onChange={e => patch({ field: e.target.value })} /></label>}
      {config.operation === "set-variable" && <label>Nome da variável<input required value={config.variable ?? ""} placeholder="cliente" onChange={e => patch({ variable: e.target.value })} /></label>}
      {["template", "set-variable"].includes(config.operation) && <label>Texto<textarea rows={4} value={config.value ?? "{{entrada}}"} onChange={e => patch({ value: e.target.value })} /></label>}
      {config.operation === "replace" && <><label>Procurar<input required value={config.search ?? ""} onChange={e => patch({ search: e.target.value })} /></label><label>Substituir por<input value={config.replacement ?? ""} onChange={e => patch({ replacement: e.target.value })} /></label></>}
      {["split", "join"].includes(config.operation) && <label>Separador<textarea rows={2} value={config.separator ?? "\n"} onChange={e => patch({ separator: e.target.value })} /></label>}
      <p className="dialog-hint">Use {"{{entrada}}"}, suas variáveis ou {"{{json.cliente.nome}}"}. A transformação acontece localmente e funciona no Sandbox. Guardar variável preserva a entrada.</p>
    </>;
  }
  if (draft.type === "launch") {
    const config = draft.launch ?? { mode: "open" };
    const patch = (p: Partial<NonNullable<FlowSpec["launch"]>>) => set({ launch: { ...config, ...p } });
    return <>
      <label>Como abrir<select value={config.mode} onChange={e => patch({ mode: e.target.value as "open" | "command" })}><option value="open">Abrir pelo sistema (arquivo ou atalho)</option><option value="command">Executar um aplicativo com argumentos</option></select></label>
      <label>Arquivo de destino<select value={config.targetId ?? ""} onChange={e => patch({ targetId: e.target.value || undefined })}><option value="">Informar caminho</option>{connected.filter(n => n.data.element?.kind === "file").map(n => <option key={n.id} value={n.id}>{n.data.element?.title}</option>)}</select></label>
      {!config.targetId && <label>Caminho<input required value={config.path ?? ""} placeholder="C:\\Aplicativos\\app.exe" onChange={e => patch({ path: e.target.value })} /></label>}
      {config.mode === "command" && <>
        <label>Argumentos (um por linha, sem aspas extras)<textarea rows={4} value={(config.args ?? []).join("\n")} onChange={e => patch({ args: e.target.value ? e.target.value.split("\n") : [] })} /></label>
        <label><input type="checkbox" checked={!!config.waitForExit} onChange={e => patch({ waitForExit: e.target.checked })} /> Aguardar conclusão e usar a saída como entrada do próximo passo</label>
      </>}
      <p className="dialog-hint">Ligue um arquivo ou atalho a este astro para escolhê-lo acima. O programa abre no computador onde o Zênite está rodando. Argumentos aceitam variáveis. Sem aguardar, o fluxo continua após iniciar o aplicativo.</p>
      <PermissionsHint />
    </>;
  }
  return null;
}

function PermissionsHint() {
  return <p className="dialog-hint">Respeita as permissões das Configurações. Sandbox bloqueia esta ação externa. Com o isolamento dos terminais ativo, operações no computador exigem confirmação também em Controle total. Agendamentos funcionam enquanto o Zênite estiver aberto.</p>;
}

function CodeFields({ id, draft, set }: { id: string; draft: FlowSpec; set(patch: Partial<FlowSpec>): void }) {
  const config = draft.code ?? { language: "python", source: "" };
  const [state, setState] = useState<{ busy: boolean; message: string; error?: boolean }>({ busy: true, message: "Verificando a linguagem instalada…" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ busy: true, message: "Verificando a linguagem… Se faltar, confirme a instalação no diálogo." });
    void window.o.flows.prepareCode(config.language, id).then(result => {
      if (active) setState({ busy: false, error: !result.ok, message: result.ok ? `Versão instalada: ${result.version}` : result.error });
    }).catch(error => { if (active) setState({ busy: false, error: true, message: String(error) }); });
    return () => { active = false; };
  }, [config.language, retry, id]);
  return <>
    <label>Linguagem<select value={config.language} disabled={state.busy} onChange={e => set({ code: { ...config, language: e.target.value as typeof config.language } })}>
      <option value="python">Python</option><option value="javascript">JavaScript (Node.js)</option>
    </select></label>
    <p className={state.error ? "integration-error" : "dialog-hint"} role="status" aria-live="polite">{state.message}</p>
    {state.error && <button type="button" className="ghost" onClick={() => setRetry(n => n + 1)}>Verificar novamente</button>}
    <label>Bloco de código<textarea rows={12} required spellCheck={false} autoCapitalize="off" value={config.source} placeholder={config.language === "python" ? 'print("Olá do Python")' : 'console.log("Olá do JavaScript");'} onChange={e => set({ code: { ...config, source: e.target.value } })} /></label>
    <p className="dialog-hint">Use <code>entrada</code> para ler o texto do passo anterior e <code>variaveis</code> para acessar as variáveis do fluxo. {config.language === "python" ? "print(...)" : "console.log(...)"} envia o resultado ao próximo passo. O código roda na pasta da galáxia, com limite de 10 minutos.</p>
    <PermissionsHint />
  </>;
}
