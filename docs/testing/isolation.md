# Isolamento dos terminais e persistência dos perfis

Implementado em 21/10/2026. O isolamento é habilitado por padrão em Configurações → Agentes. Requer Docker Desktop em modo Linux e a preparação da imagem `zenite-agents:2`.

## Funcionamento

Todos os comandos dos terminais, inclusive shell e agentes personalizados, são iniciados dentro de um contêiner. O comando do usuário não é interpretado pelo shell do Windows. Se Docker ou a imagem não estiverem disponíveis, o terminal falha e não abre uma sessão nativa como alternativa.

A imagem inclui Codex, Claude Code, Antigravity, Node, Python e Git. Outros agentes precisam estar disponíveis no ambiente Linux; executáveis exclusivos do Windows não são compatíveis. O limite de acesso ao disco é aplicado ao processo e seus filhos, sem depender de instruções ou hooks do modelo.

O contêiner roda como usuário 1000, sem capabilities, sem novos privilégios, com raiz somente leitura e limites de processos, memória e CPU. Não recebe o disco, projeto, socket do Docker ou contas do Windows. São montados somente o perfil próprio e o CLI do Zênite, este somente para leitura. Não é uma VM nem uma garantia contra vulnerabilidades do kernel/Docker. O ambiente mantém rede para autenticação e acesso aos provedores; não implementa uma política de bloqueio geral de rede.

## Arquivos e autorizações

A área `/workspace` é temporária. A pasta mostrada como referência da galáxia não é montada automaticamente. O cabeçalho do terminal indica `Isolado · /workspace`.

Os comandos `zn access read CAMINHO --out local`, `zn access write CAMINHO --file local` e `zn access list CAMINHO` transferem arquivos ou listam uma pasta por uma ponte autenticada. `--binary` preserva bytes. O limite atual é 1 MB por transferência e 300 nomes por listagem.

Arquivos/pastas diretamente conectados são autorizados pela conexão. Fora deles, o Zênite mostra Permitir/Cancelar antes de entregar ou gravar dados. Em Controle total, a pessoa pode lembrar a autorização específica para aquele terminal/operação/recurso nesta sessão; Configurações permite revogar. Sempre perguntar exige nova decisão e não guarda aprovações automáticas. Sandbox recusa acesso fora dos recursos conectados e não oferece autorização para escapar desse limite. Junctions são resolvidas antes da decisão.

Uma tentativa de abrir diretamente um caminho do Windows dentro do contêiner falha porque o arquivo não existe ali. Isso não dispara automaticamente um diálogo para cada chamada de sistema: o diálogo aparece quando o acesso é solicitado pela ponte do Zênite. Não há interceptador universal de syscalls nesta entrega.

O Sol continua organizando o canvas, mas não ganha leitura automática de elementos desconectados no ambiente isolado. Conectar um caminho novo por comandos exige autorização de conexão; a mensagem explica o escopo de leitura/gravação de uma pasta e suas subpastas. Rotas não incluídas na lista permitida, navegação para arquivos locais e disparos de fluxos pelo terminal são recusados. As operações de Git/universos no computador não estão expostas pela ponte isolada nesta versão. Os Satélites/Torres também iniciam seus CLIs em contêineres. Ações do fluxo que executam operações no computador ou scripts exigem confirmação com a proteção ativa; Sandbox mantém a recusa.

## Logins

Cada conta/agente usa um volume persistente próprio em `/home/agent`. Fechar o terminal ou o aplicativo remove o contêiner e a área temporária, preservando o volume. Outro terminal da mesma conta/agente reutiliza o perfil; contas/agentes diferentes usam volumes diferentes. Contas padrão são separadas por agente.

Os logins do Windows não são copiados. É necessário autenticar uma primeira vez no ambiente isolado; depois, a renovação depende do provedor. Para Codex, `codex login --device-auth` evita depender de uma porta OAuth no computador. O perfil só deixa de valer ao sair, remover seus dados ou se o provedor expirar/revogar a autorização. Remover uma conta tenta remover seu volume sem forçar a exclusão de um perfil em uso.

Volumes de perfil não ficam no projeto nem entram nos pacotes de exportação de galáxias. Instruções pessoais dos perfis são preservadas ao atualizar o bloco do Zênite. A persistência é de perfil; arquivos temporários de trabalho devem ser gravados de volta por acesso autorizado antes de fechar.

## Validação

- `npm test`: suíte de regressão, incluindo acesso por terminal/recurso, revogação, escopos, falhas e autenticação da ponte.
- `npm run test:isolation`: aplicativo real e contêiner real, com terminal visível. Verifica usuário sem privilégios, ausência do arquivo do host e do socket do Docker, leitura ligada sem prompt, recusa/aceitação de acesso externo, repetição em Sempre perguntar, autorização lembrada em Controle total, revogação, recusa no Sandbox, gravação em pasta conectada e persistência do perfil ao recriar o terminal.
- O teste executa os comandos de versão/ajuda dos três agentes instalados. As respostas aos diálogos nativos são simuladas apenas no perfil descartável. Não faz login nos provedores nem pede tarefas a modelos reais.
- `node tests/docker/isolated-headless.check.cjs`: processo sem tela em contêiner real; entrada com aspas/quebras preservada, perfil persistente em uma segunda execução e ausência do disco do host e socket Docker. Não é uma chamada de modelo.
- Evidências: `out/isolation-ui-qa/resultado.json` e capturas nessa pasta.

Ainda falta validar uma sessão OAuth real e uma tarefa de modelo para cada provedor no novo ambiente. É uma etapa que exige o primeiro login da pessoa; não foi apresentada como teste concluído.

Referências da implementação: [execução de contêineres](https://docs.docker.com/engine/containers/run/), [volumes persistentes](https://docs.docker.com/engine/storage/volumes/) e [instalação do Antigravity CLI](https://www.antigravity.google/docs/cli/install/).
