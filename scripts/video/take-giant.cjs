// Canvas gigante: espera os terminais trabalharem, fotografa o todo e cada área de perto,
// e grava o canvas inteiro ao vivo. Os movimentos de câmera do comercial vêm na edição.
module.exports = async ({ win, api }) => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const js = code => win.webContents.executeJavaScript(code, true);
  const command = name => js(`window.dispatchEvent(new CustomEvent('zenite:command',{detail:${JSON.stringify(name)}}))`);
  const endpoint = async path => { const r = await fetch(api() + path).then(r => r.json()); if (r.error) throw Error(r.error); return r; };
  const paint = setInterval(() => win.webContents.invalidate(), 40);
  // Enquadra elementos com o "enquadrar seleção" do app: seleciona pelo clique no cabeçalho.
  const frame = async ids => {
    await command('fit-view'); await delay(800);
    win.webContents.debugger.attach('1.3');
    try {
      for (const [i, id] of ids.entries()) {
        const p = await js(`(()=>{const r=document.querySelector('[data-id="${id}"]').getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+4}})()`);
        const modifiers = i ? 2 : 0; // Ctrl soma à seleção
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1, modifiers });
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1, modifiers });
        await delay(200);
      }
    } finally { win.webContents.debugger.detach(); }
    await command('fit-selection'); await delay(800);
    win.webContents.debugger.attach('1.3');
    // Clique num canto vazio do canvas tira a seleção (e a barra dela) da foto.
    try { for (const type of ['mousePressed', 'mouseReleased']) await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: 300, y: 880, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); } finally { win.webContents.debugger.detach(); }
    await delay(5000); // sites redesenham na escala nova
  };
  try {
    await delay(12000); // terminais sobem, git commita, servidor responde
    await command('fit-view'); await delay(1500);
    await endpoint('/shot?name=gigante-inteiro');
    await endpoint('/start?name=giant'); await delay(9000);
    console.log('GIANT TAKE ' + JSON.stringify(await endpoint('/stop')));
    for (const [name, ids] of Object.entries({ infra: ['g-infra'], git: ['g-git'], sistema: ['g-system'], sprint: ['g-sprint'], decisao: ['g-decide'], admin: ['g-admin'] })) {
      await frame(ids); if (name === 'admin') await delay(5000); await endpoint('/shot?name=gigante-' + name);
    }
  } finally { clearInterval(paint); }
  await fetch(api() + '/quit');
};
