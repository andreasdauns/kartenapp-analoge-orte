// Automatischer Klick-Test der App in Chrome, Safari-Technik (WebKit) und Firefox.
// Startet einen kleinen Webserver auf dem Projektordner, öffnet die App an mehreren Orten,
// tippt jede Kategorie an, öffnet Ortsdetails und sucht nach typischen Fehlern
// (doppelte Angaben, „undefined“, JavaScript-Fehler, aufgeklappte Quellenbox, verschiebbare Hinweis-Karte).
// Aufruf: node scripts/ui-check.mjs            (STRICT=1: leere Kategorien gelten als Fehler)
import http from 'node:http';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium, webkit, firefox } = createRequire(import.meta.url)('playwright');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STRICT = !!process.env.STRICT;
const PLACES = (process.env.PLACES || 'Bad Neuenahr:50.5446:7.1136,Berlin-Mitte:52.5200:13.4050,München:48.1374:11.5755')
  .split(',').map((s) => { const [name, lat, lon] = s.split(':'); return { name, lat: +lat, lon: +lon }; });
const BROWSERS = (process.env.BROWSERS || 'chromium,webkit,firefox').split(',');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.pbf': 'application/x-protobuf' };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) throw new Error('nope');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`; // localhost gilt als sicherer Ursprung (Standort erlaubt)

const problems = [];
const notes = [];
const bad = (ctx, msg) => problems.push(`[${ctx}] ${msg}`);
const BLANK_STYLE = JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8ece9' } }] });
const NAME_KEYS = ['Betreiber', 'Marke', 'Bank', 'Geschäft', 'Anbieter'];

