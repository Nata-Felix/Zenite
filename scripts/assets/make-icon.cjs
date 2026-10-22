// Uso: node scripts/assets/make-icon.cjs build <pasta-da-folha-de-revisão>  (precisa do Playwright)
// Gera PNGs do ícone (SVG grande para >= 48px, versão simplificada para os pequenos) e o .ico.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const [BUILD, OUT] = [process.argv[2], process.argv[3]];
const big = fs.readFileSync(BUILD + '/icon.svg', 'utf8');
const small = fs.readFileSync(BUILD + '/icon-small.svg', 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' + '' }).catch(() => chromium.launch());
  const page = await browser.newPage();
  const render = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) pngs.push([s, await render(s <= 32 ? small : big, s)]);
  fs.writeFileSync(BUILD + '/icon.png', await render(big, 512));
  // ICO com PNGs dentro (aceito pelo Windows desde o Vista).
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length); let offset = 6 + dir.length;
  pngs.forEach(([s, buf], i) => {
    const o = i * 16; dir[o] = s >= 256 ? 0 : s; dir[o + 1] = s >= 256 ? 0 : s; dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12); offset += buf.length;
  });
  fs.writeFileSync(BUILD + '/icon.ico', Buffer.concat([header, dir, ...pngs.map((p) => p[1])]));
  // Folha de revisão: tamanhos reais sobre fundo claro e escuro, e ampliado.
  const imgs = pngs.map(([s, b]) => `<figure><img src="data:image/png;base64,${b.toString('base64')}" width="${s}" height="${s}"><figcaption>${s}</figcaption></figure>`).join('');
  const zoom = (s) => `<img src="data:image/png;base64,${pngs.find((p) => p[0] === s)[1].toString('base64')}" width="128" height="128" style="image-rendering:pixelated">`;
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.setContent(`<html><body style="margin:0;font:12px sans-serif">
    <div style="display:flex;gap:18px;align-items:flex-end;padding:24px;background:#f3f4f7">${imgs}</div>
    <div style="display:flex;gap:18px;align-items:flex-end;padding:24px;background:#16171c;color:#aaa">${imgs}</div>
    <div style="display:flex;gap:24px;padding:24px;background:#2b2d33;color:#ddd;align-items:center">
      <img src="data:image/png;base64,${pngs.find((p) => p[0] === 256)[1].toString('base64')}" width="200">
      ${zoom(16)} ${zoom(24)} ${zoom(32)} <span>16 · 24 · 32 ampliados</span></div>
    <style>figure{margin:0;text-align:center}figcaption{margin-top:4px}</style></body></html>`);
  await page.screenshot({ path: OUT + '/icone-revisao.png', fullPage: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
