// Sol do comercial: coreografia com comandos reais do Zênite (zn), executada no terminal
// promovido a Sol. Não é uma resposta de modelo: o roteiro é fixo e cada passo é uma
// operação de verdade no canvas (universo, tabela, terminais, desenhos, astros, ligações).
//   node sol-show.cjs bugs | youtube
const { execFileSync } = require('node:child_process');
const { existsSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const story = process.argv[2];
const dir = process.cwd();
const root = resolve(__dirname, '../..');
const cli = join(root, 'out/cli/index.js');
const env = { ...process.env, ZN_CLI: cli };
const { appendFileSync } = require('node:fs');
const log = text => appendFileSync(join(dir, '.sol.log'), text + '\n');
const zn = (...args) => { log('zn ' + JSON.stringify(args)); try { return execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { log('ERRO ' + (e.stderr || e.message)); throw e; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = async file => { while (!existsSync(join(dir, file))) await sleep(250); };
const c = (rgb, t) => `\x1b[38;2;${rgb}m${t}\x1b[0m`;
const gold = '245;201;107', dim = '125;134;159', green = '79;209;165', white = '232;236;248';
const say = text => console.log('\n' + c(gold, '☀ ') + c(white, text) + '\n');
const type = async (text, ms = 28) => { process.stdout.write(c(dim, '› ')); for (const ch of text) { process.stdout.write(ch); await sleep(ms); } process.stdout.write('\n'); };
// Cada passo aparece como uma linha de ação; o comando real roda e a linha fecha com ✓.
// Depois de cada passo a câmera do canvas enquadra o resultado (zn canvas fit), para a
// construção acontecer à vista.
const fit = (target) => { try { zn('canvas', 'fit', ...(target ? [target] : [])); } catch {} };
const step = async (label, ...commands) => {
  const target = typeof commands.at(-1) === 'string' ? commands.pop() : undefined;
  process.stdout.write(c(dim, '  • ') + label.padEnd(38));
  for (const args of commands) zn(...args);
  console.log(c(green, '✓'));
  fit(target);
  await sleep(700);
};
const worker = (mode, script) => `node '${join(__dirname, script)}' ${mode}`;

async function youtube() {
  const yt = (mode) => `node '${join(__dirname, 'story-youtube.cjs')}' ${mode}`;
  require('node:fs').mkdirSync(join(dir, 'thumbs'), { recursive: true });
  console.log(c(gold, '☀ SOL') + c(dim, '  orquestrador do canvas · Cozinha da Bia\n'));
  await wait('.go');
  await type('Oi Sol, me ajuda a fazer o roteiro do meu vídeo, com thumb, e analisar meu canal do YouTube.');
  await sleep(500);
  say('Claro! Vou montar tudo aqui no canvas.');
  await sleep(500);
  await step('Abrindo o YouTube', ['node', 'create', 'site', 'YouTube', '--url', 'https://www.youtube.com', '--at', '700,0', '--size', '940x560']);
  await step('Criando a nota Roteiro', ['node', 'create', 'nota', 'Roteiro', '--at', '1700,0', '--size', '560x560', '--text', '# Roteiro', '--color', '#f2c46d']);
  await step('Criando Títulos e hashtags', ['node', 'create', 'tabela', 'Títulos e hashtags', '--at', '700,620', '--size', '940x330', '--text', 'Título;Hashtags;Potencial']);
  await step('Criando a pasta Thumbs', ['node', 'create', 'pasta', 'Thumbs', '--at', '1700,620', '--size', '560x330', '--path', join(dir, 'thumbs')]);
  await step('Recrutando o Roteirista', ['recruit', 'Roteirista', '--agent', 'shell', '--command', yt('writer'), '--cwd', dir, '--at', '0,1020']);
  await step('Recrutando o Pesquisador', ['recruit', 'Pesquisador', '--agent', 'shell', '--command', yt('research'), '--cwd', dir, '--at', '660,1020']);
  await step('Recrutando Gerar imagem', ['recruit', 'Gerar imagem', '--agent', 'shell', '--command', yt('thumbs'), '--cwd', dir, '--at', '1320,1020']);
  await step('Ligando cada um ao seu lugar', ['connect', 'Roteirista', 'Roteiro'], ['connect', 'Pesquisador', 'Títulos e hashtags'], ['connect', 'Pesquisador', 'YouTube'], ['connect', 'Gerar imagem', 'Thumbs'], ['connect', 'Roteiro', 'Gerar imagem']);
  await step('Criando os astros da rotina', ['flow', 'create', 'ignicao', 'Toda segunda às 9h', '--at', '0,1500', '--daily', '09:00', '--days', '1'],
    ['flow', 'create', 'aprovacao', 'Aprovar o roteiro', '--at', '380,1500', '--link', 'Toda segunda às 9h'],
    ['flow', 'create', 'espera', 'Esperar a thumb', '--at', '760,1500', '--config', '{"waitSeconds":30}', '--link', 'Aprovar o roteiro']);
  await step('Desenhando o plano', ['draw', 'quadro', 'Vídeo da semana', '--around', 'Roteiro;Títulos e hashtags;Thumbs', '--stroke', '#ff7a93']);
  writeFileSync(join(dir, '.start-work'), '1');
  say('Equipe trabalhando. Roteiro, títulos e thumbs saindo.');
  fit('Roteiro'); await sleep(4200);
  fit('Títulos e hashtags'); await sleep(3800);
  fit('Thumbs');
  while (!existsSync(join(dir, '.thumbs-done'))) await sleep(250);
  await step('Mostrando a thumb no canvas', ['node', 'create', 'imagem', 'Thumb escolhida', '--at', '2320,620', '--size', '560x330', '--path', join(dir, 'thumbs', 'thumb-1.png'), '--link', 'Thumbs'], 'Thumb escolhida');
  await sleep(1500);
  fit();
  say('Pronto! Roteiro, 4 títulos com hashtags e 3 thumbs.');
  await sleep(3000);
  writeFileSync(join(dir, '.sol-done'), String(Date.now()));
}

async function bugs() {
  let work = dir;
  const api = process.env.ZENITE_FILM_API;
  console.log(c(gold, '☀ SOL') + c(dim, '  orquestrador do canvas · Loja Aurora\n'));
  await wait('.go');
  await type('Sol, me avise quais bugs você encontrar no projeto e anote na tabela Bugs. Depois vá corrigindo e marque na tabela o que conseguiu corrigir e os arquivos afetados.');
  await sleep(600);
  say('Tudo bem, te aviso quando estiver pronto.');
  writeFileSync(join(dir, '.answered'), String(Date.now()));
  await sleep(700);
  await step('Criando o universo Correções', ['universe', 'create', 'Correções']);
  // Os terminais trabalham na cópia do universo: as correções não tocam a Origem até o merge.
  try { work = JSON.parse(zn('universe', 'status', 'Correções', '--json')).path || dir; } catch {}
  await step('Recrutando o Caçador de bugs', ['recruit', 'Caçador de bugs', '--agent', 'shell', '--command', worker('hunter', 'story-bugs.cjs'), '--cwd', work, '--at', '700,500']);
  await step('Recrutando o Corretor', ['recruit', 'Corretor', '--agent', 'shell', '--command', worker('fixer', 'story-bugs.cjs'), '--cwd', work, '--at', '1360,500']);
  await step('Criando a tabela Bugs', ['node', 'create', 'tabela', 'Bugs', '--at', '700,0', '--size', '1260x420', '--text', '#;Bug;Arquivo;Status', '--link', 'Caçador de bugs;Corretor']);
  await step('Ligando o projeto aos dois', ['connect', 'Loja Aurora', 'Caçador de bugs'], ['connect', 'Loja Aurora', 'Corretor']);
  await step('Desenhando a missão', ['draw', 'quadro', 'Missão: zero bugs', '--around', 'Bugs;Caçador de bugs;Corretor', '--stroke', '#f5c96b'],
    ['draw', 'seta', '--from', 'Caçador de bugs', '--to', 'Corretor', 'achou → corrige', '--stroke', '#ff7a93', '--stroke-width', '4']);
  writeFileSync(join(dir, '.menu'), '1');
  await wait('.menu-done');
  await step('Criando o astro Avisar o cliente', ['flow', 'create', 'ignicao', 'Avisar o cliente', '--at', '700,1020', '--input', 'Seu projeto está concluído. Quer que eu mande o resumo por aqui?']);
  await step('Criando a espera do merge', ['flow', 'create', 'espera', 'Conferir o merge', '--at', '1060,1020', '--config', '{"waitSeconds":2}', '--link', 'Avisar o cliente']);
  await step('Criando o webhook do WhatsApp', ['flow', 'create', 'http', 'WhatsApp do cliente', '--at', '1420,1020', '--config', JSON.stringify({ http: { url: `${api}/whatsapp`, method: 'POST', body: '{{entrada}}', bodyType: 'text' } })]);
  await step('Ligando os astros', ['connect', 'Conferir o merge', 'WhatsApp do cliente']);
  // Só agora o Caçador começa: a câmera aproxima da tabela enquanto ela se preenche.
  writeFileSync(join(work, '.start-hunt'), '1');
  say('Equipe pronta. Começando a caça aos bugs.');
  fit('Bugs');
  while (!existsSync(join(work, '.hunter-done'))) await sleep(250);
  fit();
  while (!existsSync(join(work, '.fixer-done'))) await sleep(250);
  fit('Bugs');
  await sleep(1800);
  say('Pronto! 7 bugs corrigidos em 4 arquivos. Avisando o cliente…');
  fit('WhatsApp do cliente');
  await sleep(800);
  zn('flow', 'run', 'Avisar o cliente');
  await sleep(3500);
  writeFileSync(join(dir, '.sol-done'), String(Date.now()));
}

({ bugs, youtube })[story]?.().catch(e => { log('PAROU ' + e.message); console.error(e.message); });
setInterval(() => {}, 1 << 30);
