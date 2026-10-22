const assert = require('node:assert/strict');

// Percorre o menu do Zênite real e verifica a migração, a classificação e a cor principal.
module.exports = async ({ win, js, delay, screenshot }) => {
  const selector = label => JSON.stringify(`[aria-label="${label}"]`);
  const tab = async (label) => { await js(`[...document.querySelectorAll('.settings-tabs button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`); await delay(60); };
  const open = async () => { await js("document.querySelector('button[title=\"Configurações\"]').click()"); await delay(80); };
  const close = async () => { await js("document.querySelector('.settings-head button').click()"); await delay(50); };
  const has = label => js(`!!document.querySelector(${selector(label)})`);
  const input = async (label, value, type = 'input') => {
    await js(`(()=>{const e=document.querySelector(${selector(label)});e.scrollIntoView({block:'center'});Object.getOwnPropertyDescriptor(${label === 'Tema do aplicativo' ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true}));})()`);
    await delay(60);
  };
  const hex = async value => { await input('Cor principal em hexadecimal', value); await js("document.querySelector('[aria-label=\"Cor principal em hexadecimal\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))"); await delay(60); };
  const accent = () => js("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase()");
  const before = await js("({canvas:localStorage.getItem('o.canvas'),terminal:localStorage.getItem('o.terminal')})");
  await js("localStorage.setItem('o.settingsTab',JSON.stringify('tela'))");
  await open();
  assert.deepEqual(await js("[...document.querySelectorAll('.settings-tabs button')].map(b=>b.textContent.trim())"), ['Geral','Personalização','Canvas','Terminal','Agentes','Notificações','Atalhos','Dados','Sobre']);
  assert.equal(await js("document.querySelector('.settings-tabs .on').textContent.trim()"), 'Personalização', 'antiga aba Tela migra para Personalização');
  for (const label of ['Tema do aplicativo','Cor principal','Tamanho da interface','Estilo das linhas','Animação da ligação','Fonte','Tamanho da fonte','Cores','Cursor','Cor da nota nova']) assert.ok(await has(label), label + ': em Personalização');
  for (const label of ['Ferramenta ao abrir','Shell','Linhas guardadas','Permissões dos agentes']) assert.equal(await has(label), false, label + ': não é cosmético');
  assert.deepEqual(await js("({canvas:localStorage.getItem('o.canvas'),terminal:localStorage.getItem('o.terminal')})"), before, 'reclassificação preserva as preferências');
  await screenshot('personalizacao-interface');
  await js("[...document.querySelectorAll('.personalization-shortcuts button')].find(b=>b.textContent==='Terminais').click()");
  assert.ok(await js("(()=>{const a=document.querySelector('[aria-label=\"Fonte\"]').getBoundingClientRect(),p=document.querySelector('.settings-page').getBoundingClientRect();return a.top>=p.top && a.bottom<=p.bottom})()"), 'atalho local encontra a fonte');
  await tab('Geral');
  assert.ok(await has('Ao clicar num link')); assert.ok(await has('Pedir confirmação para fechar'));
  assert.equal(await has('Tamanho da interface'), false);
  await tab('Canvas');
  assert.ok(await has('Ferramenta ao abrir')); assert.ok(await has('Tamanho da tela dos cartões'));
  assert.equal(await has('Estilo das linhas'), false);
  await tab('Terminal');
  assert.ok(await has('Shell')); assert.ok(await has('Linhas guardadas'));
  assert.equal(await has('Fonte'), false);
  assert.match(await js("document.querySelector('.settings-page').textContent"), /Personalização/, 'orienta quem procura a fonte na aba antiga');
  await tab('Personalização');
  await js("document.querySelector('[aria-label=\"Cor personalizada\"]').click()"); await delay(60);
  assert.ok(await has('Escolher cor principal no espectro'));
  await hex('#12ab34'); assert.equal(await accent(), '#12ab34');
  await hex('#12345g'); assert.equal(await accent(), '#12ab34', 'valor inválido não substitui a cor válida');
  assert.equal(await js("document.querySelector('[aria-label=\"Cor principal em hexadecimal\"]').getAttribute('aria-invalid')"), 'true');
  await hex('#abc'); assert.equal(await accent(), '#aabbcc');
  await hex('4455ff'); assert.equal(await accent(), '#4455ff');
  await input('Escolher cor principal no espectro', '#ff8800');
  await js("document.querySelector('[aria-label=\"Escolher cor principal no espectro\"]').dispatchEvent(new Event('change',{bubbles:true}))"); await delay(60);
  assert.equal(await accent(), '#ff8800');
  assert.equal(await js("document.querySelector('[aria-label=\"Cor principal em hexadecimal\"]').value"), '#ff8800', 'espectro e hexadecimal sincronizados');
  await js("document.querySelector('.accent-swatches [aria-label=\"Azul\"]').click()"); await delay(60);
  assert.equal(await js('document.documentElement.dataset.accent'), 'blue');
  assert.equal(await js("document.documentElement.style.getPropertyValue('--custom-accent')"), '', 'cor pronta não herda valores da personalizada');
  await js("document.querySelector('[aria-label=\"Cor personalizada\"]').click()"); await delay(60);
  assert.equal(await accent(), '#ff8800', 'lembra a última cor personalizada');
  for (const theme of ['light','dark']) {
    await input('Tema do aplicativo', theme, 'change');
    assert.equal(await js('document.documentElement.dataset.theme'), theme);
    assert.equal(await accent(), '#ff8800', 'cor exata preservada nos dois temas');
  }
  await hex('#ffffff'); assert.equal(await js("getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim()"), '#000000');
  await hex('#000000'); assert.equal(await js("getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim()"), '#ffffff');
  await hex('#e36d37');
  await screenshot('personalizacao-cor-personalizada');
  await close();
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  for (let i=0;i<100;i++) { if(await js("document.querySelectorAll('.summary-node').length===7")) break; await delay(80); }
  await open();
  assert.equal(await js("document.querySelector('.settings-tabs .on').textContent.trim()"), 'Personalização');
  assert.equal(await accent(), '#e36d37', 'cor salva após recarregar o app');
  assert.equal(await js("document.querySelector('[aria-label=\"Cor principal em hexadecimal\"]').value"), '#e36d37');
  await close();
  console.log('OK: menu reclassificado, migração, atalhos locais e cor personalizada por espectro/hex, com contraste e persistência');
};
