import { request } from "node:http";
import { closeSync, fstatSync, openSync, readSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { plural } from "../shared/plural";

const KIND: Record<string, string> = {
  terminal: "terminal",
  note: "nota",
  image: "imagem",
  video: "vídeo",
  web: "site",
  file: "arquivo",
  folder: "pasta",
  table: "tabela",
  flow: "astro",
  skill: "skill",
  service: "serviço",
  blackhole: "buraco negro",
};

const HELP = `zn: usa os elementos ligados a este terminal no canvas do Zênite.
Em terminal isolado: zn access read CAMINHO --out arquivo-local; zn access write CAMINHO --file arquivo-local; zn access list CAMINHO; zn access mkdir PASTA; zn access delete CAMINHO (arquivo ou pasta vazia).
Transferências com --out/--file preservam binários e dividem arquivos grandes em partes de 512 KB. --offset/--length selecionam um trecho; --base64 exibe bytes em base64 sem --out.
Regra: você só usa o que está LIGADO a você. O resto do canvas aparece no "zn list",
mas não pode ser lido, editado nem usado.

Só o Sol cria, remove, move e conecta elementos ou substitui mídia. Outros agentes trabalham
no conteúdo dos elementos ligados e pedem mudanças de estrutura ao Sol. A promoção é feita
pelo usuário na interface e precisa ser refeita após reiniciar o aplicativo. ID ou sun no JSON
não concedem essa função. A tela e as teclas do Sol não são acessíveis por outros agentes.

Geral:
  Buraco negro (só Sol): zn node create buraco-negro "Apps" --config '{"members":["id1","id2"],"collapsed":true}'
      zn node edit "Apps" --black-hole-config '{"collapsed":false}'
      Agrupa sem alterar conexões. members usa IDs do canvas. Remover o agrupador preserva o conteúdo.
  zn list                              Quem você é, o que está ligado e o que existe sem ligação

  zn notify "mensagem"                 Pede a atenção do usuário (selo no terminal e aviso do Windows)

Git (memória do projeto):
  zn history [--grep TEXTO] [--file CAMINHO] [-n N]
                                      Últimos commits de todos os universos + o que está sem commit
  zn commit "Título" --why "porquê" [--todo "pendente"]
                                      Commita tudo da sua pasta no formato padrão (recusa .env).
                                      Se a galáxia estiver em "só sugerir", vira proposta para o usuário.

Terminais e agentes:
  zn status [trabalhando|bloqueado|pronto|livre] ["detalhe"]   Seu selo de andamento (o Sol vê todos)
  zn ask "Nome" "mensagem"             Manda a mensagem e espera a resposta (o outro responde com zn reply)
      --no-wait                       Não espera: a resposta chega depois como mensagem neste terminal
      --force                         Manda mesmo se o outro estiver com o limite de uso atingido
      --timeout SEG                   Tempo máximo de espera (padrão 600)
  zn reply [pedido] "resposta"         Responde a um pedido recebido (sem número: o mais antigo)
  zn check "Nome" [--lines N]          Mostra a tela atual do outro terminal
  zn send "Nome" "texto"               Digita teclas cruas (\\n Enter, \\t Tab, \\e Esc, \\xNN byte)

Notas:
  zn note read "Nota"                  Lê a nota
  zn note write "Nota" "conteúdo"      Substitui o conteúdo
  zn note append "Nota" "texto"        Acrescenta no fim
  zn note create "Nome" ["conteúdo"]   Cria uma nota nova já ligada a você

Skills e serviços (exigem ligação direta, inclusive para o Sol):
  zn skill read "Skill" [--resource arquivo]  Lê SKILL.md ou um arquivo de apoio dentro da pasta
  zn service test "Serviço"           Testa a API ou descobre ferramentas MCP
  zn service tools "Serviço"          Lista ferramentas MCP e seus argumentos
  zn service request "Serviço" GET [caminho]   Consulta a API dentro do endereço configurado
  zn service request "Serviço" POST [caminho] --data '{"campo":"valor"}'
  zn service call "Serviço" "ferramenta" --data '{"campo":"valor"}'
      --file dados.json               Lê os dados/argumentos JSON de um arquivo
      Sempre perguntar: aprova cada chamada. Sandbox: rede bloqueada. Controle total: automático.
      POST/PUT/PATCH/DELETE e ferramentas exigem execução habilitada no elemento.
      MCP: somente ferramentas autorizadas no elemento; Streamable HTTP revisão 2025.

Imagens e vídeos:
  zn media "Nome"                      Caminho do arquivo (para abrir, analisar ou usar como base)
  zn media set "Nome" CAMINHO          Troca o arquivo exibido no canvas (ex.: depois de editar)

Arquivos e pastas (ficam no disco; o canvas só mostra):
  zn file "Nome"                       Caminho, tamanho e data do arquivo (abra/edite por ele)
  zn file create CAMINHO ["Nome"]      Põe um arquivo do disco no canvas, já ligado a você
  zn folder "Nome"                     Caminho da pasta e o que há dentro (um nível)

Astros (fluxos: Ignição, Satélite, Torre de controle...):
  zn flow run "Astro" ["texto"]       Começa o fluxo a partir do astro; o texto vira {{entrada}}
                                      (não espera terminar; o andamento aparece no canvas)

Tabelas:
  zn table read "Tabela"               Mostra a tabela (Markdown; com --json, as linhas)
  zn table write "Tabela" "csv"        Substitui tudo (CSV com , ou ;  — use - ou --file para textos longos)
  zn table set "Tabela" LINHA COLUNA "valor"   Muda uma célula (começa em 1; a linha 1 é o cabeçalho)
  zn table create "Nome" ["csv"]       Cria uma tabela nova já ligada a você

Sites (precisam estar abertos na tela):
  zn web create URL ["Nome"]           Abre um site novo no canvas, já ligado a você
  zn web snapshot "Site"               Texto da página e elementos clicáveis com refs (@e1, @e2...)
  zn web navigate "Site" URL           Vai para o endereço
  zn web click "Site" @e3              Clica (ref, seletor CSS ou "x,y")
  zn web type "Site" "texto" [--into @e2] [--replace]   Digita (no elemento ou no que estiver focado)
  zn web key "Site" Enter              Tecla, com modificadores: ctrl+a, shift+Tab
  zn web eval "Site" "js"              Roda JavaScript na página e mostra o resultado
  zn web screenshot "Site"             Salva um print e mostra o caminho do PNG
  zn web info|back|reload "Site"       Endereço e título / voltar / recarregar

  F12 do site (o depurador fica ligado desde que o site abre; vale o que aconteceu antes):
  zn web console "Site" [--errors] [-n N] [--clear]     Logs, avisos e erros não tratados da página
  zn web network "Site" [--filter texto|fetch|POST|404] [--failed] [-n N] [--clear]
                                      Requisições: número, método, status, tipo, tamanho, tempo, endereço
  zn web request "Site" N [--full]     Uma requisição: cabeçalhos (com cookies HttpOnly), corpo enviado e resposta
  zn web source "Site" [URL ou pedaço] [--out ARQUIVO] [--full]
                                      Sem URL: os arquivos que a página carregou. Com: o código de um deles
  zn web cookies "Site"                Cookies do site, inclusive HttpOnly e Secure

Só o Sol (o orquestrador) — mexe no canvas inteiro, ligado ou não. Cada comando entra no
Ctrl+Z do usuário como um passo só. Nomes ou ids (#ab12cd34, do zn canvas) servem de alvo.
  zn canvas                            Todos os nós (tipo, nome, id, posição, tamanho), desenhos e ligações
  zn canvas show "Nome"                Um nó completo (configuração do astro, do terminal, do desenho...)
  zn canvas apply arquivo.json         Vários passos de uma vez, tudo ou nada (lista de operações; - = entrada padrão)
  zn canvas arrange                    Organiza o canvas (o mesmo "Organizar" do menu)
  zn canvas fit ["Nome"]               Enquadra tudo (ou um nó) na tela
  zn canvas summary on|off             Liga/desliga a visão resumida
  zn canvas background PADRÃO          Fundo: dots, grid, cross, none, stars, navigation, coordinates, starfield
  zn canvas screenshot ["Nome"]        Print da tela (enquadra tudo ou o nó) e mostra o caminho do PNG
  zn canvas export CAMINHO [--kinds nota,terminal,...]   Exporta para .zenite
  zn canvas log [-n N]                 O que o Sol mudou no canvas (o usuário vê cada mudança e desfaz com Ctrl+Z)

  Onde pôr (criar e mover): --at X,Y  |  --near "Outro" [--side direita|esquerda|abaixo|acima]
                            --size LxA (sem nada: ao lado do Sol, sem cobrir ninguém)
  zn node create TIPO "Nome" [onde] [--link "A;B"] [--text "conteúdo"] [--url URL] [--path CAMINHO] [--color #hex]
                                      TIPO: nota, tabela, site, arquivo, pasta, imagem, vídeo
  zn node move "Nome" X,Y | --by DX,DY | --near "Outro" [--side ...]
  zn node resize "Nome" LxA            zn node rename "Nome" "Novo nome"
  zn node front|back "Nome"            Na frente / atrás dos outros
  zn node edit "Nome" [--color #hex] [--url URL] [--path CAMINHO] [--formatted sim|nao]
  zn node duplicate "Nome" [onde]      Cópia ao lado (nota, tabela e mídia levam o conteúdo)
  zn node copy|move "Nome" --to "Universo"|Origem [onde]   Copia (ou move) para outro canvas da galáxia
  zn node delete "Nome" ["Outro"...]   Apaga (terminais são encerrados; o usuário desfaz com Ctrl+Z)
  zn connect "A" "B" [--output SAÍDA]  Liga A → B (astro com várias saídas: diga qual, ex.: a, b, loop, done, r1)
  zn disconnect "A" "B"                Desliga

  zn recruit "Nome" --agent codex|claude|antigravity|grok|openrouter|shell [--account "Conta"]
         [--command "linha"] [--cwd PASTA] [--model M] [--effort E] [--role "Papel"] [--universe "Nome"] [onde]
                                      Terminal novo, já ligado a você. --role: manda o papel salvo como
                                      primeira mensagem quando o agente abrir. --universe: nasce no universo.
  zn dismiss "Nome"                    Fecha o terminal e tira do canvas
  zn replace "Nome" --agent ... [--account ...]     Troca agente/conta no mesmo lugar, com as mesmas ligações
  zn terminal edit "Nome" [--role "Função"] [--color #hex] [--font-size N] [--model M] [--effort E] [--command "..."] [--cwd PASTA]
                                      (comando, pasta, modelo e esforço valem a partir do restart)

  Comandar o CLI de outro terminal (Codex, Claude Code, Antigravity...), como uma pessoa faria:
  zn agent "Nome"                      Agente, conta, modelo/esforço pedidos, se está trabalhando, uso medido
  zn agent status|usage "Nome"         Roda o /status ou o /usage dele e mostra (Codex: modelo, conta, limites)
  zn agent model "Nome" "Modelo" [--effort E] [--save]   Troca o modelo pelo menu dele (só esta sessão;
                                      --save grava como padrão da conta)
  zn agent effort "Nome" low|medium|high|xhigh|max [--save]   Troca o esforço
  zn agent commands "Nome" [--fresh]   Todos os comandos de barra que aquele CLI tem, com descrição
  zn agent run "Nome" "/comando args" [--wait SEG]   Roda qualquer comando de barra e mostra a tela
  zn agent pick "Nome" "opção" [--no-enter]          Escolhe uma opção no menu aberto na tela dele
  zn agent slide "Nome" high           Ajusta o controle de esforço de deslizar (Antigravity)
  zn agent interrupt "Nome"            Esc: interrompe o que ele está fazendo
      Se o agente estiver trabalhando, o zn agent espera até 10 s e recusa; --force manda mesmo assim.
  zn terminal restart|stop "Nome"      Reinicia a sessão / encerra o processo (o nó fica)
  zn role list | show "Papel" | save "Papel" "texto" | delete "Papel"   Papéis salvos para recrutar
  zn universe list | create "Nome" [--clone] | status "Nome" | commit "Nome" "mensagem"
              | merge "Nome" [--keep] | delete "Nome" --force    Universos (branches) da galáxia

  zn flow create TIPO "Nome" [onde] [--link "A;B"] [config]
                                      TIPO: ignicao, satelite, orbita, gemeos, torre, gravidade, propulsor, convergencia, espera, aprovacao
  zn flow edit "Astro" [config]        zn flow show "Astro"        zn flow delete "Astro"
  zn flow stop "Astro"                 Para o fluxo que começou nele (o passo atual termina)
  zn flow status "Astro"               Andamento de cada passo (rodando, ok, erro e mensagem)
  zn flow pause|resume "Ignição"       Pausa/volta o relógio e a pasta vigiada da Ignição
  zn flow signal "Espera" ["dados"]   Retoma uma espera por sinal; sem dados, preserva a entrada
      config: --prompt "..." --agent codex --account "Conta" --model M --effort low --permission read|sandbox|full
              --times N --every MIN --daily HH:MM [--days 1,2,3] --folder PASTA --script "ps1" --input "texto"
              --decide rules|agent --strategy rotate|quota --config '{"condition":{...},"routes":[...]}'
      Convergência: --config '{"joinMode":"all"}' (all, first ou count, com joinCount)
      Espera: --config '{"waitSeconds":30}' ou '{"waitMode":"signal","signalName":"API","timeoutSeconds":3600}'
      Aprovação: --config '{"approvalMessage":"Publicar {{entrada}}?"}' — saídas approved e rejected

  zn draw FORMA [onde] [estilo]        FORMA: retangulo, elipse, losango, linha, seta, lapis, texto, quadro
      seta/linha presa:  zn draw seta --from "A" --to "B" ["rótulo"]   (acompanha quando A ou B andam)
      quadro em volta:   zn draw quadro "Título" --around "A;B;C"      (mover o quadro leva tudo junto)
      texto:             zn draw texto "Olá" --at 100,200 --font-size 36
      pontos livres:     zn draw lapis --points "0,0 40,30 80,10"
      estilo: --stroke #hex|auto --fill #hex|transparent --fill-style hachure|cross-hatch|solid
              --stroke-width 1|2|4 --stroke-style solid|dashed|dotted --rough 0|1|2 --opacity 0-100
              --font hand|sans|serif|mono|comic --font-size N --align left|center|right
  zn draw edit "#id ou texto" [estilo] [--text "novo"]

Textos longos ou com aspas: use "-" no lugar do texto e mande pela entrada padrão,
ou --file CAMINHO. Acrescente --json para saída em JSON.`;

interface Parsed {
  positional: string[];
  flags: Map<string, string | true>;
}

const VALUE_FLAGS = new Set([
  "--offset", "--length",
  "--black-hole-config",
  "--resource", "--data",
  "--timeout", "--lines", "--file", "--into", "--why", "--todo", "--grep", "-n",
  // Sol: canvas, nós, astros e desenhos
  "--at", "--near", "--side", "--size", "--by", "--link", "--text", "--url", "--path", "--color", "--formatted", "--output",
  "--agent", "--account", "--command", "--cwd", "--config", "--prompt", "--model", "--effort", "--permission", "--times",
  "--every", "--daily", "--days", "--folder", "--script", "--input", "--decide", "--strategy",
  "--from", "--to", "--around", "--points", "--stroke", "--fill", "--fill-style", "--stroke-width", "--stroke-style",
  "--rough", "--opacity", "--font", "--font-size", "--align", "--kinds", "--role", "--universe", "--wait", "--filter", "--out",
]);

function parse(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n") {
      flags.set(a, argv[++i] ?? "");
    } else if (a.startsWith("--") && a.length > 2) {
      const eq = a.indexOf("=");
      if (eq > 0) flags.set(a.slice(0, eq), a.slice(eq + 1));
      else if (VALUE_FLAGS.has(a)) flags.set(a, argv[++i] ?? "");
      else flags.set(a, true);
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

class CliError extends Error {
  constructor(
    message: string,
    public code = 1,
  ) {
    super(message);
  }
}

/** Texto da mensagem: argumento, "-" (entrada padrão) ou --file. */
function messageFrom(arg: string | undefined, flags: Parsed["flags"]): string {
  const file = flags.get("--file");
  if (typeof file === "string" && file) return readFileSync(file, "utf8");
  if (arg === "-") return readFileSync(0, "utf8");
  if (arg === undefined) throw new CliError("Faltou o texto da mensagem. Veja: zn help");
  return arg;
}

/** Converte \n, \r, \t, \e, \xNN e \\ em caracteres reais. \n vira Enter (\r). */
export function decodeEscapes(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|[nrte\\])/g, (_m, c: string) => {
    if (c[0] === "x") return String.fromCharCode(parseInt(c.slice(1), 16));
    return { n: "\r", r: "\r", t: "\t", e: "\x1b", "\\": "\\" }[c] ?? c;
  });
}

