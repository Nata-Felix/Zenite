# Pendências e ideias — Zênite

Lista viva do que falta e do que vale fazer. Atualizada em 21/10/2026.

## Relato recebido em 22/10 e trabalho Codex

- Relatos técnicos de isolamento: [resumo sanitizado](isolation-feedback.md). Dados e caminhos de projetos pessoais foram removidos.
- Astro **Código**: Python e JavaScript, detecção da versão instalada (Python usa .venv da galáxia quando disponível), instalação pelo WinGet somente após modal de confirmação, execução respeitando as permissões e saída para o próximo passo.
- `zn access read --out` e `write --file`: binários preservados com base64 e partes de 512 KB, sem limite total de 1 MB. `--offset/--length` disponíveis. Acesso continua sendo autorizado por parte; interrupção pode deixar arquivo parcial, com aviso no CLI.
- Canvas: Selecionar temporário ao clicar em elementos/astros, com restauração da ferramenta anterior ao sair. Campos de edição e modais preservam a interação.
- Instalador visual bloqueado: NSIS não existe no cache local e o download foi recusado pelo ambiente (EACCES). Pacote atualizado e atualização leve compilados em dist/win-unpacked e dist/app-0.28.0.tar.gz. O instalador antigo em dist/ continua sendo o de 19h13.

## Isolado: gravar fora do isolamento e permissões (22/10)

Reprodução com dois agentes e uma pasta de teste conectada ao canvas:

- **Gravação grande falha com "Mensagem grande demais"**: o limite de 1 MB do corpo (`MAX_BODY` em `controlServer.ts`) derruba `zn access write` com conteúdo inline (900 KB em base64 passa de 1 MB). Só `--file` em partes de 512 KB passa. Subir o limite da rota `/access-file`.
- **Ordem do Sol não vale para o terminal que ele manda**: o Sonnet recrutado pelo Sol pediu autorização para ler `C:\projeto	este-binario.part`, mesmo com a Pasta ligada ao Sol. Pasta ligada ao Sol deve valer também para os terminais ligados a ele (`CanvasAccess.context`).
- **Diálogo "Acesso fora do canvas" ainda feio**: o app instalado mostra a caixa nativa do Windows. O diálogo do Zênite (AppDialog) já existe no código desde 21/10; confirmar que ele aparece nessa pergunta numa versão nova.
- **"Não perguntar novamente" continua perguntando**: a permissão lembrada vale só para o caminho exato daquele terminal (`CanvasAccess.grants`). Marcar deve liberar aquela operação (ler/gravar/...) até fechar o app, sem perguntar de novo.
- **Codex isolado**: `--no-daemon` e login por `codex login --device-auth` automático já feitos (commits b77d8c7 e 345f6f4); falta versão nova publicada.

## Pedidos do usuário (20/10)

### Canvas
- **Enquadrar tudo** tem que deixar o conteúdo centralizado na tela.
- **Serviços no canvas — implementado (21/10)**: API HTTP/webhook e MCP Streamable HTTP
  (revisões 2025), token por variável do .env, operações e ferramentas autorizadas por elemento.
  Ligação direta obrigatória, inclusive para o Sol; confirmação e Sandbox respeitados. Pendente:
  MCP stdio, OAuth e adaptadores nativos de Postgres, Docker e SSH (hoje, via MCP HTTP).
- **Skill como elemento do canvas — implementado (21/10)**: pasta com SKILL.md e arquivos de
  apoio, sem instalação global, disponível só aos agentes ligados. Terminais, Satélites e Torres.
- **Botão Astros com elemento selecionado (21/10)**: com um elemento selecionado no canvas, clicar
  em Astros faz o menu abrir e fechar sem parar e não dá para escolher nenhum astro.
- **Botão de procurar arquivo em todo campo de caminho (21/10)**: ex.: o Astro de abrir aplicativo
  pede o endereço do programa. Todo campo que pede caminho (programa, ícone, pasta) precisa de um
  botão que abre o Explorer do Windows para escolher o arquivo.
