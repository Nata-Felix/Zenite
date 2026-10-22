// Abre o aplicativo de produção com dados fictícios e grava seu compositor real.
// Os únicos endpoints de controle são captura, início/fim de gravação e diagnóstico.
const { app, BrowserWindow, session } = require('electron');
const { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { createServer } = require('node:http');
const root = resolve(__dirname, '../..');
const out = join(root, 'out/comercial-zenite');
for (const dir of ['raw', 'stills', 'audio', 'render']) mkdirSync(join(out, dir), { recursive: true });
const profile = mkdtempSync(join(out, 'profile-'));
const project = join(profile, 'Aurora');
const home = join(profile, 'home');
for (const dir of [project, home, join(home, '.agents/skills'), join(profile, 'workspaces'), join(profile, 'notes'), join(profile, 'tables'), join(profile, 'media')]) mkdirSync(dir, { recursive: true });
process.env.ZENITE_DATA_DIR = profile;
require('node:os').homedir = () => home;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
writeFileSync(join(project, 'README.md'), '# Aurora\n\nProjeto fictício para demonstrar o Zênite.\n');
writeFileSync(join(project, '.gitignore'), 'relatorio-local.json\n');
writeFileSync(join(project, 'interface.txt'), 'Versão original do projeto Aurora.\n');
if(process.env.ZENITE_FILM_SEED_PROJECT)copyFileSync(join(process.env.ZENITE_FILM_SEED_PROJECT,'index.html'),join(project,'index.html'));
execFileSync('git', ['init', '--quiet', project]);
execFileSync('git', ['-C', project, 'config', 'user.name', 'Equipe de demonstração']);
execFileSync('git', ['-C', project, 'config', 'user.email', 'demo@example.com']);
execFileSync('git', ['-C', project, 'add', '.']);
execFileSync('git', ['-C', project, 'commit', '--quiet', '-m', 'Inicia o projeto fictício Aurora']);
const canvas = (nodes, edges = [], viewport = { x: 40, y: 100, zoom: 0.83 }) => ({ version: 1, nodes, edges, viewport });
const el = (id, kind, title, x, y, width, height, extra = {}) => ({ id, kind, x, y, width, height, element: { id, kind, title, ...extra } });
const note = (id, title, text, x, y, width = 330, height = 250, color = 'blue') => {
  writeFileSync(join(profile, 'notes', id + '.md'), text);
  return el(id, 'note', title, x, y, width, height, { formatted: true, color });
};
const edge = (source, target, extra = {}) => ({ id: source + '-' + target, source, target, ...extra });
const worker = join(root, 'scripts/video/demo-worker.cjs');
const terminal = (id, title, x, y, color) => ({ id, kind: 'terminal', x, y, width: 500, height: 300, terminal: { id, title, command: `node '${worker}' '${title}'`, cwd: project, appearance: { color, fontSize: 16 } } });
const brief = '# Projeto Aurora\n\nUm espaço para transformar ideias em entregas.\n\n- Organizar o contexto\n- Conectar as ferramentas\n- Explorar em paralelo\n- Revisar antes de integrar\n\n**Objetivo:** clareza do início ao resultado.';
const hero = [note('briefing', 'Briefing · Aurora', brief, 10, 20, 350, 300), terminal('executor', 'Execução local', 480, 0, '#8ea2ff'), terminal('revisor', 'Verificação local', 480, 410, '#56d6ac'), note('resultado', 'Próximos passos', '# Um plano à vista\n\n1. Conectar o briefing\n2. Executar e verificar\n3. Comparar os resultados\n\n**Tudo no mesmo canvas.**', 1110, 80, 340, 280, 'purple')];
hero[0].summary = { x: 210, y: 180 }; hero[1].summary = { x: 580, y: 170 }; hero[2].summary = { x: 580, y: 480 }; hero[3].summary = { x: 980, y: 250 };
const canvases = { studio: canvas(hero, [edge('briefing', 'executor'), edge('briefing', 'revisor'), edge('executor', 'resultado'), edge('revisor', 'resultado')], { x: 45, y: 130, zoom: 0.80 }) };
copyFileSync(join(root, 'docs/design/backgrounds/02-orbitas.png'), join(profile, 'media/orbitas.png'));
writeFileSync(join(profile, 'tables/indicadores.json'), JSON.stringify([['Etapa', 'Estado', 'Responsável'], ['Planejamento', 'Pronto', 'Equipe'], ['Protótipo', 'Em revisão', 'Design'], ['Testes', 'Pronto', 'Qualidade'], ['Entrega', 'A seguir', 'Equipe']]));
canvases.elements = canvas([
  note('contexto', 'Contexto que acompanha o trabalho', '# Aurora / lançamento\n\nUm projeto. Vários tipos de material.\n\n**Briefing, referências e resultados** conectados no mesmo lugar.', 20, 20, 380, 255, 'yellow'),
  el('indicadores', 'table', 'Indicadores da entrega', 450, 20, 450, 255),
  el('imagem', 'image', 'Referência visual', 950, 20, 380, 255, { file: 'orbitas.png' }),
  el('site', 'web', 'Protótipo navegável', 20, 335, 730, 390, { url: 'about:blank' }),
  el('pasta', 'folder', 'Arquivos do projeto', 800, 335, 270, 390, { path: project }),
  el('arquivo', 'file', 'Documento da entrega', 1120, 335, 260, 210, { path: join(project, 'README.md') }),
], [edge('contexto', 'indicadores'), edge('indicadores', 'imagem'), edge('contexto', 'site')], { x: 35, y: 115, zoom: 0.84 });
const ds = { stroke: '#8ea2ff', fill: 'transparent', fillStyle: 'hachure', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, seed: 17, font: 'hand', fontSize: 36, textAlign: 'center' };
const draw = (id, shape, x, y, width, height, extra = {}) => ({ id, kind: 'draw', x, y, width, height, z: shape === 'text' ? 10 : -10, draw: { ...ds, shape, ...extra } });
canvases.draw = canvas([
  draw('ideias', 'text', 55, 50, 860, 85, { text: 'Do primeiro rabisco ao próximo passo.', fontSize: 48, textAlign: 'left', stroke: '#cbd6ff' }),
  draw('a', 'rectangle', 80, 230, 220, 130, { fill: '#d0bfff', fillStyle: 'hachure' }),
  draw('at', 'text', 105, 270, 175, 50, { text: 'Ideia', stroke: '#111527' }),
  draw('b', 'diamond', 540, 210, 240, 170, { fill: '#a5d8ff' }),
  draw('bt', 'text', 590, 270, 140, 50, { text: 'Caminho', fontSize: 30, stroke: '#111527' }),
  draw('arrow1', 'arrow', 310, 290, 210, 3, { points: [[0, 0.5], [1, 0.5]], stroke: '#8ea2ff', strokeWidth: 4 }),
  draw('caption', 'text', 70, 510, 800, 75, { text: 'Desenhe, anote e explique o que você está construindo.', fontSize: 30, textAlign: 'left', stroke: '#abb5cd' }),
], [], { x: 100, y: 130, zoom: 0.90 });
canvases.multiverse = canvas([
  note('versao', 'Projeto Aurora · Origem', '# Versão original\n\nExplore uma nova interface em uma cópia isolada do projeto.\n\nA Origem continua preservada até o merge.', 40, 80, 450, 310),
  el('fonte', 'file', 'interface.txt', 650, 80, 420, 310, { path: join(project, 'interface.txt') }),
], [edge('versao', 'fonte')], { x: 100, y: 190, zoom: 1.0 });
const flow = (id, title, x, y, spec) => el(id, 'flow', title, x, y, 285, 160, { flow: spec });
canvases.flows = canvas([
  flow('inicio', 'Começar a entrega', 10, 130, { type: 'ignition', schedule: 'manual', input: 'OK · Projeto Aurora validado', paused: true }),
  flow('espera', 'Pausa entre etapas', 370, 130, { type: 'wait', waitMode: 'timer', waitSeconds: 4 }),
  flow('decisao', 'Verificar o resultado', 730, 130, { type: 'gemini', condition: { op: 'contains', value: 'OK' } }),
  note('saida', 'Resultado do fluxo', '# Aguardando a execução\n\nO resultado real do fluxo aparecerá aqui.', 1120, 20, 330, 260, 'green'),
  note('ajustes', 'Revisar e ajustar', '# Um caminho alternativo\n\nSe a condição não for atendida, o fluxo segue por aqui.', 1120, 390, 330, 235, 'pink'),
], [edge('inicio', 'espera'), edge('espera', 'decisao'), edge('decisao', 'saida', { sourceHandle: 'a' }), edge('decisao', 'ajustes', { sourceHandle: 'b' })], { x: 20, y: 215, zoom: 0.82 });
canvases.flows.nodes[3]={id:'saida',kind:'terminal',x:1120,y:10,width:420,height:330,terminal:{id:'saida',title:'Validação · saída real',command:`node '${join(root,'scripts/video/flow-sink.cjs')}'`,cwd:project,appearance:{fontSize:16,color:'#56d6ac'}}};
const cliScript = join(root, 'scripts/video/cli-agent.cjs');
const cliTerminal = (id,title,role,x,y) => ({id,kind:'terminal',x,y,width:570,height:380,terminal:{id,title,command:`node '${cliScript}' '${role}'`,cwd:project,appearance:{fontSize:15,color:role==='sol'?'#f5c96b':role==='builder'?'#8ea2ff':'#56d6ac'}},summary:{x:x*.65+80,y:y*.65+100}});
canvases.agents=canvas([
  cliTerminal('sol-cli','Sol · Codex','sol',440,30),cliTerminal('builder-cli','Construtor Codex','builder',1120,30),cliTerminal('reviewer-cli','Revisor Codex','reviewer',1120,500),
  note('brief-cli','Briefing CLI','# Projeto Aurora\n\nConstrua um painel de tarefas funcional.\n\n- Adicionar tarefa\n- Marcar como concluída\n- Interface escura e legível\n- HTML, CSS e JavaScript puro\n\nSol delega. Construtor implementa. Revisor verifica.',0,0,330,330),
  note('delivery-cli','Entrega CLI','# Aguardando os agentes\n\nO resultado real será registrado aqui.',450,530,400,260,'green'),
  el('project-cli','folder','Projeto conectado',0,420,330,320,{path:project}),
], [edge('sol-cli','builder-cli'),edge('sol-cli','reviewer-cli'),edge('sol-cli','brief-cli'),edge('builder-cli','brief-cli'),edge('reviewer-cli','brief-cli'),edge('sol-cli','delivery-cli'),edge('builder-cli','project-cli'),edge('reviewer-cli','project-cli')],{x:35,y:125,zoom:.66});
const names = { studio: '01 · Canvas vivo', elements: '02 · Elementos', draw: '03 · Desenhe suas ideias', multiverse: '04 · Universos paralelos', flows: '05 · Fluxos em ação',agents:'06 · Sol e agentes CLI' };
for (const [id, state] of Object.entries(canvases)) writeFileSync(join(profile, 'workspaces', id + '.json'), JSON.stringify(state));
const index = { version: 1, activeId: 'studio', workspaces: Object.entries(names).map(([id, name]) => ({ id, name, dir: project, universes: [] })), settings: { confirmQuit: false, agentGuide: false, agentPermissions: 'ask', isolatedAgents: false, notifyDone: false, notifyRequest: false } };
writeFileSync(join(profile, 'workspaces/index.json'), JSON.stringify(index));
const seed = join(profile, 'seed.cjs');
writeFileSync(seed, `if(!localStorage.getItem('studio.seed')){localStorage.setItem('studio.seed','true');localStorage.setItem('o.theme','"dark"');localStorage.setItem('o.accent','"indigo"');localStorage.setItem('o.summaryView','false');localStorage.setItem('o.canvasBg',JSON.stringify({pattern:'starfield',spacing:'large',size:1,intensity:.6,detail:.24}));localStorage.setItem('o.canvas',JSON.stringify({v:2,edge:'bezier',pulse:true,connectionAnimation:'aurora',connectionEffect:{color:'',activeSpeed:1,idleSpeed:.8},hideConnectionLine:true,startTool:'hand'}));}`);
let win, active, latest;
const ffmpeg = process.env.ZENITE_FFMPEG || join(root, 'out/video-tools/package/ffmpeg.exe');
let apiPort;
const api = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/status') return res.end(JSON.stringify({ ready: !!win, active: active?.name, profile, project, apiPort }));
    if (!win) throw Error('A janela ainda não está pronta');
    if (url.pathname === '/shot') {
      const name = (url.searchParams.get('name') || 'studio').replace(/[^a-z0-9-]/gi, '');
      writeFileSync(join(out, 'stills', name + '.png'), (await win.webContents.capturePage()).toPNG());
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === '/quit') { res.end('{"ok":true}'); setTimeout(() => app.quit(), 250); return; }
    if (url.pathname === '/start') {
      if (active) throw Error('Gravação já está ativa');
      const name = url.searchParams.get('name');
      if (!/^[a-z0-9-]+$/.test(name)) throw Error('Nome inválido');
      latest = await win.webContents.capturePage();
      const { width, height } = latest.getSize();
      const process = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', width + 'x' + height, '-framerate', '25', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', join(out, 'raw', name + '.mp4')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      const state = active = { name, process, width, height, frames: 0, started: Date.now(), error: '' };
      process.stderr.on('data', chunk => state.error += chunk);
      process.stdin.on('error', () => {});
      win.webContents.beginFrameSubscription(false, image => { latest = image; });
      state.timer = setInterval(() => {
        if (!latest || process.stdin.writableLength > width * height * 12) return;
        let image = latest;
        const size = image.getSize();
        if (size.width !== width || size.height !== height) image = image.resize({ width, height });
        process.stdin.write(image.toBitmap()); state.frames++;
      }, 40);
      return res.end(JSON.stringify({ ok: true, name, width, height }));
    }
    if (url.pathname === '/stop') {
      if (!active) throw Error('Nenhuma gravação ativa');
      const state = active; active = null;
      clearInterval(state.timer); win.webContents.endFrameSubscription(); state.process.stdin.end();
      await new Promise(resolve => state.process.once('close', resolve));
      const info = { name: state.name, width: state.width, height: state.height, frames: state.frames, duration: state.frames / 25, wallDuration: (Date.now() - state.started) / 1000, error: state.error };
      writeFileSync(join(out, 'raw', state.name + '.json'), JSON.stringify(info, null, 2));
      return res.end(JSON.stringify(info));
    }
    if (url.pathname === '/site') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<body style="margin:0;background:#111425;color:#e9edff;font:17px Segoe UI;padding:45px"><small style="color:#9dacff;letter-spacing:4px">AURORA / ESTÚDIO</small><h1 style="font-size:46px;font-weight:400">Ideias encontram<br>o próximo passo.</h1><p style="color:#a4adc5;line-height:1.8">Um protótipo local, dentro do seu canvas.<br>Contexto perto de quem está construindo.</p><button onclick="this.textContent=\'Protótipo validado ✓\'" style="border:0;border-radius:9px;background:#a5b5ff;padding:14px 20px;margin-top:18px">Explorar o projeto →</button>');
    }
    if (url.pathname === '/produced') { res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end(readFileSync(join(project,'index.html'),'utf8')); }
    res.statusCode = 404; res.end('{}');
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); }
});
api.listen(0, '127.0.0.1', () => {
  apiPort = api.address().port;
  const state = canvases.elements; state.nodes.find(node => node.id === 'site').element.url = `http://127.0.0.1:${apiPort}/site`;
  writeFileSync(join(profile, 'workspaces/elements.json'), JSON.stringify(state));
  writeFileSync(join(out, 'studio.json'), JSON.stringify({ apiPort, profile, project }, null, 2));
});
app.whenReady().then(() => session.defaultSession.registerPreloadScript({ type: 'frame', filePath: seed }));
app.once('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', () => {
    win = window;
    win.setContentSize(1600, 900); win.center(); win.setTitle('Zênite · Estúdio do comercial');
    win.webContents.setBackgroundThrottling(false);
    win.showInactive();
    writeFileSync(join(out, 'ready.json'), JSON.stringify({ apiPort, profile, project, pid: process.pid }));
    console.log('STUDIO READY');
    if (process.env.ZENITE_FILM_AUTORUN === '1') require(process.env.ZENITE_FILM_PHASE==='result'?'./take-result.cjs':process.env.ZENITE_FILM_PHASE==='completion'?'./take-completion.cjs':process.env.ZENITE_FILM_PHASE==='agents'?'./take-agents.cjs':'./take.cjs')({ win, out, profile, project, api: () => `http://127.0.0.1:${apiPort}` }).catch(error => { console.error(error.stack); writeFileSync(join(out, 'take-error.txt'), error.stack); });
  });
});
app.on('will-quit', () => { api.close(); if (active) { clearInterval(active.timer); active.process.stdin.end(); } });
require(join(root, 'out/main/index.js'));