function call(path: string, body: object): Promise<Record<string, any>> {
  const pipe = process.env.O_PIPE;
  const terminal = process.env.O_TERMINAL_ID;
  const token = process.env.O_TOKEN;
  if (!pipe || !terminal || !token) {
    return Promise.reject(new CliError("Este comando só funciona dentro de um terminal do O (faltam O_PIPE/O_TERMINAL_ID/O_TOKEN)."));
  }
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  // No isolado, leitura fora das conexões espera o Permitir/Cancelar: avisa em vez de ficar mudo.
  const waiting = process.env.O_ISOLATED === "1" && !["/ask", "/check", "/flow"].includes(path)
    ? setTimeout(() => console.error(`Aguardando autorização no Zênite (terminal ${terminal.slice(0, 8)}). Fora das conexões do canvas, o usuário precisa clicar em Permitir; confira com zn list se o elemento está ligado a você.`), 3000)
    : undefined;
  return new Promise<Record<string, any>>((resolve, reject) => {
    const req = request(
      {
        ...(pipe.startsWith("http://") ? { hostname: new URL(pipe).hostname, port: new URL(pipe).port } : { socketPath: pipe }),
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": payload.length,
          "x-o-terminal": terminal,
          "x-o-token": token,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let data: Record<string, any> = {};
          try {
            data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return reject(new CliError("Resposta inválida do Zênite."));
          }
          if ((res.statusCode ?? 500) >= 400) reject(new CliError(data.error ?? `Erro ${res.statusCode}`));
          else resolve(data);
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) =>
      reject(new CliError(err.code === "ENOENT" || err.code === "ECONNREFUSED" ? "O Zênite não está respondendo. Ele está aberto?" : err.message)),
    );
    req.end(payload);
  }).finally(() => clearTimeout(waiting));
}

