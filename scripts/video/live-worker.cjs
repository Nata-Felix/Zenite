// Terminais do canvas gigante: cada papel faz um trabalho local real e contínuo no projeto
// de demonstração (git, servidor, verificação, arquivos, sistema). Não simula respostas de IA.
// Cada papel publica o próprio estado em .status/<papel>.json, lido pelos painéis do canvas.
const { execFileSync } = require('node:child_process');
const { createServer, get } = require('node:http');
const { appendFileSync, existsSync, readFileSync, readdirSync, statSync, watch, writeFileSync, mkdirSync } = require('node:fs');
const { gzipSync } = require('node:zlib');
const { join } = require('node:path');
const os = require('node:os');
const role = process.argv[2];
const cwd = process.cwd();
const c = (rgb, text) => `\x1b[38;2;${rgb}m${text}\x1b[0m`;
const blue = '153;174;255', green = '86;214;172', gold = '245;201;107', pink = '255;140;190', dim = '130;140;165';
const clear = () => process.stdout.write('\x1b[2J\x1b[H');
const bar = (value, width = 24) => '█'.repeat(Math.round(value * width)).padEnd(width, '·');
const time = () => new Date().toLocaleTimeString('pt-BR');
const git = (...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const status = data => { mkdirSync(join(cwd, '.status'), { recursive: true }); writeFileSync(join(cwd, '.status', role + '.json'), JSON.stringify({ ...data, at: Date.now() })); };
const every = (ms, fn) => { const run = () => { try { fn(); } catch (e) { console.log(c(pink, e.message)); } }; run(); setInterval(run, ms); };

const roles = {
  // Commits reais numa pasta de registros e o grafo do histórico.
  git() {
    mkdirSync(join(cwd, 'registros'), { recursive: true });
    let n = 0;
    every(3200, () => {
      appendFileSync(join(cwd, 'registros', 'diario.md'), `- ${time()} · passo ${++n}\n`);
      git('add', 'registros'); git('commit', '--quiet', '-m', `Registra o passo ${n} do Aurora`);
      const commits = Number(git('rev-list', '--count', 'HEAD'));
      clear(); console.log(c(gold, 'GIT · HISTÓRICO DO AURORA') + c(dim, `   ${commits} commits`) + '\n');
      console.log(git('log', '--graph', '--oneline', '--decorate=short', '-9', '--color=always'));
      status({ commits, recent: git('log', '-8', '--format=%h|%s|%cr').split('\n').map(line => line.split('|')) });
    });
  },
  // Servidor HTTP local de verdade, com requisições periódicas a ele mesmo.
  server() {
    const page = existsSync(join(cwd, 'index.html')) ? readFileSync(join(cwd, 'index.html')) : Buffer.from('<h1>Aurora</h1>');
    const log = [], latency = [];
    let total = 0;
    const server = createServer((req, res) => { total++; res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page); log.push(`${c(dim, time())}  ${c(green, '200')}  ${req.method} ${req.url}  ${page.length} B`); });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port, paths = ['/', '/tarefas', '/progresso', '/', '/sobre'];
      let i = 0;
      every(900, () => {
        const started = performance.now(), path = paths[i++ % paths.length];
        get(`http://127.0.0.1:${port}${path}`, r => { r.resume(); r.on('end', () => { latency.push(performance.now() - started); status({ total, latency: latency.slice(-40), last: path }); }); });
      });
      every(900, () => { clear(); console.log(c(blue, 'SERVIDOR LOCAL') + c(dim, `   http://127.0.0.1:${port}`) + '\n'); console.log(log.slice(-11).join('\n')); });
    });
  },
  // Confere a página real: sintaxe do script, campos, acessibilidade básica.
  checks() {
    let round = 0;
    every(2600, () => {
      const html = existsSync(join(cwd, 'index.html')) ? readFileSync(join(cwd, 'index.html'), 'utf8') : '';
      const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
      const file = join(os.tmpdir(), 'aurora-check.cjs');
      writeFileSync(file, script);
      let syntax = true; try { execFileSync(process.execPath, ['--check', file]); } catch { syntax = false; }
      const checks = [['Sintaxe do JavaScript', syntax], ['Campo de nova tarefa', /id="task-input"/.test(html)], ['Lista com rótulo acessível', /aria-label="Lista de tarefas"/.test(html)], ['Filtros de tarefas', (html.match(/<button class="filter"/g) || []).length === 3], ['Tema escuro', /--panel/.test(html)], ['Sem dependências externas', !/<script src=/.test(html)]];
      clear(); console.log(c(green, 'VERIFICAÇÃO CONTÍNUA') + c(dim, `   rodada ${++round}`) + '\n');
      for (const [label, ok] of checks) console.log((ok ? c(green, '  ✓ ') : c(pink, '  ✗ ')) + label);
      console.log('\n' + c(dim, `  ${checks.filter(x => x[1]).length}/${checks.length} aprovadas · ${time()}`));
      status({ round, checks: checks.map(([label, ok]) => ({ label, ok })) });
    });
  },
  // Observa a pasta do projeto e lista as mudanças reais.
  files() {
    const events = [];
    watch(cwd, { recursive: true }, (type, name) => { if (name && !/^\.(git|status)/.test(name)) events.push({ at: time(), type, name }); });
    every(1000, () => {
      clear(); console.log(c(blue, 'OBSERVADOR DE ARQUIVOS') + c(dim, '   Aurora/') + '\n');
      console.log(events.slice(-11).map(e => `${c(dim, e.at)}  ${c(e.type === 'rename' ? gold : blue, e.type.padEnd(7))} ${e.name}`).join('\n') || c(dim, '  aguardando mudanças…'));
      status({ total: events.length, recent: events.slice(-8) });
    });
  },
  // Uso real de CPU e memória deste computador.
  system() {
    let last = os.cpus().map(x => x.times);
    const cpu = [], mem = [];
    every(1000, () => {
      const now = os.cpus().map(x => x.times);
      const usage = now.map((t, i) => { const a = last[i], idle = t.idle - a.idle, total = Object.keys(t).reduce((s, k) => s + t[k] - a[k], 0); return total ? 1 - idle / total : 0; });
      last = now;
      const used = 1 - os.freemem() / os.totalmem();
      cpu.push(usage.reduce((a, b) => a + b, 0) / usage.length); mem.push(used);
      clear(); console.log(c(gold, 'MONITOR DO SISTEMA') + c(dim, `   ${usage.length} núcleos`) + '\n');
      usage.slice(0, 8).forEach((u, i) => console.log(c(dim, `  cpu${String(i).padEnd(2)}`) + c(blue, bar(u)) + c(dim, ` ${String(Math.round(u * 100)).padStart(3)}%`)));
      console.log('\n' + c(dim, '  mem  ') + c(green, bar(used)) + c(dim, ` ${Math.round(used * 100)}%`));
      status({ cpu: cpu.slice(-60), mem: mem.slice(-60), cores: usage.length });
    });
  },
  // Compacta os arquivos do projeto e mostra o ganho real.
  bundle() {
    let build = 0;
    every(3000, () => {
      const files = readdirSync(cwd).filter(f => statSync(join(cwd, f)).isFile());
      clear(); console.log(c(pink, 'EMPACOTAMENTO') + c(dim, `   build #${++build}`) + '\n');
      let before = 0, after = 0;
      for (const f of files) { const data = readFileSync(join(cwd, f)); const z = gzipSync(data).length; before += data.length; after += z; console.log(`  ${f.padEnd(18)} ${String(data.length).padStart(7)} B → ${c(green, String(z).padStart(6) + ' B')}`); }
      console.log('\n' + c(dim, `  total ${before} B → ${after} B · ${Math.round((1 - after / before) * 100)}% menor`));
      status({ build, before, after, files: files.length });
    });
  },
};
(roles[role] || roles.checks)();
