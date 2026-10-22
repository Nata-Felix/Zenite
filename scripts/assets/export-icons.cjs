// Exporta os ícones importados pelo código atual, sem alterar os arquivos do aplicativo.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lucide = require('lucide-react');

const root = path.resolve(__dirname, '../..');
const output = path.resolve(root, process.argv[2] || 'out/pacote-icones-zenite');
if (!output.startsWith(root + path.sep)) throw Error('O pacote precisa ficar dentro da pasta do projeto.');
if (fs.existsSync(output)) throw Error('A pasta de destino já existe. Escolha outra pasta para não sobrescrever o pacote.');
fs.mkdirSync(output, { recursive: true });
const usage = new Map();
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx?$/.test(file)) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'lucide-react') continue;
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const bindings = clause.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) throw Error('Importação dinâmica de Lucide: revise ' + file);
        for (const item of bindings.elements) {
          if (item.isTypeOnly) continue;
          const name = (item.propertyName || item.name).text;
          if (!lucide[name]) throw Error('Ícone não encontrado: ' + name);
          if (!usage.has(name)) usage.set(name, []);
          usage.get(name).push({ file: path.relative(root, file).split(path.sep).join('/'), alias: item.name.text });
        }
      }
    }
  }
}
walk(path.join(root, 'src'));
const entries = [];
const write = (file, data) => { fs.mkdirSync(path.dirname(path.join(output, file)), { recursive: true }); fs.writeFileSync(path.join(output, file), data); };
for (const name of [...usage.keys()].sort()) {
  const file = `interface/${name}.svg`;
  const svg = renderToStaticMarkup(React.createElement(lucide[name], { size: 24, strokeWidth: 2 }));
  if (!svg.startsWith('<svg') || !svg.includes('viewBox="0 0 24 24"')) throw Error('SVG inválido: ' + name);
  write(file, svg + '\n');
  entries.push({ name, category: 'Interface', file, source: 'lucide-react', uses: usage.get(name) });
}
for (const name of fs.readdirSync(path.join(root, 'src/renderer/assets/brands')).filter(name => name.endsWith('.svg')).sort()) {
  const file = 'agentes/' + name;
  write(file, fs.readFileSync(path.join(root, 'src/renderer/assets/brands', name)));
  entries.push({ name: path.basename(name, '.svg'), category: 'Agentes', file, source: 'src/renderer/assets/brands/' + name });
}
for (const name of ['icon.svg', 'icon-small.svg', 'icon.png', 'icon.ico']) {
  const file = 'zenite/' + name;
  write(file, fs.readFileSync(path.join(root, 'build', name)));
  entries.push({ name: 'Zênite · ' + name, category: 'Zênite', file, source: 'build/' + name });
}
const version = require(path.join(root, 'package.json')).version;
const lucideVersion = require('lucide-react/package.json').version;
write('manifesto.json', JSON.stringify({ application: 'Zênite', version, lucideVersion, generatedAt: new Date().toISOString(), count: entries.length, icons: entries }, null, 2));
write('licencas/LUCIDE.txt', fs.readFileSync(path.join(root, 'node_modules/lucide-react/LICENSE')));
if (fs.existsSync(path.join(root, 'LICENSE'))) write('licencas/ZENITE.txt', fs.readFileSync(path.join(root, 'LICENSE')));
write('LEIA-ME.txt', `PACOTE DE ÍCONES DO ZÊNITE ${version}\n\n${usage.size} ícones de interface, 7 logos de agentes e 4 arquivos do aplicativo.\n\nAbra catalogo.html para visualizar, pesquisar e baixar cada arquivo.\ninterface/: SVG vetorial 24x24, traço 2, cor herdada (currentColor), igual ao componente Lucide.\nagentes/: SVG original das marcas usadas no aplicativo.\nzenite/: SVG, versão pequena, PNG e ICO originais do aplicativo.\nmanifesto.json: nomes dos ícones, aliases e arquivos do código que os importam.\nlicencas/: avisos da biblioteca Lucide e do projeto.\n\nO catálogo foi gerado a partir dos imports atuais, incluindo recursos locais ainda em desenvolvimento; isso não altera o aplicativo.\nNão inclui imagens particulares de canvases, favicons de sites ou ícones de programas instalados.\nOs logos de terceiros foram copiados dos assets do projeto. O código de BrandIcon.tsx identifica LobeHub Icons e o repositório PowerShell como origens. Marcas de terceiros permanecem de seus respectivos titulares; a licença do Zênite não transfere direitos sobre essas marcas.\n`);
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cards = entries.map(entry => {
  const vector = entry.file.endsWith('.svg');
  const preview = vector ? fs.readFileSync(path.join(output, entry.file), 'utf8').replace(/<\?xml[^>]*\?>/g, '') : `<img src="${entry.file}" alt="">`;
  return `<a class="icon-card" href="${entry.file}" download data-search="${escape((entry.name + ' ' + entry.category + ' ' + (entry.uses || []).map(u => u.alias).join(' ')).toLowerCase())}"><span class="preview">${preview}</span><strong>${escape(entry.name)}</strong><small>${entry.category}</small></a>`;
}).join('\n');
write('catalogo.html', `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ícones do Zênite</title><style>
:root{color-scheme:dark;--bg:#0c1017;--card:#151c28;--line:#2b3547;--text:#edf1fa;--muted:#b7c2d8}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px system-ui,sans-serif}body.light{color-scheme:light;--bg:#f3f5f9;--card:#fff;--line:#cbd3e0;--text:#1b2638;--muted:#526077}main{max-width:1250px;margin:auto;padding:48px 24px}h1{font-size:36px;margin:0 0 12px}p{color:var(--muted);line-height:1.6}.tools{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:28px 0}label{flex:1;min-width:220px;display:grid;gap:8px}input,button{padding:12px 16px;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--text);font:inherit}button{cursor:pointer}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #8f9fff;outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px}.icon-card{padding:18px 12px;background:var(--card);border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--text);display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;overflow-wrap:anywhere}.icon-card:hover{border-color:#8f9fff}.preview{width:72px;height:72px;display:flex;align-items:center;justify-content:center}.preview svg,.preview img{width:44px;height:44px;max-width:100%;object-fit:contain}.preview svg[viewBox="0 0 256 256"]{width:64px;height:64px}strong{font-size:12px}small{color:var(--muted);font-size:11px}[hidden]{display:none!important}.count{font-variant-numeric:tabular-nums}
</style><main><h1>Ícones do Zênite</h1><p>${entries.length} arquivos · interface, agentes e aplicativo · versão ${version}<br>Clique em um ícone para baixar o arquivo original. Os vetores podem ser redimensionados sem perder qualidade.</p><div class="tools"><label>Buscar pelo nome, alias ou categoria<input id="search" type="search" placeholder="Ex.: Plug, Skill, Interface, Agentes…"></label><button id="theme" type="button" aria-pressed="false">Fundo claro</button></div><p class="count" role="status" id="count">${entries.length} arquivos</p><div class="grid">${cards}</div></main><script>const cards=[...document.querySelectorAll('.icon-card')];document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();cards.forEach(c=>c.hidden=!c.dataset.search.includes(q));document.querySelector('#count').textContent=cards.filter(c=>!c.hidden).length+' arquivos'});document.querySelector('#theme').addEventListener('click',e=>{const light=document.body.classList.toggle('light');e.target.textContent=light?'Fundo escuro':'Fundo claro';e.target.setAttribute('aria-pressed',String(light))});</script></html>`);
console.log(JSON.stringify({ output, interfaceIcons: usage.size, brands: 7, appFiles: 4, total: entries.length }));