- **Organizar inclui o Buraco negro — feito (21/10)**: o conteúdo de cada Buraco negro (aberto ou
  fechado) é organizado entre si, dentro da pasta, e anda junto com ela. Visão resumida sem teste.
- **Caixas do Windows trocadas pelo diálogo do Zênite — feito (21/10)**: permissões, aprovações de
  fluxo, Propulsor, executar programa, erro de skill, remover conta/galáxia e restaurar backup. A
  caixa do Windows só aparece se a interface não responder em 1,5 s.
- **Login do Google nos Sites — corrigido (21/10)**: o Google recusava ("Esse navegador ou app pode
  não ser seguro") porque o F12 dos agentes deixa o depurador ligado. Agora ele sai nas páginas de
  accounts.google.com e volta depois. Falta testar o login no app.

### Relatório do Sol isolado (21/10, galáxia "Tiktok - Criação de Videos")
- **[MELHORIA · Alta] Sol não dispara o astro "Abrir aplicativo"**: `zn flow run "Abrir aplicativo" [...]`
  responde "Inicie fluxos pela interface do Zênite; um terminal isolado não pode disparar processos no
  computador". O `zn help` não avisa. Passar pela confirmação Permitir/Cancelar (respeitando Sempre
  perguntar, Sandbox e Controle total) ou documentar no help e no erro quais astros só rodam pela interface.
- **[BUG · Alta] Abrir aplicativo com `path` vazio ignora o alvo ligado**: com `targetId` apontando para
  o arquivo "Zen" (`Zen.lnk`), dá "Escolha um arquivo, atalho ou executável". Deve usar o `path` do alvo.
- **[MELHORIA · Média] Abrir aplicativo não recebe endereço nem argumentos**: o `{{entrada}}` do
  `zn flow run` não chega ao app. Campo `args` com `{{entrada}}` ou modo "abrir URL com este aplicativo".
- **[BUG · Média] `zn access read` corrompe binários**: PNG sai com `ef bf bd` no lugar de `89`
  (decodificado como UTF-8). Transferir em bytes ou base64.
- **[BUG · Média] `zn flow status` mostra execução antiga**: depois de uma recusa continua o resultado
  anterior, sem data. Mostrar data e origem (interface/terminal) e registrar as recusas.
- **[BUG · Baixa] `zn table create` responde antes de a ligação valer**: o `read` logo em seguida diz
  "não está ligado a este terminal". O create só deve voltar com a ligação gravada.
- **[BUG? · Baixa] `;` numa célula quebra a coluna no `zn table write`**: "a; b" virou duas colunas.
  Conferir se aspas CSV resolvem; se não, suportar aspas ou documentar o separador.

### Sol completo: o orquestrador que faz tudo no canvas (como o Maestro do Maestri, e mais)
O Sol faz pelo `zn` o que o usuário faz com o mouse no canvas. Os outros terminais continuam com
a regra de sempre (só o que está ligado). Detalhes no `zn help` (seção "Só o Sol").

**Feito em 21/10**
- `zn canvas` (tudo, inclusive desenhos), `zn canvas show "Nome"`, `zn canvas apply lote.json`
  (vários passos, tudo ou nada).
- `zn node create|move|resize|rename|front|back|edit|delete`, `zn connect` (com `--output` nos
  astros de várias saídas) e `zn disconnect`. Sem `--at`, nasce ao lado do Sol sem cobrir ninguém.
- Equipe: `zn recruit` (agente, conta, comando, pasta; já ligado ao Sol), `zn dismiss`, `zn replace`.
- Astros: `zn flow create|edit|show|delete`, com as opções do Satélite, Ignição, Órbita, Torre...
- Desenho: `zn draw` com todas as formas e estilos, seta presa (`--from/--to`), quadro em volta
  (`--around`) e `zn draw edit`. Mover pelo Sol leva as setas presas e o que está dentro do quadro.
- O Sol lê e usa notas, tabelas, sites etc. do canvas dele sem precisar de ligação.
- Segurança: cada comando do Sol é um passo do Ctrl+Z; apagar manda notas, tabelas e mídia para
  a lixeira (7 dias); o Sol não se apaga e nunca vê `.env` nem senhas.

