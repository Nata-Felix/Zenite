// Tomadas do comercial curto no canvas gigante, em alta resolução (ZENITE_FILM_SCALE).
// Plano geral com a interface e closes em modo Zen, cada um gravado ao vivo enquanto
// os terminais trabalham. A câmera fina (aproximar, deslizar) é feita na edição.
module.exports = async ({ win, api }) => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const js = code => win.webContents.executeJavaScript(code, true);
  const command = name => js(`window.dispatchEvent(new CustomEvent('zenite:command',{detail:${JSON.stringify(name)}}))`);
  const endpoint = async path => { const r = await fetch(api() + path).then(r => r.json()); if (r.error) throw Error(r.error); return r; };
  const paint = setInterval(() => win.webContents.invalidate(), 40);
  const mouse = async (x, y, modifiers = 0) => {
    win.webContents.debugger.attach('1.3');
    try { for (const type of ['mousePressed', 'mouseReleased']) await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, modifiers }); }
    finally { win.webContents.debugger.detach(); }
  };
  // Enquadra um elemento pelo "enquadrar seleção" do app e tira a seleção da imagem.
  const frame = async id => {
    await command('fit-view'); await delay(900);
    const p = await js(`(()=>{const r=document.querySelector('[data-id="${id}"]').getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+4}})()`);
    await mouse(p.x, p.y);
    await command('fit-selection'); await delay(900);
    const pane = await js("(()=>{const r=document.querySelector('.react-flow').getBoundingClientRect();return{x:r.x+8,y:r.bottom-8}})()");
    await mouse(pane.x, pane.y);
    await delay(5500); // sites e terminais redesenham na escala nova
  };
  const take = async (name, ms) => { await endpoint('/start?name=' + name); await delay(ms); console.log('TAKE ' + JSON.stringify(await endpoint('/stop'))); };
  try {
    await delay(14000); // terminais sobem, git commita, servidor responde
    await command('fit-view'); await delay(2500);
    await take('spot-wide-ui', 9000);
    await command('toggle-zen'); await delay(4200); // a dica do Zen some em 3,5 s
    await command('fit-view'); await delay(2500);
    await take('spot-wide', 9000);
    for (const [name, id, ms] of [['spot-admin', 'g-admin', 9000], ['spot-infra', 'g-infra', 6000], ['spot-git', 'g-git', 6000], ['spot-system', 'g-system', 5000], ['spot-server', 'g-server', 5000], ['spot-checks', 'g-checks', 5000], ['spot-flow', 'g-decide', 4000], ['spot-sprint', 'g-sprint', 4000]]) {
      await frame(id); await take(name, ms);
    }
  } finally { clearInterval(paint); }
  await fetch(api() + '/quit');
};
