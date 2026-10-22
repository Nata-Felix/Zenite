# Cronos e ações dos fluxos

Validação em 21/10/2026, com janelas visíveis do Zênite e perfis descartáveis.

## Entrega

- Cronos: inicialização, atraso após inicialização, intervalo, horário recorrente, data específica, espera após entrada e espera por sinal. Durações em segundos, minutos, horas ou dias; saída Continuar e mensagem configurável.
- Ignição mantém os modos manual e arquivo novo em pasta. Configurações antigas de tempo são convertidas ao editar, preservando conexões; o motor continua aceitando os formatos anteriores.
- Requisição HTTP: endereço próprio ou serviço HTTP conectado, cinco métodos, corpo JSON/texto, token Bearer por variável do .env da galáxia e resposta disponível ao próximo passo.
- Transformar dados: modelo de texto, extração/formatação JSON, substituição literal, separar/juntar lista e guardar variável.
- Abrir aplicativo: arquivo/atalho pelo sistema ou executável com argumentos separados, com opção de aguardar a conclusão.
- Arquivos no canvas têm a opção Abrir ao receber um fluxo, inicialmente desativada.

## Verificações

`npm run test:chronos` abre o aplicativo real, percorre os sete modos, verifica segundos/dias, persistência, edição de Espera antiga e disparos em cinco galáxias com somente uma visível.

`npm run test:flow-actions` abre o aplicativo real, configura os campos na interface e percorre Ignição → HTTP → dados → aplicativo. Depois ativa Cronos → HTTP → dados → aplicativo, aguarda um disparo automático e confirma que a pausa impede os seguintes. Também verifica persistência ao recarregar e permissões globais.

A API é um servidor local de teste. O executável é um processo Node real que grava uma mensagem dentro do projeto descartável; os argumentos não passam por shell. A abertura pelo programa padrão é substituída por um registro no teste, para não abrir aplicativos pessoais. As respostas às confirmações nativas são simuladas nesse perfil; os testes unitários cobrem aceitação, recusa, interrupção e alterações enquanto a confirmação está aberta. Docker e serviços de contas pessoais não foram usados.

`npm test` cobre o motor, validação temporal, credenciais ocultadas na resposta HTTP, limites de dados, conexões removidas, argumentos separados, cópia/importação e Cronos importado pausado.

Evidências visuais e resultados ficam em `out/chronos-qa` e `out/flow-actions-qa`.

## Limites desta versão

Os agendamentos funcionam enquanto o Zênite estiver aberto, inclusive nas galáxias que não estiverem na tela. Fechar encerra o agendamento; ao reabrir, intervalos reiniciam e disparos vencidos não são recuperados. O programa externo já aberto pode continuar executando. Execuções do mesmo astro não se sobrepõem; disparos enquanto ele está ocupado não entram em fila.

Sempre perguntar exige autorização para cada ação externa. Controle total executa sem confirmação. Sandbox bloqueia HTTP e abertura externa; transformações locais continuam disponíveis. A configuração do Sol não amplia essas permissões.

Não há serviço de VPS, fila persistente, recuperação após fechamento ou histórico durável de execuções nesta entrega.