// ---- Sol: o canvas inteiro ----

const NODE_KINDS: Record<string, string> = {
  nota: "note", note: "note", tabela: "table", table: "table", site: "web", web: "web", arquivo: "file", file: "file",
  pasta: "folder", folder: "folder", imagem: "image", image: "image", video: "video", "vídeo": "video",
  skill: "skill", servico: "service", "serviço": "service", service: "service",
  blackhole: "blackhole", "buraco-negro": "blackhole",
};
const FLOW_TYPES: Record<string, string> = {
  code: "code", codigo: "code", "código": "code",
  http: "request", request: "request", requisicao: "request", "requisição": "request",
  transform: "transform", transformar: "transform", dados: "transform",
  launch: "launch", abrir: "launch", aplicativo: "launch", cronos: "chronos", chronos: "chronos",
  ignicao: "ignition", "ignição": "ignition", ignition: "ignition", satelite: "satellite", "satélite": "satellite", satellite: "satellite",
  orbita: "orbit", "órbita": "orbit", orbit: "orbit", gemeos: "gemini", "gêmeos": "gemini", gemini: "gemini",
  torre: "tower", tower: "tower", gravidade: "gravity", gravity: "gravity", propulsor: "thruster", thruster: "thruster",
  convergencia: "convergence", "convergência": "convergence", convergence: "convergence",
  espera: "wait", wait: "wait", aprovacao: "approval", "aprovação": "approval", approval: "approval",
};
const SHAPES: Record<string, string> = {
  retangulo: "rectangle", "retângulo": "rectangle", rectangle: "rectangle", elipse: "ellipse", ellipse: "ellipse",
  losango: "diamond", diamond: "diamond", linha: "line", line: "line", seta: "arrow", arrow: "arrow",
  lapis: "pen", "lápis": "pen", pen: "pen", texto: "text", text: "text", quadro: "frame", frame: "frame",
};
const SIDES: Record<string, string> = { direita: "right", right: "right", esquerda: "left", left: "left", abaixo: "below", below: "below", acima: "above", above: "above" };

const str = (flags: Parsed["flags"], name: string): string | undefined => {
  const v = flags.get(name);
  return typeof v === "string" ? v : undefined;
};
function pair(raw: string, sep: RegExp, what: string): [number, number] {
  const parts = raw.split(sep).map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) throw new CliError(`${what} inválido: "${raw}".`);
  return [parts[0], parts[1]];
}
const xy = (raw: string) => { const [x, y] = pair(raw, /,/, "Ponto (X,Y)"); return { x, y }; };
const names = (raw: string | undefined) => (raw ? raw.split(raw.includes(";") ? ";" : ",").map((s) => s.trim()).filter(Boolean) : []);
const num = (flags: Parsed["flags"], name: string) => {
  const v = str(flags, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new CliError(`${name} precisa ser um número.`);
  return n;
};
function placement(flags: Parsed["flags"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const at = str(flags, "--at");
  if (at) out.at = xy(at);
  const near = str(flags, "--near");
  if (near) out.near = near;
  const side = str(flags, "--side");
  if (side) {
    if (!SIDES[side]) throw new CliError(`--side: use direita, esquerda, abaixo ou acima.`);
    out.side = SIDES[side];
  }
  const size = str(flags, "--size");
  if (size) [out.width, out.height] = pair(size, /x|×/i, "Tamanho (LxA)");
  return out;
}
function jsonFlag(flags: Parsed["flags"]): Record<string, unknown> {
  const raw = str(flags, "--config");
  if (!raw) return {};
  const text = raw === "-" ? readFileSync(0, "utf8") : raw.trim().startsWith("{") ? raw : readFileSync(raw, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError("--config não é JSON válido.");
  }
}
function flowConfig(flags: Parsed["flags"]): Record<string, unknown> {
  const f: Record<string, unknown> = { ...jsonFlag(flags) };
  for (const [flag, key] of [["--prompt", "prompt"], ["--agent", "agent"], ["--account", "account"], ["--model", "model"], ["--effort", "effort"], ["--permission", "permission"], ["--folder", "folder"], ["--script", "script"], ["--input", "input"], ["--decide", "decide"], ["--strategy", "strategy"]] as const) {
    const v = str(flags, flag);
    if (v !== undefined) f[key] = v;
  }
  const times = num(flags, "--times");
  if (times !== undefined) f.times = times;
  const every = num(flags, "--every");
  if (every !== undefined) Object.assign(f, { schedule: "interval", everyMinutes: every });
  const daily = str(flags, "--daily");
  if (daily) Object.assign(f, { schedule: "daily", at: daily });
  const days = str(flags, "--days");
  if (days) f.days = days.split(",").map(Number);
  if (str(flags, "--folder")) f.schedule = "folder";
  return f;
}
function drawStyle(flags: Parsed["flags"]): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const [flag, key] of [["--stroke", "stroke"], ["--fill", "fill"], ["--fill-style", "fillStyle"], ["--stroke-style", "strokeStyle"], ["--font", "font"], ["--align", "textAlign"], ["--text", "text"]] as const) {
    const v = str(flags, flag);
    if (v !== undefined) d[key] = v;
  }
  for (const [flag, key] of [["--stroke-width", "strokeWidth"], ["--rough", "roughness"], ["--opacity", "opacity"], ["--font-size", "fontSize"]] as const) {
    const v = num(flags, flag);
    if (v !== undefined) d[key] = v;
  }
  return d;
}