async function run(kind, mobile) {
  const engine = { chromium, webkit, firefox }[kind];
  // Firefox hat ohne Grafikkarte (Testserver) WebGL standardmäßig aus → für den Test per Software erzwingen
  // Firefox: WebGL per Software; Standort über Firefox' eigenen Test-Standortdienst (Playwright-Emulation greift dort nicht zuverlässig).
  // Firefox wird deshalb je Ort neu gestartet und nur in einer Stadt geprüft (spart Zeit).
  const ffLaunch = (place) => engine.launch({ headless: !process.env.HEADED_FIREFOX, firefoxUserPrefs: {
    'webgl.force-enabled': true, 'webgl.disabled': false, 'webgl.enable-webgl2': true, 'layers.acceleration.force-enabled': true,
    'geo.prompt.testing': true, 'geo.prompt.testing.allow': true, 'geo.enabled': true,
    'geo.provider.network.url': `data:application/json,{"location":{"lat":${place.lat},"lng":${place.lon}},"accuracy":20}`,
  } });
  let browser = kind === 'firefox' ? null : await engine.launch();
  const label = `${kind}${mobile ? ' Handy' : ' PC'}`;
  for (const place of kind === 'firefox' ? PLACES.slice(1, 2) : PLACES) {
    if (kind === 'firefox') { if (browser) await browser.close(); browser = await ffLaunch(place); }
    const ctx = `${label} · ${place.name}`;
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 860 },
      ...(mobile && kind !== 'firefox' ? { isMobile: true, hasTouch: true } : {}),
      ...(kind === 'firefox' ? {} : { geolocation: { latitude: place.lat, longitude: place.lon }, permissions: kind === 'webkit' ? [] : ['geolocation'] }),
      locale: 'de-DE',
    });
    if (kind === 'webkit') await context.grantPermissions(['geolocation']).catch(() => {});
    // Hintergrundkarte durch eine leere ersetzen (wir testen die App, nicht den Kartendienst); Datenbank-Abrufe leer beantworten
    await context.route(/openfreemap\.org/, (r) => (r.request().url().includes('/styles/') ? r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }) : r.abort()));
    await context.route(/supabase\.co/, (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
    const page = await context.newPage();
    let noGL = false;
    page.on('pageerror', (e) => { if (/initialize WebGL|webglcontextcreationerror/.test(e.message)) noGL = true; else bad(ctx, `JavaScript-Fehler: ${e.message}`); });
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('welcomed', '1'); localStorage.setItem('supportHidden', '1'); } catch { /* */ } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Start: Quellenbox darf nie aufgeklappt erscheinen, Kurzangabe muss sichtbar sein
    for (let i = 0; i < 12; i++) {
      const s = await page.evaluate(() => { const a = document.querySelector('.maplibregl-ctrl-attrib'); return a ? (a.hasAttribute('open') || a.classList.contains('maplibregl-compact-show')) : null; });
      if (s === true) { bad(ctx, 'Quellenbox beim Start aufgeklappt'); break; }
      await page.waitForTimeout(150);
    }
    if (noGL) { notes.push(`[${ctx}] WebGL auf dem Testserver nicht verfügbar – übersprungen (Umgebung, kein App-Fehler)`); await context.close(); continue; }
    if (!(await page.locator('.mini-attrib').isVisible().catch(() => false))) bad(ctx, 'Kurzangabe „© OpenStreetMap · Impressum“ fehlt');

    // Hinweis-Karte darf sich auf dem Handy nicht hochziehen lassen
    if (mobile) {
      const h0 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sheet-h'));
      const box = await page.locator('#sheet').boundingBox();
      if (box) {
        await page.mouse.move(box.x + 100, box.y + 12); await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y - 300, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(400);
        const h1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sheet-h'));
        if (await page.locator('#sheet.static').count() && h0 !== h1) bad(ctx, `Hinweis-Karte ließ sich verschieben (${h0} → ${h1})`);
      }
    }

    // Standort verwenden
    const locBtn = page.locator('#use-loc');
    if (await locBtn.count()) await locBtn.click();
    else await page.locator('#btn-locate').click();
    await page.waitForTimeout(2500);

    const chips = await page.$$eval('#chips .chip[data-id]', (a) => a.map((b) => ({ id: b.dataset.id, text: [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() })));
    for (const chip of chips) {
      // genau diese Kategorie aktiv
      await page.locator(`#chips .chip[data-id="${chip.id}"]`).click();
      if (chip.id === 'container') {
        if (await page.locator('#containers').isHidden()) bad(ctx, 'Container-Unterzeile erscheint nicht');
        const sub = await page.$$eval('#containers .chip', (a) => a.map((b) => b.textContent.trim()));
        if (sub.join(',') !== 'Glas,Papier,Altkleider') bad(ctx, `Container-Unterzeile falsch: ${sub.join(', ')}`);
      }
      await page.waitForTimeout(1800);
      const rows = await page.locator('#sheet-body .row').count();
      // In großen Städten muss es diese Kategorien immer geben; Rastplätze/Wertstoffhöfe liegen oft außerhalb
      const expected = STRICT && !['rastplatz', 'wertstoffhof'].includes(chip.id);
      if (!rows) {
        const sheetTxt = (await page.locator('#sheet-body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90);
        (expected ? bad : (c, m) => notes.push(`[${c}] ${m}`))(ctx, `Keine Einträge für „${chip.text}“ (Anzeige: ${sheetTxt})`);
      }
      const listText = await page.locator('#sheet-body').innerText().catch(() => '');
      if (/undefined|null|NaN|\[object/.test(listText)) bad(ctx, `Liste „${chip.text}“ enthält undefined/null/NaN`);
      for (let i = 0; i < Math.min(rows, 3); i++) {
        await page.locator('#sheet-body .row').nth(i).click();
        await page.waitForSelector('.detail', { timeout: 4000 }).catch(() => bad(ctx, `Detail ${chip.text} #${i + 1} öffnet nicht`));
        const d = await page.evaluate(() => {
          const el = document.querySelector('.detail');
          if (!el) return null;
          const dts = [...el.querySelectorAll('dl.facts dt')].map((x) => x.textContent.trim());
          const dds = [...el.querySelectorAll('dl.facts dd')].map((x) => x.textContent.trim());
          return { title: el.querySelector('h2')?.textContent.trim(), dts, dds, text: el.innerText };
        });
        if (d) {
          const where = `${chip.text} „${d.title}“`;
          if (!d.title) bad(ctx, `${chip.text}: Detail ohne Titel`);
          const dupKeys = d.dts.filter((k, j) => d.dts.indexOf(k) !== j);
          if (dupKeys.length) bad(ctx, `${where}: Angabe doppelt: ${[...new Set(dupKeys)].join(', ')}`);
          const names = d.dts.map((k, j) => [k, d.dds[j]]).filter(([k]) => NAME_KEYS.includes(k)).map(([, v]) => v.toLowerCase());
          if (new Set(names).size < names.length) bad(ctx, `${where}: gleicher Name mehrfach (${names.join(' / ')})`);
          if (/\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(d.text)) bad(ctx, `${where}: enthält undefined/null/NaN`);
          if (d.dds.some((v) => !v)) bad(ctx, `${where}: leere Angabe`);
        }
        await page.locator('#close').click().catch(() => {});
        await page.waitForTimeout(300);
      }
      await page.locator(`#chips .chip[data-id="${chip.id}"]`).click(); // wieder aus
      await page.waitForTimeout(200);
    }
    await context.close();
  }
  await browser.close();
}

// Android-App (Start mit ?src=twa): keine Ko-fi-Links sichtbar (Google-Play-Zahlungsrichtlinie)
async function twaCheck() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/openfreemap\.org/, (r) => r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }));
  await context.route(/supabase\.co/, (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
  const page = await context.newPage();
  await page.goto(BASE + '?src=twa&unterstuetzen=1');
  await page.waitForTimeout(1500);
  if (await page.locator('a[href*="ko-fi"]:visible').count()) bad('Android-App', 'Ko-fi-Link in der App sichtbar');
  await page.goto(BASE + 'info.html#unterstuetzen');
  await page.waitForTimeout(800);
  if (await page.locator('a[href*="ko-fi"]:visible').count()) bad('Android-App', 'Ko-fi-Link auf der Info-Seite sichtbar');
  // Gegenprobe Website: dort bleibt der Link
  const web = await browser.newContext();
  const p2 = await web.newPage();
  await p2.goto(BASE + 'info.html#unterstuetzen');
  if (!(await p2.locator('a[href*="ko-fi"]:visible').count())) bad('Website', 'Ko-fi-Link auf der Info-Seite fehlt');
  await browser.close();
}
await twaCheck();

for (const kind of BROWSERS) {
  await run(kind, true);
  if (kind === 'chromium') await run(kind, false);
}
server.close();

const unique = [...new Set(problems)];
const md = `## Klick-Test: ${unique.length ? '❌ Probleme gefunden' : '✅ in Ordnung'}\n\nBrowser: ${BROWSERS.join(', ')} · Orte: ${PLACES.map((p) => p.name).join(', ')}\n\n${unique.slice(0, 40).map((p) => `- ❌ ${p}`).join('\n')}\n${notes.slice(0, 20).map((n) => `- ℹ️ ${n}`).join('\n')}\n`;
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
await writeFile(new URL('../data/ui-check.json', import.meta.url), JSON.stringify({ checked: new Date().toISOString(), ok: !unique.length, problems: unique, notes }, null, 1));
if (unique.length) process.exit(1);
