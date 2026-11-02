// Usage: node render.js a|b [preview t1,t2,...]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const style = process.argv[2];
const previewTimes = process.argv[3] === 'preview' ? process.argv[4].split(',').map(Number) : null;
const SRC = __dirname, OUT = path.resolve(SRC, '..');
const fdir = p => path.join(SRC, 'node_modules/@fontsource', p);
const FONTS = style === 'a'
  ? [{ family: 'Hand', weight: '400', file: fdir('patrick-hand/files/patrick-hand-latin-400-normal.woff2') }]
  : ['400', '600', '800'].map(w => ({ family: 'Outfit', weight: w, file: fdir(`outfit/files/outfit-latin-${w}-normal.woff2`) }));
const fonts = FONTS.map(f => ({ family: f.family, weight: f.weight, url: 'data:font/woff2;base64,' + fs.readFileSync(f.file).toString('base64') }));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style></head>
<body><canvas id="c" width="1080" height="1920"></canvas>
<script>window.FONTS=${JSON.stringify(fonts)};</script>
<script>${fs.readFileSync(path.join(SRC, 'common.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(SRC, `style-${style}.js`), 'utf8')}</script></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.setContent(html);
  await page.evaluate(async () => {
    for (const f of FONTS) { const ff = new FontFace(f.family, `url(${f.url})`, { weight: f.weight }); await ff.load(); document.fonts.add(ff); }
    await document.fonts.ready; if (window.init) await window.init();
  });
  const frame = async t => {
    const url = await page.evaluate(t => { render(t); return document.getElementById('c').toDataURL('image/png'); }, t);
    return Buffer.from(url.split(',')[1], 'base64');
  };
  if (previewTimes) {
    const dir = path.join(SRC, 'preview'); fs.mkdirSync(dir, { recursive: true });
    for (const t of previewTimes) fs.writeFileSync(path.join(dir, `${style}-${t.toFixed(2)}.png`), await frame(t));
    await browser.close(); return;
  }
  const outName = style === 'a' ? 'stil-a-skizze.mp4' : 'stil-b-flach.mp4';
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', path.join(OUT, outName)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(11 * 30);
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const buf = await frame(f / 30);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f === Math.round(6.6 * 30)) fs.writeFileSync(path.join(OUT, `stil-${style}.png`), buf);
    if ([1.6, 4.2, 6.6, 7.8, 10.2].some(x => Math.round(x * 30) === f)) { fs.mkdirSync(path.join(SRC, 'sheet'), { recursive: true }); fs.writeFileSync(path.join(SRC, 'sheet', `${style}-${f}.png`), buf); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log(style, 'done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await browser.close();
})();