const clockOf = (at: number) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const sizeOf = (n?: number) => (n === undefined ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Saída do zn web console|network|request|source|cookies, como o F12 mostraria. */
function devtoolsText(action: string, r: Record<string, any>, out?: string): string {
  if (action === "console") {
    const LEVEL: Record<string, string> = { error: "ERRO ", warn: "AVISO", info: "info ", log: "log  ", debug: "debug" };
    if (!r.entries.length) return `Console de "${r.site}" vazio.`;
    return r.entries.map((e: any) => `${clockOf(e.at)} ${e.source === "nav" ? "-----" : LEVEL[e.level] ?? e.level} ${e.source === "exception" ? "[não tratado] " : e.source === "browser" ? "[navegador] " : ""}${e.text}${e.where ? `  (${e.where})` : ""}`).join("\n");
  }
  if (action === "network") {
    if (!r.entries.length) return `Nenhuma requisição guardada em "${r.site}".`;
    return r.entries.map((e: any) => `#${e.n} ${e.method} ${e.failed ? `FALHOU (${e.failed})` : e.status ?? "…"} ${e.type}${e.mime ? ` ${e.mime}` : ""} ${sizeOf(e.size)} ${e.ms !== undefined ? `${e.ms}ms` : ""} ${e.url}`.replace(/\s+/g, " ")).join("\n") + `\nDetalhes e corpo: zn web request "${r.site}" N`;
  }
  if (action === "request") {
    const q = r.request;
    const headers = (h?: Record<string, string>) => Object.entries(h ?? {}).map(([k, v]) => `  ${k}: ${v}`).join("\n") || "  (nenhum)";
    return [
      `#${q.n} ${q.method} ${q.url}`,
      `Status: ${q.failed ? `falhou (${q.failed})` : `${q.status ?? "…"} ${q.statusText ?? ""}`} · ${q.type}${q.mime ? ` · ${q.mime}` : ""}${q.size !== undefined ? ` · ${sizeOf(q.size)}` : ""}${q.ms !== undefined ? ` · ${q.ms}ms` : ""}`,
      "Cabeçalhos enviados:", headers(q.requestHeaders),
      ...(q.postData !== undefined ? ["Corpo enviado:", q.postData] : []),
      "Cabeçalhos recebidos:", headers(q.responseHeaders),
      ...(q.body !== undefined ? ["Resposta:", q.body] : []),
      ...(q.bodyNote ? [q.bodyNote] : []),
    ].join("\n");
  }
  if (action === "source") {
    if (r.resources) return r.resources.map((x: any) => `${x.type.padEnd(10)} ${x.url}`).join("\n") + `\nCódigo de um deles: zn web source "${r.site}" URL`;
    if (out) {
      writeFileSync(resolvePath(out), r.content, r.base64 ? "base64" : "utf8");
      return `${r.url} (${r.mime}, ${r.length} caracteres) salvo em ${resolvePath(out)}`;
    }
    if (r.base64) return `${r.url} é binário (${r.mime}); salve com --out ARQUIVO.`;
    return `${r.content}${r.cut ? `\n… cortado (${r.length} caracteres no total; use --full ou --out ARQUIVO)` : ""}`;
  }
  if (!r.cookies.length) return `Nenhum cookie para ${r.url}.`;
  return r.cookies.map((c: any) => `${c.name}=${c.value}  [${[c.httpOnly && "HttpOnly", c.secure && "Secure", c.sameSite].filter(Boolean).join(", ") || "comum"}] ${c.domain}${c.path}`).join("\n");
}

/** Operação que cria uma cópia do nó (conteúdo de nota, tabela e mídia vai junto pelo copyOf). */
function copyOp(node: any, where: Record<string, unknown>): Record<string, unknown> {
  const op: Record<string, unknown> = { op: "create", kind: node.kind, width: node.width, height: node.height, ...where };
  if (node.terminal) {
    const { id: _id, sun: _sun, title, ...terminal } = node.terminal;
    Object.assign(op, { title, terminal });
  } else if (node.element) {
    const { id: _id, kind: _kind, title, ...element } = node.element;
    Object.assign(op, { title, element, copyOf: node.id });
  } else if (node.draw) {
    const { seed: _seed, points, ...draw } = node.draw;
    Object.assign(op, { draw });
    const at = (op.at as { x: number; y: number } | undefined) ?? { x: node.x + 40, y: node.y + 40 };
    if (points) op.points = points.map(([px, py]: [number, number]) => [at.x + px * node.width, at.y + py * node.height]);
  }
  return op;
}

/** Manda um lote ao Zênite e escreve o que aconteceu, uma linha por operação. */
async function applyOps(ops: object[], print: (text: string, data: object) => void, note = ""): Promise<Record<string, any>> {
  const r = await call("/canvas", { ops });
  const verb: Record<string, string> = { create: "Criado", update: "Mudado", delete: "Apagado", connect: "Ligado", disconnect: "Desligado" };
  const lines = r.results.map((x: any) => `${verb[x.op] ?? x.op}: ${KIND[x.kind] ?? x.kind} "${x.title}" (#${x.id.slice(0, 8)})`);
  print([...lines, ...(note ? [note] : [])].join("\n"), r);
  return r;
}

function canvasText(c: { nodes: any[]; edges: any[] }, tasks: Record<string, any> = {}): string {
  const shown = c.nodes.filter((n) => n.kind !== "draw");
  const draws = c.nodes.filter((n) => n.kind === "draw");
  const task = (n: any) => (n.kind === "terminal" && tasks[n.title] ? ` · ${tasks[n.title].state}${tasks[n.title].note ? `: ${tasks[n.title].note}` : ""}` : "");
  const line = (n: any) => `  ${n.sun ? "☀ " : ""}"${n.title}" [${n.kind === "draw" ? n.shape : n.flow ? `astro ${n.flow}` : KIND[n.kind] ?? n.kind}] #${n.id.slice(0, 8)} em ${n.x},${n.y} · ${n.width}×${n.height}${task(n)}`;
  return [
    `Canvas: ${plural(shown.length, "elemento", "elementos")}, ${plural(draws.length, "desenho", "desenhos")}, ${plural(c.edges.length, "ligação", "ligações")}.`,
    ...shown.map(line),
    ...(draws.length ? ["Desenhos:", ...draws.map(line)] : []),
    ...(c.edges.length ? ["Ligações:", ...c.edges.map((e) => `  "${e.from}"${e.output ? ` (${e.output})` : ""} → "${e.to}"`)] : []),
  ].join("\n");
}

async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parse(argv);
  const [cmd, ...args] = positional;
  const json = flags.has("--json");
  const print = (text: string, data: object) => console.log(json ? JSON.stringify(data, null, 2) : text);

  switch (cmd) {
    case "access": {
      const [action, path] = args;
      if (!["read", "write", "list", "mkdir", "delete"].includes(action) || !path) throw new CliError("Use zn access read|write|list|mkdir|delete CAMINHO. read: --out local; write: --file local.");
      const binary = flags.has("--binary") || flags.has("--base64");
      const inputFile = str(flags, "--file");
      const out = str(flags, "--out");
      const offset = Number(str(flags, "--offset") ?? 0), length = flags.has("--length") ? Number(str(flags, "--length")) : undefined;
      if (!Number.isSafeInteger(offset) || offset < 0 || length !== undefined && (!Number.isSafeInteger(length) || length < 1)) throw new CliError("Use --offset >= 0 e --length > 0, em bytes inteiros.");
      const chunkSize = 512 * 1024;
      const transfer = (body: object) => call("/access-file", body);
      if (action === "read" && out) {
        let fd: number | undefined, received = 0, version = "";
        try {
          for (;;) {
            const result = await transfer({ action, path, encoding: "base64", offset: offset + received, length: Math.min(chunkSize, length === undefined ? chunkSize : length - received) });
            const currentVersion = `${result.size}:${result.modified}`;
            if (version && version !== currentVersion) throw new CliError("O arquivo mudou durante a transferência. Repita a leitura.");
            version = currentVersion;
            const bytes = Buffer.from(result.content ?? "", result.encoding === "base64" ? "base64" : "utf8");
            if (fd === undefined) fd = openSync(out, "w");
            writeSync(fd, bytes); received += bytes.length;
            if (result.eof || !bytes.length || length !== undefined && received >= length) break;
          }
        } catch (error) { throw new CliError(`${(error as Error).message}${fd === undefined ? "" : " O arquivo local pode estar incompleto."}`); }
        finally { if (fd !== undefined) closeSync(fd); }
        print(`Arquivo recebido em ${out} (${received} bytes)`, { path, out, received });
      } else if (action === "write" && inputFile) {
        const fd = openSync(inputFile, "r"); let written = 0;
        try {
          const size = fstatSync(fd).size;
          const total = Math.min(size, length ?? size);
          do {
            const bytes = Buffer.alloc(Math.min(chunkSize, total - written));
            const count = readSync(fd, bytes, 0, bytes.length, written);
            if (!count && written < total) throw new CliError("O arquivo local mudou durante a transferência.");
            const result = await transfer({ action, path, content: bytes.subarray(0, count).toString("base64"), encoding: "base64", offset: offset + written });
            if (result.written !== count) throw new CliError("A gravação da parte não foi concluída.");
            written += count;
          } while (written < total);
        } catch (error) { throw new CliError(`${(error as Error).message} O arquivo de destino pode estar incompleto.`); }
        finally { closeSync(fd); }
        print(`Arquivo gravado em ${path} (${written} bytes)`, { path, written });
      } else {
        const content = action === "write" ? messageFrom(undefined, flags) : undefined;
        const result = await transfer({ action, path, content, encoding: binary ? "base64" : "utf8", ...(flags.has("--offset") ? { offset } : {}), ...(length === undefined ? {} : { length }) });
        print(action === "read" ? result.content ?? "" : JSON.stringify(result, null, 2), result);
      }
      return 0;
    }
    case undefined:
    case "help":
    case "-h":
    case "--help":
      console.log(HELP);
      return 0;

    case "list": {
      const r = await call("/list", {});
      const lines = [`Você é: "${r.me.title}"`];
      if (r.me.sun) {
        lines.push("Papel: você é o Sol, o orquestrador desta galáxia. Planeje, divida o trabalho e delegue aos terminais");
        lines.push("ligados com zn ask --no-wait (um assunto por pedido); junte e confira os resultados. Não faça o trabalho pesado sozinho.");
        lines.push("Você também mexe no canvas inteiro: zn canvas (ver tudo), zn recruit/dismiss (equipe), zn node, zn connect,");
        lines.push("zn flow create/edit (astros) e zn draw (setas, quadros, textos). Olhe o zn canvas e reaproveite quem já existe antes de criar.");
      }
      if (r.place) {
        const where = r.place.universe ? `universo "${r.place.universe}"${r.place.branch ? ` (branch ${r.place.branch})` : ""}` : "Origem";
        lines.push(`Onde: galáxia "${r.place.galaxy}", ${where}${r.place.dir ? ` — pasta ${r.place.dir}` : ""}`);
      }
      if (r.linked.length === 0) lines.push("Nada ligado a você. Peça ao usuário para ligar elementos a este terminal no canvas.");
      else {
        lines.push("Ligados a você (pode usar):");
        for (const p of r.linked) {
          const extra = [p.status, p.url, p.path].filter(Boolean).join(" · ");
          lines.push(`  - "${p.title}" [${KIND[p.kind] ?? p.kind}]${p.sun ? " ☀ Sol (orquestrador)" : ""}${extra ? ` (${extra})` : ""}`);
          if (p.kind === "skill") lines.push(`    Leia quando precisar: zn skill read ${JSON.stringify(p.title)}`);
          if (p.kind === "service") lines.push(`    Usar pelo conector: zn service test ${JSON.stringify(p.title)} (veja zn help)`);
        }
      }
      if (r.unlinked.length) {
        lines.push("No canvas, sem ligação com você (não pode usar):");
        for (const p of r.unlinked) lines.push(`  - "${p.title}" [${KIND[p.kind] ?? p.kind}]`);
      }
      if (r.pendingForMe.length) {
        lines.push("Pedidos esperando sua resposta:");
        for (const a of r.pendingForMe) lines.push(`  - #${a.id} de "${a.from}" → responda com: zn reply ${a.id} "..."`);
      }
      print(lines.join("\n"), r);
      return 0;
    }

    case "ask": {
      const [to, text] = args;
      if (!to) throw new CliError('Uso: zn ask "Nome" "mensagem"');
      const wait = !flags.has("--no-wait");
      const timeoutSec = Number(flags.get("--timeout")) || undefined;
      const r = await call("/ask", { to, message: messageFrom(text, flags), wait, timeoutSec, force: flags.has("--force") });
      if (r.status === "entregue") {
        print(`Pedido #${r.request} entregue a "${r.to}". A resposta chega neste terminal como mensagem quando ele terminar.`, r);
        return 0;
      }
      if (r.status === "respondido") {
        print(r.reply, r);
        return 0;
      }
      if (r.status === "tempo esgotado") {
        print(
          `"${r.to}" ainda não respondeu (pedido #${r.request}). A resposta chega neste terminal como mensagem quando ele terminar. Tela dele agora:\n\n${r.screen ?? "(vazia)"}`,
          r,
        );
        return 2;
      }
      if (r.status === "limite atingido") {
        print(`"${r.to}" atingiu o limite de uso antes de responder (pedido #${r.request}). Mande o pedido para outro agente.`, r);
        return 1;
      }
      print(`"${r.to}" encerrou antes de responder.`, r);
      return 1;
    }

    case "reply": {
      let request: number | undefined;
      let rest = args;
      if (args.length >= 2 && /^#?\d+$/.test(args[0])) {
        request = Number(args[0].replace("#", ""));
        rest = args.slice(1);
      }
      const r = await call("/reply", { request, message: messageFrom(rest[0], flags) });
      print(`Resposta enviada a "${r.to}" (pedido #${r.request}).`, r);
      return 0;
    }

    case "check": {
      const [to] = args;
      if (!to) throw new CliError('Uso: zn check "Nome"');
      const r = await call("/check", { to, lines: Number(flags.get("--lines")) || undefined });
      print(r.screen, r);
      return 0;
    }

    case "send": {
      const [to, text] = args;
      if (!to || text === undefined) throw new CliError('Uso: zn send "Nome" "texto"');
      const r = await call("/send", { to, data: decodeEscapes(text) });
      print(`Enviado a "${r.to}".`, r);
      return 0;
    }

    case "commit": {
      const [title] = args;
      const why = flags.get("--why");
      if (!title || typeof why !== "string") throw new CliError('Uso: zn commit "Título" --why "por que mudou" [--todo "pendente"]');
      const todo = flags.get("--todo");
      const r = await call("/commit", { title, why, todo: typeof todo === "string" ? todo : undefined });
      if (r.proposed) {
        print(
          `Proposta de commit registrada (${plural(r.files.length, "arquivo alterado", "arquivos alterados")}). Nesta galáxia quem commita é o usuário: não rode git commit; ele vai revisar a sua proposta no O.`,
          r,
        );
      } else {
        print(`Commit ${r.hash}: ${plural(r.files.length, "arquivo", "arquivos")}.`, r);
      }
      return 0;
    }

    case "history": {
      const file = flags.get("--file");
      const grep = flags.get("--grep");
      const r = await call("/history", {
        limit: Number(flags.get("-n")) || undefined,
        grep: typeof grep === "string" ? grep : undefined,
        file: typeof file === "string" ? file : undefined,
      });
      const lines = r.commits.length
        ? r.commits.map((c: any) => `${c.hash}  ${c.branch ? `[${c.branch}] ` : ""}${c.title}  (${c.when}, ${c.author})`)
        : ["Nenhum commit encontrado."];
      const dirty = r.pending.filter((p: any) => p.files > 0);
      lines.push("", dirty.length ? "Sem commit agora:" : "Nada sem commit.");
      for (const p of dirty) lines.push(`  - ${p.place}: ${plural(p.files, "arquivo", "arquivos")}`);
      lines.push("", 'Detalhes de um commit: git show <hash> --stat (arquivos) ou git show <hash> (tudo).');
      print(lines.join("\n"), r);
      return 0;
    }

    case "skill": {
      const [action, name] = args;
      if (action !== "read" || !name) throw new CliError('Uso: zn skill read "Skill" [--resource arquivo]');
      const r = await call("/skill", { target: name, file: str(flags, "--resource") });
      print(`${r.content}\n\nArquivos de apoio: ${(r.files ?? []).join(", ")}\n${r.hint ?? ""}`, r);
      return 0;
    }
    case "service": {
      const [action, name, arg, path] = args;
      if (!name || !["test", "tools", "request", "call"].includes(action)) throw new CliError('Uso: zn service test|tools|request|call "Serviço" ... (veja zn help)');
      const request: Record<string, unknown> = { action };
      const raw = str(flags, "--data") ?? (flags.has("--file") ? messageFrom(undefined, flags) : undefined);
      if (action === "request") { request.method = (arg ?? "GET").toUpperCase(); request.path = path; }
      if (action === "call") { if (!arg) throw new CliError("Informe o nome da ferramenta."); request.tool = arg; }
      if (raw !== undefined) {
        let data: unknown;
        try { data = JSON.parse(raw); } catch { throw new CliError("Dados inválidos: informe JSON válido em --data ou --file."); }
        request[action === "call" ? "arguments" : "body"] = data;
      }
      const r = await call("/service", { target: name, request });
      print(JSON.stringify(r.data, null, 2), r);
      return 0;
    }
    case "note": {
      const [action, name, text] = args;
      if (action === "create") {
        if (!name) throw new CliError('Uso: zn note create "Nome" ["conteúdo"]');
        const content = text !== undefined || flags.has("--file") ? messageFrom(text, flags) : "";
        const r = await call("/note", { action, title: name, content });
        print(`Nota "${r.title}" criada e ligada a você.`, r);
        return 0;
      }
      if (!name || !["read", "write", "append"].includes(action ?? "")) throw new CliError("Uso: zn note read|write|append|create ... (veja zn help)");
      if (action === "read") {
        const r = await call("/note", { action, target: name });
        print(r.content, r);
        return 0;
      }
      const r = await call("/note", { action, target: name, content: messageFrom(text, flags) });
      print(`Nota "${r.title}" salva.`, r);
      return 0;
    }

    case "media": {
      if (args[0] === "set") {
        const [, name, path] = args;
        if (!name || !path) throw new CliError('Uso: zn media set "Nome" CAMINHO');
        const r = await call("/media", { action: "set", target: name, path: resolvePath(path) });
        print(`"${r.title}" substituída. Arquivo: ${r.path}`, r);
        return 0;
      }
      const [name] = args;
      if (!name) throw new CliError('Uso: zn media "Nome"');
      const r = await call("/media", { action: "path", target: name });
      print(r.path, r);
      return 0;
    }

    case "notify": {
      const [text] = args;
      const message = text !== undefined || flags.has("--file") ? messageFrom(text, flags) : "";
      const r = await call("/notify", { message });
      print("Usuário avisado.", r);
      return 0;
    }

    case "file": {
      if (args[0] === "create") {
        const [, path, name] = args;
        if (!path) throw new CliError('Uso: zn file create CAMINHO ["Nome"]');
        const r = await call("/file", { action: "create", path: resolvePath(path), title: name });
        print(`Arquivo "${r.title}" posto no canvas e ligado a você: ${r.path}`, r);
        return 0;
      }
      const [name] = args;
      if (!name) throw new CliError('Uso: zn file "Nome"');
      const r = await call("/file", { action: "path", target: name });
      print(`${r.path}\n${r.size} · modificado em ${r.modified}`, r);
      return 0;
    }

    case "folder": {
      const [name] = args;
      if (!name) throw new CliError('Uso: zn folder "Nome"');
      const r = await call("/folder", { target: name });
      const more = r.more ? `\n  ... e mais ${r.more}` : "";
      print(`${r.path}\n${r.entries.length ? r.entries.map((e: string) => `  ${e}`).join("\n") : "  (vazia)"}${more}`, r);
      return 0;
    }

    case "flow": {
      const [action, name, text] = args;
      if (action === "signal") {
        if (!name) throw new CliError('Uso: zn flow signal "Espera" ["dados recebidos"]');
        const input = text !== undefined || flags.has("--file") ? messageFrom(text, flags) : undefined;
        const r = await call("/flow", { action, target: name, ...(input !== undefined ? { input } : {}) });
        print(`Sinal entregue a "${r.flow}".`, r);
        return 0;
      }
      if (action === "create") {
        const type = FLOW_TYPES[(name ?? "").toLowerCase()];
        if (!type) throw new CliError(`Uso: zn flow create TIPO "Nome" — TIPO: ignicao, satelite, orbita, gemeos, torre, gravidade, propulsor, convergencia, espera, aprovacao.`);
        await applyOps([{ op: "create", kind: "flow", title: text, element: { flow: { type, ...flowConfig(flags) } }, links: names(str(flags, "--link")), ...placement(flags) }], print);
        return 0;
      }
      if (action === "edit") {
        if (!name) throw new CliError('Uso: zn flow edit "Astro" [config]');
        await applyOps([{ op: "update", target: name, flow: flowConfig(flags) }], print);
        return 0;
      }
      if (action === "show") {
        if (!name) throw new CliError('Uso: zn flow show "Astro"');
        const r = await call("/canvas", { ops: [], detail: name });
        print(JSON.stringify({ title: r.node.element?.title, flow: r.node.element?.flow, links: r.links }, null, 2), r);
        return 0;
      }
      if (action === "delete") {
        if (!name) throw new CliError('Uso: zn flow delete "Astro"');
        await applyOps([{ op: "delete", target: name, kind: "flow" }], print);
        return 0;
      }
      if (action === "stop") {
        if (!name) throw new CliError('Uso: zn flow stop "Astro"');
        const r = await call("/flow", { action, target: name });
        print(`Parando "${r.flow}": o passo atual termina e o próximo não começa.`, r);
        return 0;
      }
      if (action === "status") {
        if (!name) throw new CliError('Uso: zn flow status "Astro"');
        const r = await call("/flow", { action, target: name });
        const mark: Record<string, string> = { running: "rodando", ok: "ok", error: "erro", parado: "—" };
        const lines = [`"${r.flow}": ${r.running ? "rodando agora" : "parado"}`];
        for (const st of r.steps) lines.push(`  ${st.title}: ${mark[st.state] ?? st.state}${st.total ? ` (${st.done}/${st.total})` : ""}${st.message ? ` — ${st.message}` : ""}`);
        print(lines.join("\n"), r);
        return 0;
      }
      if (action === "pause" || action === "resume") {
        if (!name) throw new CliError(`Uso: zn flow ${action} "Ignição"`);
        await applyOps([{ op: "update", target: name, flow: { paused: action === "pause" } }], print, action === "pause" ? "Pausada: o relógio e a pasta vigiada não disparam (o ▶ continua valendo)." : "Voltou a disparar sozinha.");
        return 0;
      }
      if (action !== "run" || !name) throw new CliError('Uso: zn flow run|create|edit|show|delete|stop|status|pause|resume "Astro" ... (veja zn help)');
      const input = text !== undefined || flags.has("--file") ? messageFrom(text, flags) : "";
      const r = await call("/flow", { target: name, input });
      print(`Fluxo iniciado a partir de "${r.flow}". Acompanhe no canvas.`, r);
      return 0;
    }

    case "table": {
      const [action, name, a2, a3, a4] = args;
      if (action === "create") {
        if (!name) throw new CliError('Uso: zn table create "Nome" ["csv"]');
        const content = a2 !== undefined || flags.has("--file") ? messageFrom(a2, flags) : "";
        const r = await call("/table", { action, title: name, content });
        print(`Tabela "${r.title}" criada e ligada a você.`, r);
        return 0;
      }
      if (!name || !["read", "write", "set"].includes(action ?? "")) throw new CliError("Uso: zn table read|write|set|create ... (veja zn help)");
      if (action === "read") {
        const r = await call("/table", { action, target: name });
        print(r.markdown, r);
        return 0;
      }
      if (action === "set") {
        if (a2 === undefined || a3 === undefined) throw new CliError('Uso: zn table set "Tabela" LINHA COLUNA "valor"');
        const r = await call("/table", { action, target: name, row: Number(a2), col: Number(a3), value: a4 ?? "" });
        print(`Tabela "${r.title}" salva.`, r);
        return 0;
      }
      const r = await call("/table", { action, target: name, content: messageFrom(a2, flags) });
      print(`Tabela "${r.title}" salva.`, r);
      return 0;
    }

    case "web": {
      const [action, a1, a2] = args;
      if (!action) throw new CliError("Uso: zn web <ação> ... (veja zn help)");
      if (action === "create") {
        if (!a1) throw new CliError('Uso: zn web create URL ["Nome"]');
        const r = await call("/web", { action, url: a1, title: a2 });
        print(`Site "${r.title}" criado e ligado a você. ${r.note}`, r);
        return 0;
      }
      if (!a1) throw new CliError(`Uso: zn web ${action} "Site" ...`);
      const body: Record<string, unknown> = { action, target: a1 };
      if (action === "navigate") body.url = a2;
      if (action === "click") body.ref = a2;
      if (action === "key") body.key = a2;
      if (action === "eval") body.code = messageFrom(a2, flags);
      if (action === "type") {
        body.text = messageFrom(a2, flags);
        body.ref = flags.get("--into");
        body.replace = flags.has("--replace");
      }
      if (["console", "network", "request", "source", "cookies"].includes(action)) {
        Object.assign(body, { limit: Number(flags.get("-n")) || undefined, errors: flags.has("--errors"), failed: flags.has("--failed"), clear: flags.has("--clear"), full: flags.has("--full"), filter: str(flags, "--filter") });
        if (action === "request") body.n = a2;
        if (action === "source") {
          body.url = a2;
          if (flags.has("--out")) body.out = true;
        }
        const r = await call("/web", body);
        print(devtoolsText(action, r, str(flags, "--out")), r);
        return 0;
      }
      const r = await call("/web", body);
      switch (action) {
        case "snapshot":
          print([`${r.title || "(sem título)"} — ${r.url}`, "", r.text, "", "Elementos:", ...r.elements].join("\n"), r);
          break;
        case "info":
        case "navigate":
          print(`${r.title || "(sem título)"} — ${r.url}`, r);
          break;
        case "eval":
          print(r.result, r);
          break;
        case "screenshot":
          print(r.path, r);
          break;
        default:
          print(`${r.status[0].toUpperCase()}${r.status.slice(1)} em "${r.site}".`, r);
      }
      return 0;
    }

    case "canvas": {
      const [action, a1] = args;
      if (!action) {
        const r = await call("/canvas", { ops: [] });
        print(canvasText(r.canvas, r.tasks), { ...r.canvas, tasks: r.tasks });
        return 0;
      }
      if (["arrange", "fit", "summary", "background", "screenshot"].includes(action)) {
        if (action === "summary" && a1 && !["on", "off"].includes(a1)) throw new CliError("Uso: zn canvas summary on|off");
        if (action === "background" && !a1) throw new CliError("Uso: zn canvas background PADRÃO (dots, grid, cross, none, stars, navigation, coordinates, starfield)");
        const body: Record<string, unknown> = { action };
        if (action === "fit" || action === "screenshot") body.target = a1;
        else if (a1) body.value = a1;
        const r = await call("/canvas-ui", body);
        print(r.path ?? `Feito${r.info ? `: ${r.info}` : ""}.`, r);
        return 0;
      }
      if (action === "export") {
        if (!a1) throw new CliError("Uso: zn canvas export CAMINHO [--kinds nota,terminal,...]");
        const kinds = names(str(flags, "--kinds")).map((k) => (k === "terminal" || k === "desenho" || k === "draw" ? (k === "desenho" ? "draw" : k) : NODE_KINDS[k] ?? (k === "astro" ? "flow" : k)));
        const r = await call("/canvas-ui", { action, path: resolvePath(a1), kinds });
        print(`${plural(r.count, "item exportado", "itens exportados")} para ${r.path}`, r);
        return 0;
      }
      if (action === "log") {
        const r = await call("/canvas-ui", { action, limit: Number(flags.get("-n")) || undefined });
        const when = (at: number) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        print(r.log.length ? r.log.map((e: any) => `${when(e.at)} ${e.by}: ${e.what.join("; ")}`).join("\n") : "O Sol ainda não mudou nada neste canvas.", r);
        return 0;
      }
      if (action === "show") {
        if (!a1) throw new CliError('Uso: zn canvas show "Nome"');
        const r = await call("/canvas", { ops: [], detail: a1 });
        print(JSON.stringify({ node: r.node, links: r.links }, null, 2), r);
        return 0;
      }
      if (action === "apply") {
        const text = a1 === "-" || a1 === undefined ? readFileSync(0, "utf8") : readFileSync(a1, "utf8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new CliError("O lote não é JSON válido (lista de operações ou {\"ops\": [...]}).");
        }
        const ops = Array.isArray(parsed) ? parsed : (parsed as { ops?: unknown[] })?.ops;
        if (!Array.isArray(ops)) throw new CliError('O lote precisa ser uma lista de operações ou {"ops": [...]}.');
        await applyOps(ops, print);
        return 0;
      }
      throw new CliError("Uso: zn canvas | zn canvas show \"Nome\" | zn canvas apply arquivo.json");
    }

    case "node": {
      const [action, name, a2, ...rest] = args;
      if (action === "create") {
        const kind = NODE_KINDS[(name ?? "").toLowerCase()];
        if (!kind) throw new CliError('Uso: zn node create TIPO "Nome" — TIPO: nota, tabela, site, arquivo, pasta, imagem, vídeo.');
        const element: Record<string, unknown> = {};
        const url = str(flags, "--url");
        const path = str(flags, "--path");
        const color = str(flags, "--color");
        if (url) element.url = url;
        if (path) element.path = resolvePath(path);
        if (color) element.color = color;
        if (kind === "service") element.service = jsonFlag(flags);
        if (kind === "blackhole") element.blackHole = { members: [], collapsed: true, ...jsonFlag(flags) };
        if (kind === "web" && !url) throw new CliError("Site precisa de --url.");
        const content = str(flags, "--text") ?? (flags.has("--file") ? messageFrom(undefined, flags) : undefined);
        await applyOps([{ op: "create", kind, title: a2, element, links: names(str(flags, "--link")), ...(content ? { content } : {}), ...placement(flags) }], print);
        return 0;
      }
      if (!name) throw new CliError("Uso: zn node create|move|resize|rename|front|back|edit|delete ... (veja zn help)");
      /** Para outro canvas da galáxia: a Origem ou um universo. Terminal não viaja: use recruit --universe. */
      const transfer = async (mode: "copy" | "move") => {
        const to = str(flags, "--to");
        if (!to) throw new CliError(`Uso: zn node ${mode} "Nome" --to "Universo"|Origem [onde]`);
        const { node } = await call("/canvas", { ops: [], detail: name });
        if (node.kind === "terminal") throw new CliError(`Terminal não muda de canvas pelo zn. Use: zn recruit "${node.terminal.title}" --universe "${to}" ...`);
        const where = placement(flags);
        const r = await call("/canvas", { ops: [copyOp(node, Object.keys(where).length ? where : { at: { x: node.x, y: node.y } })], universe: to });
        const made = r.results[0];
        const lines = [`Copiado para "${to}": ${KIND[made.kind] ?? made.kind} "${made.title}" (#${made.id.slice(0, 8)}).`];
        if (mode === "move") {
          await call("/canvas", { ops: [{ op: "delete", target: `#${node.id}` }] });
          lines.push("Tirado deste canvas (Ctrl+Z aqui traz de volta; a cópia lá continua).");
        }
        print(lines.join("\n"), r);
        return 0;
      };
      switch (action) {
        case "move": {
          // Com --to, vai para outro canvas; sem, muda a posição.
          if (flags.has("--to")) return transfer("move");
          const by = str(flags, "--by");
          const where = placement(flags);
          const op: Record<string, unknown> = { op: "update", target: name };
          if (a2) Object.assign(op, xy(a2));
          else if (by) { const [dx, dy] = pair(by, /,/, "Deslocamento (DX,DY)"); Object.assign(op, { dx, dy }); }
          else if (where.near) Object.assign(op, { near: where.near, side: where.side });
          else if (where.at) Object.assign(op, where.at as object);
          else throw new CliError('Uso: zn node move "Nome" X,Y | --by DX,DY | --near "Outro" [--side ...]');
          await applyOps([op], print);
          return 0;
        }
        case "resize": {
          if (!a2) throw new CliError('Uso: zn node resize "Nome" LxA');
          const [width, height] = pair(a2, /x|×/i, "Tamanho (LxA)");
          await applyOps([{ op: "update", target: name, width, height }], print);
          return 0;
        }
        case "rename":
          if (!a2) throw new CliError('Uso: zn node rename "Nome" "Novo nome"');
          await applyOps([{ op: "update", target: name, title: a2 }], print);
          return 0;
        case "front":
        case "back":
          await applyOps([{ op: "update", target: name, z: action }], print);
          return 0;
        case "edit": {
          const element: Record<string, unknown> = {};
          const blackHoleConfig = str(flags, "--black-hole-config");
          if (blackHoleConfig !== undefined) {
            const r = await call("/canvas", { ops: [], detail: name });
            if (r.node.kind !== "blackhole") throw new CliError("Escolha um Buraco negro.");
            let patch: Record<string, unknown>;
            try { patch = JSON.parse(blackHoleConfig); } catch { throw new CliError("Configuração do Buraco negro inválida."); }
            element.blackHole = { ...r.node.element.blackHole, ...patch };
          }
          const url = str(flags, "--url");
          const path = str(flags, "--path");
          const color = str(flags, "--color");
          const formatted = str(flags, "--formatted");
          if (url) element.url = url;
          if (path) element.path = resolvePath(path);
          if (color) element.color = color;
          if (formatted) element.formatted = /^(s|sim|y|yes|true|1)$/i.test(formatted);
          if (!Object.keys(element).length) throw new CliError('Uso: zn node edit "Nome" [--color #hex] [--url URL] [--path CAMINHO] [--formatted sim|nao]');
          await applyOps([{ op: "update", target: name, element }], print);
          return 0;
        }
        case "delete":
          await applyOps([name, ...(a2 ? [a2] : []), ...rest].map((target) => ({ op: "delete", target })), print, "O usuário pode desfazer com Ctrl+Z no canvas.");
          return 0;
        case "duplicate": {
          const { node } = await call("/canvas", { ops: [], detail: name });
          const where = placement(flags);
          const near = Object.keys(where).length ? where : node.kind === "draw" ? { at: { x: node.x + 40, y: node.y + 40 } } : { near: `#${node.id}`, side: "right" };
          await applyOps([copyOp(node, near)], print);
          return 0;
        }
        case "copy":
          return transfer("copy");
        default:
          throw new CliError(`Ação desconhecida: zn node ${action}. Veja: zn help`);
      }
    }

    case "connect":
    case "disconnect": {
      const [from, to] = args;
      if (!from || !to) throw new CliError(`Uso: zn ${cmd} "A" "B"${cmd === "connect" ? " [--output SAÍDA]" : ""}`);
      await applyOps([{ op: cmd, from, to, ...(cmd === "connect" && str(flags, "--output") ? { output: str(flags, "--output") } : {}) }], print);
      return 0;
    }

    case "recruit": {
      const [name] = args;
      const agent = str(flags, "--agent");
      if (!name || (!agent && !str(flags, "--command"))) throw new CliError('Uso: zn recruit "Nome" --agent codex|claude|antigravity|grok|openrouter|shell [--account "Conta"]');
      const terminal: Record<string, unknown> = {};
      for (const [flag, key] of [["--agent", "agent"], ["--account", "account"], ["--command", "command"], ["--cwd", "cwd"], ["--model", "model"], ["--effort", "effort"]] as const) {
        const v = str(flags, flag);
        if (v !== undefined) terminal[key] = key === "cwd" ? resolvePath(v) : v;
      }
      const universe = str(flags, "--universe");
      const role = str(flags, "--role");
      // O nome do papel salvo vira a função do terminal (aparece ao lado do nome).
      if (role) terminal.role = role;
      // Num universo, o canvas é outro: não dá para ligar ao Sol, mas o Sol alcança pelo nome.
      const links = universe ? names(str(flags, "--link")) : [process.env.O_TERMINAL_ID, ...names(str(flags, "--link"))];
      const r = await call("/canvas", { ops: [{ op: "create", kind: "terminal", title: name, terminal, links, ...(role ? { role } : {}), ...placement(flags) }], ...(universe ? { universe } : {}) });
      const made = r.results[0];
      const lines = [`Criado: terminal "${made.title}" (#${made.id.slice(0, 8)})${universe ? ` no universo "${universe}"` : " e ligado a você"}.`];
      lines.push(role ? `O papel "${role}" vai como primeira mensagem quando o agente terminar de abrir.` : `Espere uns segundos o agente abrir e mande o primeiro pedido: zn ask "${made.title}" --no-wait "..."`);
      print(lines.join("\n"), r);
      return 0;
    }

    case "terminal": {
      const [action, name] = args;
      if (!name || !["edit", "restart", "stop"].includes(action ?? "")) throw new CliError('Uso: zn terminal edit|restart|stop "Nome" ... (veja zn help)');
      if (action !== "edit") {
        const r = await call("/terminal", { action, target: name });
        print(`"${r.title}" ${r.status}.`, r);
        return 0;
      }
      const terminal: Record<string, unknown> = {};
      const appearance: Record<string, unknown> = {};
      const color = str(flags, "--color");
      const fontSize = num(flags, "--font-size");
      if (color) appearance.color = color;
      if (fontSize !== undefined) appearance.fontSize = fontSize;
      if (Object.keys(appearance).length) terminal.appearance = appearance;
      const cwd = str(flags, "--cwd");
      if (cwd) terminal.cwd = resolvePath(cwd);
      const command = str(flags, "--command");
      if (command !== undefined) terminal.command = command;
      const fn = str(flags, "--role");
      if (fn !== undefined) terminal.role = fn;
      // Modelo e esforço: o Zênite põe na linha de comando do agente (Codex, Claude, Antigravity).
      const model = str(flags, "--model");
      const effort = str(flags, "--effort");
      if (model) terminal.model = model;
      if (effort) terminal.effort = effort;
      if (!Object.keys(terminal).length) throw new CliError('Diga o que mudar: --role, --color, --font-size, --model, --effort, --command ou --cwd.');
      const restart = command !== undefined || cwd !== undefined || !!model || !!effort;
      await applyOps([{ op: "update", target: name, terminal }], print, restart ? `Vale a partir de: zn terminal restart "${name}" (para trocar agora, sem reiniciar: zn agent model/effort)` : "");
      return 0;
    }

    case "agent": {
      const ACTIONS = ["status", "usage", "model", "effort", "commands", "run", "pick", "slide", "interrupt", "info"];
      const [first, second, third] = args;
      const action = ACTIONS.includes(first ?? "") ? first : "info";
      const name = action === first && first !== undefined && args.length > 1 ? second : first;
      if (!name) throw new CliError('Uso: zn agent ["status"|"model"|...] "Nome" ... (veja zn help)');
      const arg = action === first ? third : second;
      const body: Record<string, unknown> = { action, target: name, force: flags.has("--force") };
      if (action === "run") body.text = arg === "-" ? readFileSync(0, "utf8") : arg;
      if (action === "run" && flags.get("--wait")) body.wait = Number(flags.get("--wait"));
      if (action === "pick" || action === "slide") {
        body.option = arg;
        body.enter = !flags.has("--no-enter");
      }
      if (action === "model") {
        body.model = arg;
        body.effort = str(flags, "--effort");
      }
      if (action === "effort") body.effort = arg;
      if (action === "model" || action === "effort") body.save = flags.has("--save");
      if (action === "commands") body.fresh = flags.has("--fresh");
      const r = await call("/agent", body);
      if (action === "info") {
        const usage = r.usage?.primary
          ? `uso 5h ${Math.round(r.usage.primary.usedPercent)}%${r.usage.secondary ? `, semana ${Math.round(r.usage.secondary.usedPercent)}%` : ""}${r.usage.reached ? " (LIMITE ATINGIDO)" : ""}`
          : r.usage?.reached ? `limite atingido${r.usage.message ? `: ${r.usage.message}` : ""}` : "";
        print([
          `"${r.title}": ${r.agent}${r.account ? ` · conta ${r.account}` : ""} · ${!r.alive ? "encerrado" : r.busy ? "trabalhando" : "livre"}${r.task ? ` · selo: ${r.task.state}${r.task.note ? ` (${r.task.note})` : ""}` : ""}`,
          `Comando: ${r.command || "(shell)"}`,
          ...(r.model || r.effort ? [`Pedido na linha de comando: ${[r.model && `modelo ${r.model}`, r.effort && `esforço ${r.effort}`].filter(Boolean).join(", ")}`] : []),
          ...(usage ? [`Uso medido pelo Zênite: ${usage}`] : []),
          ...(r.efforts ? [`Esforços aceitos: ${r.efforts.join(", ")}`] : []),
          ...(Object.keys(r.commands ?? {}).length ? [`Comandos dele: ${Object.entries(r.commands).map(([k, v]) => `${k} → ${v}`).join(", ")}  (lista completa: zn agent commands "${r.title}")`] : []),
        ].join("\n"), r);
        return 0;
      }
      if (action === "commands") {
        print([`${r.agent} em "${r.title}": ${r.commands.length} comandos${r.cached ? " (lista guardada; --fresh para ler de novo)" : ""}`, ...r.commands.map((c: any) => `  ${c.name.padEnd(18)} ${c.description}`)].join("\n"), r);
        return 0;
      }
      if (action === "status" || action === "usage") {
        const f = r.fields as Record<string, string> | undefined;
        print(f ? Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n") : r.screen, r);
        return 0;
      }
      if (action === "model" || action === "effort") {
        print(`"${r.title}": ${[r.model && `modelo ${r.model}`, r.effort && `esforço ${r.effort}`].filter(Boolean).join(", ")} ${r.saved ? "(gravado como padrão da conta)" : "(só nesta sessão)"}. Confira com: zn agent status "${r.title}"`, r);
        return 0;
      }
      print(r.screen ?? `"${r.title}": ${r.status}.`, r);
      return 0;
    }

    case "role": {
      const [action = "list", name, text] = args;
      if (action === "list") {
        const r = await call("/role", { action });
        print(r.roles.length ? r.roles.map((x: any) => `  "${x.name}": ${x.preview}`).join("\n") : 'Nenhum papel salvo. Crie com: zn role save "Revisor" "Você revisa..."', r);
        return 0;
      }
      if (!name) throw new CliError('Uso: zn role list | show "Papel" | save "Papel" "texto" | delete "Papel"');
      if (action === "show") {
        const r = await call("/role", { action, name });
        print(r.text, r);
        return 0;
      }
      if (action === "save") {
        const r = await call("/role", { action, name, text: messageFrom(text, flags) });
        print(`Papel "${r.name}" salvo. Use: zn recruit "Nome" --agent codex --role "${r.name}"`, r);
        return 0;
      }
      if (action === "delete") {
        const r = await call("/role", { action, name });
        print(`Papel "${r.name}" apagado.`, r);
        return 0;
      }
      throw new CliError(`Ação desconhecida: zn role ${action}.`);
    }

    case "status": {
      const [state, note] = args;
      const r = await call("/status", state ? { state, note } : {});
      const s = r.status;
      print(s.state === "livre" ? `"${r.title}": livre (sem selo).` : `"${r.title}": ${s.state}${s.note ? ` — ${s.note}` : ""}.`, r);
      return 0;
    }

    case "universe": {
      const [action = "list", name, text] = args;
      const body: Record<string, unknown> = { action, name };
      if (action === "create") body.clone = flags.has("--clone");
      if (action === "commit") body.message = text ?? "";
      if (action === "merge") body.keep = flags.has("--keep");
      if (action === "delete") body.force = flags.has("--force");
      if (action !== "list" && !name) throw new CliError('Uso: zn universe list | create|status|commit|merge|delete "Nome" (veja zn help)');
      const r = await call("/universe", body);
      if (action === "list") {
        print([`Você está em: ${r.here}`, ...(r.universes.length ? r.universes.map((u: any) => `  "${u.name}"${u.branch ? ` (branch ${u.branch})` : " (sem git)"} — ${u.path}`) : ["  Nenhum universo além da Origem."])].join("\n"), r);
      } else if (action === "status") {
        print(`"${r.name}": ${plural(r.pending?.length ?? 0, "arquivo sem commit", "arquivos sem commit")}, ${r.ahead ?? 0} à frente e ${r.behind ?? 0} atrás da Origem${r.conflicts?.length ? `; em conflito: ${r.conflicts.join(", ")}` : ""}.`, r);
      } else {
        print(`Universo "${r.name}": ${r.status}${r.branch ? ` (branch ${r.branch})` : ""}${r.path ? ` — ${r.path}` : ""}.`, r);
      }
      return 0;
    }

    case "dismiss": {
      const [name] = args;
      if (!name) throw new CliError('Uso: zn dismiss "Nome"');
      await applyOps([{ op: "delete", target: name, kind: "terminal" }], print, "O usuário pode desfazer com Ctrl+Z (o terminal volta com um shell novo).");
      return 0;
    }

    case "replace": {
      const [name] = args;
      const agent = str(flags, "--agent");
      if (!name || (!agent && !str(flags, "--command"))) throw new CliError('Uso: zn replace "Nome" --agent ... [--account "Conta"]');
      const { node, links } = await call("/canvas", { ops: [], detail: name });
      if (node.kind !== "terminal") throw new CliError(`"${name}" não é terminal.`);
      const title = node.terminal.title;
      const terminal: Record<string, unknown> = { cwd: node.terminal.cwd };
      for (const [flag, key] of [["--agent", "agent"], ["--account", "account"], ["--command", "command"]] as const) {
        const v = str(flags, flag);
        if (v !== undefined) terminal[key] = v;
      }
      // Apaga e recria no mesmo lugar e tamanho, com o mesmo nome e as mesmas ligações (um passo do Ctrl+Z).
      await applyOps([
        { op: "delete", target: `#${node.id}`, kind: "terminal" },
        { op: "create", kind: "terminal", title, terminal, at: { x: node.x, y: node.y }, width: node.width, height: node.height },
        ...links.map((l: any) => ({ op: "connect", from: l.from, to: l.to, ...(l.output ? { output: l.output } : {}) })),
      ], print);
      return 0;
    }

    case "draw": {
      const [shapeName, text] = args;
      if (shapeName === "edit") {
        if (!text) throw new CliError('Uso: zn draw edit "#id ou texto" [estilo] [--text "novo"]');
        const draw = drawStyle(flags);
        if (!Object.keys(draw).length) throw new CliError("Diga o que mudar (estilo ou --text).");
        await applyOps([{ op: "update", target: text, draw }], print);
        return 0;
      }
      const shape = SHAPES[(shapeName ?? "").toLowerCase()];
      if (!shape) throw new CliError("Uso: zn draw retangulo|elipse|losango|linha|seta|lapis|texto|quadro ... (veja zn help)");
      const draw: Record<string, unknown> = { shape, ...drawStyle(flags) };
      if (shape === "text" && text !== undefined) draw.text = text === "-" ? readFileSync(0, "utf8") : text;
      const op: Record<string, unknown> = { op: "create", kind: "draw", draw, ...placement(flags) };
      if (shape !== "text" && text) op.title = text;
      const from = str(flags, "--from");
      const to = str(flags, "--to");
      if (from || to) Object.assign(op, { from, to });
      const around = names(str(flags, "--around"));
      if (around.length) op.around = around;
      const points = str(flags, "--points");
      if (points) op.points = points.trim().split(/\s+/).map((p) => pair(p, /,/, "Ponto (X,Y)"));
      await applyOps([op], print);
      return 0;
    }

    default:
      throw new CliError(`Comando desconhecido: ${cmd}. Veja: zn help`);
  }
}

// exitCode em vez de exit(): deixa a saída terminar de ser escrita quando vai para um pipe.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`o: ${err.message}`);
    process.exitCode = err instanceof CliError ? err.code : 1;
  },
);
