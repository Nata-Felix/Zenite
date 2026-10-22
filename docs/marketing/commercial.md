# Comercial do Zênite

Direção: uma demonstração real, sem locução nesta versão. Ritmo e duração seguem as ações,
sem obrigação de limitar o comercial a 60 segundos. Títulos curtos e trilha instrumental original.

## História: projeto Aurora

1. **Contexto**: o briefing de um protótipo fica em uma nota conectada aos terminais.
2. **Requisitos**: uma tabela organiza o que precisa ser entregue e validado.
3. **Execução local**: os terminais leem o contexto conectado e salvam um relatório verificável.
   São processos Node.js reais; não apresentar a execução local como resposta de um modelo de IA.
4. **Referências**: imagens, pasta e arquivos permanecem no canvas, junto de um site navegável.
5. **Arquitetura**: desenhos e texto explicam o caminho da ideia até a interface.
6. **Universo**: criar uma cópia Git real, fazer uma mudança no projeto fictício e revisar antes do merge.
7. **Fluxo**: executar início → espera → decisão → saída e mostrar o resultado de verdade.

As ligações precisam mostrar pelo menos três efeitos: Aurora, Microcometas e Hélice galáctica.
Filmar repouso e atividade, além de ligações entre tipos diferentes de elementos.

## Produção reproduzível

- `scripts/video/film.json`: capítulos, títulos e critérios de captura.
- `scripts/video/studio.cjs`: carrega o aplicativo real com perfil descartável e grava os frames do compositor.
- `scripts/video/demo-worker.cjs`: execução local real pelo canal autenticado do canvas, com dados fictícios.
- `scripts/video/score.py`: trilha instrumental original; depende de NumPy nas ferramentas locais de vídeo.
- `scripts/video/render.py`: gera a abertura e monta capítulos a partir dos brutos reais. Recusa concluir o filme se faltar uma captura.
- Saídas: `out/comercial-zenite/`, incluindo brutos, capturas, trilha e perfil de demonstração.

Executar na raiz do projeto, depois de `npm run build`. O FFmpeg é localizado por
`ZENITE_FFMPEG` ou em `out/video-tools/package/ffmpeg.exe`. A gravação não deve incluir
contas, e-mails, caminhos pessoais, notificações ou projetos reais.

O usuário pediu que a produção se limite ao projeto e à sua tela, sem controlar o PC.
As tomadas usam a API interna e o WebContents do aplicativo, sem mover o mouse,
trocar foco entre aplicativos ou gravar a área de trabalho. Os perfis são descartáveis.

Em 22/10/2026 foram capturados o canvas, três efeitos de ligação, elementos, desenhos,
universo Git e um fluxo com saída verificada no terminal. O fluxo não escreve em notas:
o destino é um terminal real que recebe o texto e salva `resultado-fluxo.json`.
O capítulo de agentes usa Codex CLI autenticado, com promoção real do Sol e tarefas
delegadas pelo canal `zn`. Não apresentar processos Node auxiliares como modelos de IA.
O capítulo de isolamento deve distinguir opções configuráveis de um contêiner realmente
executado; não mostrar um estado preparado se o Docker não estiver disponível.

## Critérios para o corte final

- Sem locução e sem reaproveitar música, marca ou mascotes da referência.
- Priorizar funcionamento legível: contexto, ação e consequência na mesma sequência.
- Não fabricar resultados, conversas de agentes ou aprovações para a câmera.
- Mostrar mais de um efeito de conexão, desenho, elementos, universo e fluxo.
- Identificar o projeto como demonstração. Não apresentar roteiro ou animação ilustrativa como captura funcional.
- Revisar quadros, transições, leitura dos textos e integridade do MP4 antes de entregar.