**Feito em 21/10 (segunda parte)**
- Tela: `zn canvas arrange|fit|summary|background|screenshot|export|log`. Cada mudança do Sol
  aparece num aviso no topo do canvas e fica no registro (`zn canvas log`).
- Terminal: `zn terminal edit` (cor, letra, comando, pasta, esforço do Codex), `restart`, `stop`.
- Fluxos: `zn flow stop|status`; `zn flow pause|resume` na Ignição (o cartão mostra "Pausada").
- Papéis salvos (`zn role list|show|save|delete`) e `zn recruit --role`: o papel vai como
  primeira mensagem quando o agente termina de abrir.
- Status por tarefa: `zn status trabalhando|bloqueado|pronto|livre "detalhe"`; selo no cabeçalho
  do terminal; o Sol vê todos no `zn canvas`.
- `zn node duplicate` (nota, tabela e mídia levam o conteúdo).
- Universos: `zn universe list|create|status|commit|merge|delete`, e `zn recruit --universe`.
  Criar pelo Sol não troca a tela do usuário; apagar pede `--force`; o Sol enxerga quem está
  nos outros universos da galáxia.
- Canvas fechado: o terminal recrutado já roda sem tela; ao abrir a galáxia, a tela pega a sessão.

**Feito em 21/10 (terceira parte): o Sol comanda os CLIs**
- `zn agent "Nome"` (agente, conta, modelo/esforço pedidos, ocupado/livre, uso medido) e
  `zn agent status|usage|model|effort|commands|run|pick|slide|interrupt`, conferidos ao vivo no
  Codex 0.163 e no Antigravity 1.4 (`npm run test:live`). Trocar modelo/esforço vale só na sessão;
  `--save` grava como padrão. O Sol espera o agente ficar livre (ou `--force`).
- `zn recruit` e `zn terminal edit` com `--model` e `--effort` para Codex, Antigravity e Claude
  (Claude: só modelo).
- `zn node copy|move "Nome" --to "Universo"|Origem`, com o conteúdo.
- Selos de status guardados em disco (voltam ao abrir; somem depois de 7 dias).

**Falta**
- Claude Code e Grok CLI não estão instalados aqui: o `zn agent` neles segue a documentação, sem
  teste ao vivo (o `zn agent run` + `pick` genérico funciona com qualquer CLI).
- Travar elementos: fora do escopo por decisão do usuário (21/10).
- Agrupar: implementado como Buraco negro após novo pedido do usuário. Menu Astros e barra de
  seleção, recolher/abrir sem encerrar elementos, conexões preservadas, cópia e modo compacto.
  Validação detalhada em `../testing/black-holes.md`.

### Agente com acesso de F12 aos sites (feito em 21/10)
O depurador de cada site do canvas liga assim que ele nasce (o site abre em branco, o depurador
liga e só então o endereço carrega), então o agente vê também o carregamento inicial:
`zn web console` (logs, avisos, erros não tratados, avisos do navegador), `zn web network`
(requisições com status, tipo, tamanho e tempo), `zn web request N` (cabeçalhos com cookies
HttpOnly, corpo enviado e resposta), `zn web source` (arquivos carregados e o código de cada um)
e `zn web cookies`. Limites que continuam: o site precisa estar aberto na tela; pop-ups (login)
ficam fora; guarda as últimas 1000 linhas de console e 500 requisições por site.

## Astros (antes "nós lógicos")

### Atualização de 21/10 — Cronos e ações
- **Concluído:** Cronos reúne inicialização, atraso inicial, intervalo, horário/dias da semana, data específica e esperas por duração/sinal. Mantém compatibilidade com Ignição e Espera anteriores; permite pausar disparos. Só executa com o Zênite aberto.
- **Concluído:** requisição HTTP com token por variável do .env e opção de serviço conectado; transformar texto/JSON e guardar variáveis; abrir aplicativo/arquivo/atalho por fluxo, incluindo arquivo conectado com abertura habilitada.
- **Validado:** interface real, recorrência em cinco galáxias, fluxo automático Cronos → HTTP → dados → aplicativo, pausa, persistência e modos Sempre perguntar/Sandbox/Controle total. Detalhes e limites em ../testing/chronos-actions.md.
- **Continua pendente:** próxima execução e histórico no cartão, formatação de datas, saída tipada de agente, filas/retomada em disco e execução com o aplicativo fechado. Os itens históricos abaixo que coincidem com esta atualização já foram atendidos conforme descrito aqui.

