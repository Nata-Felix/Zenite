// Refaz só o capítulo agent-result: o painel Aurora gerado pelos agentes, usado de verdade
// dentro do elemento de site. Digita, adiciona e conclui tarefas na página real.
// O guest do webview não repinta sozinho na janela inativa: cada passo força um quadro novo.
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { webContents } = require('electron');
module.exports = async ({ win, out, api }) => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const js = code => win.webContents.executeJavaScript(code, true);
  const endpoint = async path => { const r = await fetch(api() + path).then(r => r.json()); if (r.error) throw Error(r.error); return r; };
  await delay(1500);
  const state = await js("window.o.canvas.load('elements')");
  const site = state.nodes.find(n => n.id === 'site');
  Object.assign(site, { x: 30, y: 40, width: 1250, height: 650 });
  site.element.url = api() + '/produced';
  state.nodes = [site]; state.edges = []; state.viewport = { x: 35, y: 115, zoom: .95 };
  await js(`window.o.canvas.save('elements',${JSON.stringify(state)})`);
  await js("document.querySelectorAll('.workspace-item')[1].click()"); await delay(2500);
  const guest = webContents.fromId(await js("document.querySelector('webview').getWebContentsId()"));
  guest.setBackgroundThrottling(false);
  await guest.executeJavaScript("localStorage.clear(); location.reload()").catch(() => {}); await delay(1500);
  // Repinta guest e janela a cada 40 ms enquanto grava, para o compositor entregar o estado atual.
  const paint = setInterval(() => { if (!guest.isDestroyed()) guest.invalidate(); win.webContents.invalidate(); }, 40);
  const page = code => guest.executeJavaScript(code, true);
  const type = async text => {
    await page("document.querySelector('#task-input').focus()");
    for (let i = 1; i <= text.length; i++) { await page(`(()=>{const e=document.querySelector('#task-input');e.value=${JSON.stringify(text.slice(0, i))};e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await delay(55); }
    await delay(450);
    await page("document.querySelector('#task-form').requestSubmit()"); await delay(1300);
  };
  try {
    await endpoint('/start?name=agent-result'); await delay(2000);
    // Rola até o quadro de tarefas para a lista aparecer inteira no elemento.
    await page("document.querySelector('.board').scrollIntoView({behavior:'smooth',block:'start'})"); await delay(1800);
    await type('Revisar o briefing com o Sol');
    await type('Validar a entrega no Zênite');
    await type('Publicar o protótipo');
    await page("document.querySelector('#tasks input[type=checkbox]').click()"); await delay(1600);
    await page("document.querySelectorAll('#tasks input[type=checkbox]')[1].click()"); await delay(1800);
    await page("document.querySelector('.filter[data-filter=done]').click()"); await delay(1600);
    await page("document.querySelector('.filter[data-filter=all]').click()"); await delay(2200);
    await endpoint('/shot?name=produto-criado-codex');
    const result = await page("({count:document.querySelector('#count').textContent,percent:document.querySelector('#percent').textContent,tasks:[...document.querySelectorAll('#tasks li')].map(li=>({text:li.innerText.trim(),done:li.classList.contains('done')}))})");
    console.log('RESULT TAKE ' + JSON.stringify(await endpoint('/stop')));
    writeFileSync(join(out, 'result-evidence.json'), JSON.stringify(result, null, 2));
  } finally { clearInterval(paint); }
  console.log('RESULT TAKE DONE');
  await fetch(api() + '/quit');
};