Feito em 20/10: Ignição (intervalo, horário, pasta), Satélite, Órbita, Gêmeos, Torre de controle,
Gravidade, Propulsor e `zn flow run`. A lista abaixo é o que ainda vale fazer.


### Repetição
- **Loop: repetir um processo X vezes**, em vez de só "para cada linha". Ex.: gerar 5 variações
  de um texto, tentar até 3 vezes. Expõe `{{volta}}` (1, 2, 3…) e `{{total}}`.
- **Repetir enquanto / até**: repete até uma condição bater (ex.: até a resposta conter "OK"),
  com um limite máximo de voltas para não rodar para sempre.
- **Para cada, de qualquer lista**, não só tabela: linhas de uma tabela, arquivos de uma pasta
  (com filtro por extensão), linhas de uma nota, itens de um JSON que um agente devolveu.

### Relógio (gatilhos de tempo)
- **Cron**: repetir em horários ("todo dia às 9h", "seg a sex às 18h", "a cada hora").
- **Timer / intervalo**: a cada X minutos, ou uma vez depois de X minutos.
- **Data**: rodar uma vez numa data e hora marcadas.
- Mostrar no nó a próxima execução e as últimas; poder pausar.
- Só roda com o Zênite aberto (decidir se vale um modo "em segundo plano").

### Outros gatilhos
- Arquivo novo ou alterado numa pasta.
- Linha nova numa tabela, nota alterada.
- Um agente chamar o fluxo (`zn flow run "Nome"`).

### Lógica e dados
- **Condição (Se / Senão)**: compara campos (igual, contém, maior que, vazio) e segue por uma
  saída ou outra.
- **Roteador (Órbita)**: várias saídas por regra, com uma saída de exceção; depois, opção de um
  decisor com CLI em esforço baixo ou o Sol escolhendo.
- **Juntar / esperar todos**: reúne os resultados de caminhos paralelos antes de seguir.
- **Esperar**: pausa X segundos/minutos (útil com limites de uso).
- **Variáveis do fluxo**: valores que qualquer nó lê e grava (`{{var.nome}}`).
- **Transformar texto/JSON**: extrair um campo, juntar, cortar, trocar, formatar data.
- **Saída tipada do Agente**: pedir JSON com campos definidos (os CLIs têm `--output-schema` /
  `--json-schema`) para os próximos nós usarem campo a campo.

### Ações
- Escrever/acrescentar em nota, criar arquivo, gravar em pasta.
- Avisar o usuário (notificação do Windows, selo no terminal).
- Mandar pedido a um terminal aberto (`zn ask`) e esperar a resposta — para quando precisa de
  conversa/contexto em vez de um CLI sem memória.
- Requisição HTTP (APIs externas), com a chave vinda do `.env` da galáxia.

### Motor
- Fila e estado guardados em disco (pendente, rodando, feito, falhou), sobrevivendo a fechar o app.
- Rodar itens em paralelo com limite por conta (respeitando o limite de uso).
- Repetir só o que falhou; parar e retomar um fluxo.
- Histórico de execuções por nó (entrada, saída, tempo, erro).
- Escolher qual conta usar automaticamente: a que tiver mais folga.

## Pendências conhecidas
- **Isolamento real dos terminais (21/10):** contêiner Linux por terminal, sem disco/projeto/contas do host, perfil persistente por conta e ponte de arquivos com Permitir/Cancelar, autorização lembrada e revogação. Teste visual com Docker real passou; detalhes, limites e compatibilidade em ../testing/isolation.md. Falta primeiro login e tarefa real de modelo no novo ambiente para cada provedor. Tentativa direta ao disco falha; o diálogo é acionado pelo pedido de acesso ao Zênite, não por um interceptador de cada syscall.
- **Ambiente isolado para agentes (21/10):** contêiner Docker Linux dedicado (zenite-agents:1) com limites estritos (uid 1000, read-only root, tmpfs descartável em /workspace, sem socket Docker), volumes persistentes de perfil por conta/agente em /home/agent, e ponte segura via zn access read|write|list conectada ao CanvasAccess. Arquivos conectados ao canvas são liberados diretamente; caminhos externos pedem confirmação ou são barrados no Sandbox. Validado em janela real do Electron, Docker Desktop e suíte de 284 testes. Detalhes em ../testing/isolation.md.
- **Sol deve começar pelo canvas (21/10):** promoção agora envia instrução explícita para executar `zn list`, usar elementos ligados e não interpretar a pasta do terminal como autorização para varrer o disco. Orientação enviada também em Sempre perguntar/Sandbox, sem ativar Full Access. Build, 18 testes e entrega na janela real passaram com agente simulado; confirmar obediência no Antigravity real. Em Controle total, a orientação não restringe tecnicamente as ferramentas próprias do CLI.
- **Teste visual do Sol (21/10)**: `zn ask --no-wait --file` com pedido longo ficou colado no Codex,
  sem submeter; foi necessário Enter adicional pelo canal interno. Reproduzido em dois cenários.
- **Tabela com CSV multilinha (21/10)**: criação/escrita pelo Sol real preservaram só o cabeçalho;
  ele completou com `table set`. Investigar a passagem das quebras de linha pelo atalho do Windows.
- **Receptor Codex perde ambiente (21/10)**: recebeu os marcadores dos fluxos, mas suas ferramentas
  não tinham `zn`/`O_TERMINAL_ID` corretos e não gravaram a nota de saída. Investigar reutilização
  do processo de fundo entre terminais da mesma conta. Não considerar recebimento prova de persistência.
- **Sol e permissões (21/10)**: promoção respeita Sempre perguntar/Sandbox/Acesso total; só acesso
  total ativa Full Access na sessão e envia o prompt solicitado. Testados no Codex real. Sandbox
  bloqueou escrita fora do projeto. Propulsor pede aprovação em Sempre perguntar, é recusado em
  Sandbox e executa em Acesso total. Ver ../testing/sol.md para evidências e casos restantes.
- **Confirmação para fechar (21/10)**: seis cenários passaram no app real com perfis descartáveis,
  incluindo cancelamento, encerramento dos processos e persistência de Não perguntar de novo.
- **Sol sem teste automático** (21/10): universos pelo Sol (precisa de git), `zn flow stop/status` com
  um fluxo de verdade, `recruit` com Codex/Claude e `--account`, criar imagem/vídeo/arquivo/pasta,
  `zn canvas apply`, as formas de desenho além de seta/quadro/texto, e um agente de verdade usando
  tudo isso no app. Roteiro passo a passo em ../testing/sol.md.
- **Claude Code** não está instalado neste computador: o nó Agente com Claude não foi testado.
- **Codex com a mesma conta em duas janelas**: o processo de fundo é um só por conta e pode
  guardar a identidade da primeira janela (o `zn` sairia "em nome" da outra). Testar e corrigir.
- **Campo de Esforço no Novo/Editar do terminal** (hoje só pelo comando, ex.:
  `codex -c model_reasoning_effort=low`).
- **Balde, laser e quadro** (barra de desenho) só passaram por tipos e build, sem teste no app.
- **Visão resumida** testada com terminais e notas; abrir sites e vídeos com zoom não foi testado.
- **handoff.md** é de 19/10 e não cobre as mudanças de 20/10.
- **Uso de limite** do Claude e do Antigravity só pelo aviso na tela (sem números).

## Ideias soltas
- Visão resumida com layout próprio por tipo (o Sol no centro, planetas em volta).
- Painel de tarefas (quem está fazendo o quê) ligado ao motor dos fluxos.
- Modelos de fluxo prontos (ex.: "processar pedidos da tabela", "resumir vídeos novos da pasta").
