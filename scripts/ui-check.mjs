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
        const sub = await page.$$eval('#containers .chip', (a) => a.map((b) => [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
        if (sub.join(',') !== 'Glas,Papier,Altkleider,Sammelstellen,Wertstoffhöfe') bad(ctx, `Container-Unterzeile falsch: ${sub.join(', ')}`);
        await groupCheck(page, ctx, chip, 'containers');
      }
      if (chip.id === 'parken') {
        if (await page.locator('#parkrow').isHidden()) bad(ctx, 'Parken-Unterzeile erscheint nicht');
        const sub = await page.$$eval('#parkrow .chip', (a) => a.map((b) => [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
        if (sub.join(',') !== 'Raststätten & Rastplätze,Park & Ride,Wanderparkplätze') bad(ctx, `Parken-Unterzeile falsch: ${sub.join(', ')}`);
        await groupCheck(page, ctx, chip, 'parkrow');
      }
      await page.waitForTimeout(1800);
      if (chip.id === 'geldautomat') {
        if (await page.locator('#atmrow').isHidden()) bad(ctx, 'Geldautomaten-Filterzeile erscheint nicht');
        else {
          await page.locator('#atmrow .chip[data-atm="spk"]').click();
          await page.waitForTimeout(1500);
          const names = await page.$$eval('#sheet-body .row .sub', (a) => a.slice(0, 6).map((x) => x.textContent));
          const off = names.filter((t) => !/sparkasse|bw[- ]?bank|baden-württ/i.test(t));
          if (off.length) bad(ctx, `Filter „Sparkasse“ zeigt andere Automaten: ${off.slice(0, 2).join(' | ')}`);
          await page.locator('#atmrow .chip[data-atm="spk"]').click();
          await page.waitForTimeout(800);
        }
      }
      if (chip.id === 'toilette') {
        if (await page.locator('#wcrow').isHidden()) bad(ctx, 'Toiletten-Filterzeile erscheint nicht');
        else {
          const all = await page.locator('#sheet-body .row').count();
          for (const f of ['free', 'wc', 'key', 'baby']) {
            await page.locator(`#wcrow .chip[data-wc="${f}"]`).click();
            await page.waitForTimeout(900);
            if ((await page.locator(`#wcrow .chip[data-wc="${f}"]`).getAttribute('aria-pressed')) !== 'true') bad(ctx, `Toiletten-Filter „${f}“ wird nicht gedrückt`);
            const wrong = await page.$$eval('#sheet-body .row', (a, x) => a.filter((r) => !(r.dataset.wf || '').split(' ').includes(x)).length, f);
            if (wrong) bad(ctx, `Toiletten-Filter „${f}“ zeigt ${wrong} Toiletten ohne dieses Merkmal`);
            await page.locator(`#wcrow .chip[data-wc="${f}"]`).click();
            await page.waitForTimeout(900);
            if ((await page.locator(`#wcrow .chip[data-wc="${f}"]`).getAttribute('aria-pressed')) !== 'false') bad(ctx, `Toiletten-Filter „${f}“ lässt sich nicht abwählen`);
          }
          const back = await page.locator('#sheet-body .row').count();
          if (back !== all) bad(ctx, `Nach dem Abwählen der Toiletten-Filter ${back} statt ${all} Einträge`);
        }
      }
      if (chip.id === 'ladesaeule') {
        if (await page.locator('#evrow').isHidden()) bad(ctx, 'Ladesäulen-Filterzeile erscheint nicht');
        else {
          await page.locator('#evrow .chip[data-ev="kw150"]').click();
          await page.waitForTimeout(1500);
          const subs = await page.$$eval('#sheet-body .row .sub', (a) => a.slice(0, 6).map((x) => x.textContent));
          const low = subs.filter((t) => { const m = /(\d+(?:[.,]\d+)?) kW/.exec(t); return !m || parseFloat(m[1].replace(',', '.')) < 150; });
          if (low.length) bad(ctx, `Filter „ab 150 kW“ zeigt langsamere Säulen: ${low.slice(0, 2).join(' | ')}`);
          await page.locator('#evrow .chip[data-ev="kw150"]').click();
          await page.waitForTimeout(800);
        }
      }
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
          if (chip.id === 'wickeln' && !d.dts.includes('Hinweis')) bad(ctx, `${where}: Hinweis „ohne Gewähr“ fehlt`);
          if (chip.id === 'wickeln' && !d.dts.includes('Öffnungszeiten')) bad(ctx, `${where}: Öffnungszeiten-Zeile fehlt`);
        }
        await page.locator('#close').click().catch(() => {});
        await page.waitForTimeout(300);
      }
      await page.locator(`#chips .chip[data-id="${chip.id}"]`).click(); // wieder aus
      await page.waitForTimeout(400);
      // Ausgeschaltet heißt: nichts mehr davon auf der Karte und in der Liste
      const left = await activeCats(page);
      if (left.length) bad(ctx, `Nach dem Ausschalten von „${chip.text}“ noch sichtbar: ${left.join(', ')}`);
      if (await page.locator('#sheet-body .row').count()) bad(ctx, `Nach dem Ausschalten von „${chip.text}“ stehen noch Orte in der Liste`);
      if ((await page.locator(`#chips .chip[data-id="${chip.id}"]`).getAttribute('aria-pressed')) !== 'false') bad(ctx, `Knopf „${chip.text}“ bleibt nach dem Ausschalten gedrückt`);
    }
    await context.close();
  }
  await browser.close();
}

// Was gerade auf der Karte gefiltert ist (setzt die App bei jedem Filterwechsel)
const activeCats = async (page) => (await page.evaluate(() => document.documentElement.dataset.cats || '')).split(',').filter(Boolean);

// Unterzeile einer Gruppe (Abfall & Container, Parken): jeder Knopf blendet genau seine Orte ein und aus
async function groupCheck(page, ctx, chip, row) {
  const subs = await page.$$eval(`#${row} .chip[data-ct]`, (a) => a.map((b) => b.dataset.ct));
  const sub = (id) => page.locator(`#${row} .chip[data-ct="${id}"]`);
  const pressed = async (id) => (await sub(id).getAttribute('aria-pressed')) === 'true';
  let act = await activeCats(page);
  for (const id of subs) {
    if (!(await pressed(id))) bad(ctx, `${chip.text}: „${id}“ ist nach dem Einschalten nicht gedrückt`);
    if (!act.includes(id)) bad(ctx, `${chip.text}: „${id}“ ist nach dem Einschalten nicht sichtbar`);
  }
  for (const id of subs) {
    await sub(id).click();
    await page.waitForTimeout(700);
    act = await activeCats(page);
    if (act.includes(id)) bad(ctx, `${chip.text}: „${id}“ bleibt nach dem Abwählen sichtbar`);
    const lost = subs.filter((x) => x !== id && !act.includes(x));
    if (lost.length) bad(ctx, `${chip.text}: Abwählen von „${id}“ blendet auch ${lost.join(', ')} aus`);
    if (await pressed(id)) bad(ctx, `${chip.text}: „${id}“ bleibt nach dem Abwählen gedrückt`);
    if (await page.locator(`#sheet-body .row[data-c="${id}"]`).count()) bad(ctx, `${chip.text}: „${id}“ steht nach dem Abwählen noch in der Liste`);
    await sub(id).click();
    await page.waitForTimeout(700);
    act = await activeCats(page);
    if (!act.includes(id) || !(await pressed(id))) bad(ctx, `${chip.text}: „${id}“ lässt sich nicht wieder einblenden`);
    const lost2 = subs.filter((x) => !act.includes(x));
    if (lost2.length) bad(ctx, `${chip.text}: nach erneutem Anwählen von „${id}“ fehlen ${lost2.join(', ')}`);
  }
  // Nur eine Unterart: andere abwählen → nur diese in Liste und Karte
  const only = subs[1] || subs[0];
  for (const id of subs) if (id !== only) { await sub(id).click(); await page.waitForTimeout(300); }
  await page.waitForTimeout(800);
  act = await activeCats(page);
  if (act.join(',') !== only) bad(ctx, `${chip.text}: nur „${only}“ gewählt, sichtbar sind aber ${act.join(', ') || 'keine'}`);
  const wrong = await page.$$eval('#sheet-body .row', (a, o) => a.filter((r) => r.dataset.c !== o).length, only);
  if (wrong) bad(ctx, `${chip.text}: nur „${only}“ gewählt, Liste zeigt ${wrong} andere Orte`);
  // Letzte abwählen → Gruppe aus
  await sub(only).click();
  await page.waitForTimeout(600);
  if (await page.locator(`#${row}`).isVisible()) bad(ctx, `${chip.text}: Unterzeile bleibt nach Abwählen aller Knöpfe offen`);
  if ((await activeCats(page)).length) bad(ctx, `${chip.text}: nach Abwählen aller Knöpfe ist noch etwas sichtbar`);
  // Gruppe wieder an → alle an
  await page.locator(`#chips .chip[data-id="${chip.id}"]`).click();
  await page.waitForTimeout(1200);
  act = await activeCats(page);
  const miss = subs.filter((x) => !act.includes(x));
  if (miss.length) bad(ctx, `${chip.text}: nach erneutem Einschalten fehlen ${miss.join(', ')}`);
}

// Erledigungs-Runde: Rechenkern gegen Durchprobieren aller Möglichkeiten prüfen
async function roundUnitCheck() {
  const { planRound, googleRoundUrl, distM } = await import('../src/round.js');
  const ctx = 'Erledigungs-Runde (Rechnung)';
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start = { lat: 50.5446, lon: 7.1136 };
  const mk = (c, n) => Array.from({ length: n }, (_, i) => ({ id: `${c}${i}`, c, lat: start.lat + (rnd() - 0.5) * 0.03, lon: start.lon + (rnd() - 0.5) * 0.045, t: {} }));
  for (let run = 0; run < 25; run++) {
    const items = [...mk('briefkasten', 5), ...mk('geldautomat', 4), ...mk('glas', 4)];
    const back = run % 2 === 0;
    const p = planRound({ items, start, taskIds: ['brief', 'geld', 'glas'], mode: 'driving', back });
    // Vergleich: alle Kombinationen und Reihenfolgen
    const B = items.filter((i) => i.c === 'briefkasten'), G = items.filter((i) => i.c === 'geldautomat'), L = items.filter((i) => i.c === 'glas');
    let best = Infinity;
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const b of B) for (const g of G) for (const l of L) for (const o of orders) {
      const pts = [b, g, l]; let d = 0, prev = start;
      for (const i of o) { d += distM(prev, pts[i]); prev = pts[i]; }
      if (back) d += distM(prev, start);
      best = Math.min(best, d);
    }
    if (p.stops.length !== 3) { bad(ctx, `Lauf ${run}: ${p.stops.length} statt 3 Stopps`); continue; }
    if (Math.abs(p.totalM - best) > 1) bad(ctx, `Lauf ${run}: Runde ${Math.round(p.totalM)} m, beste mögliche ${Math.round(best)} m`);
    const cats = p.stops.map((s) => s.item.c).sort().join(',');
    if (cats !== 'briefkasten,geldautomat,glas') bad(ctx, `Lauf ${run}: falsche Stopps ${cats}`);
  }
  // Fehlende Kategorie, Umkreis, Filter
  const far = [{ id: 'x', c: 'glas', lat: start.lat + 0.2, lon: start.lon, t: {} }, { id: 'y', c: 'briefkasten', lat: start.lat + 0.001, lon: start.lon, t: {} }];
  const p2 = planRound({ items: far, start, taskIds: ['brief', 'glas'], mode: 'walking' });
  if (p2.stops.length !== 1 || p2.missing[0]?.id !== 'glas') bad(ctx, 'Ort außerhalb des Umkreises wurde nicht als „nicht gefunden“ gemeldet');
  const p3 = planRound({ items: far, start, taskIds: ['brief'], ok: () => false });
  if (p3.stops.length) bad(ctx, 'Filter (z. B. „geschlossen“) wird ignoriert');
  const p4 = planRound({ items: [], start, taskIds: ['brief', 'geld', 'glas', 'papier', 'kleider', 'wc'] });
  if (p4.missing.length > 4) bad(ctx, 'Mehr als 4 Erledigungen angenommen');
  const url = googleRoundUrl([{ item: { lat: 1, lon: 2 } }, { item: { lat: 3, lon: 4 } }, { item: { lat: 5, lon: 6 } }], 'walking');
  const u = new URL(url);
  if (u.searchParams.get('destination') !== '5,6' || u.searchParams.get('waypoints') !== '1,2|3,4' || u.searchParams.get('travelmode') !== 'walking' || u.searchParams.has('origin')) bad(ctx, `Google-Link falsch: ${url}`);
}
await roundUnitCheck();

// Erledigungs-Runde in der App: auswählen, planen, Liste, Karte, Google-Link, beenden – auf kleinem Handy mit großer Schrift
async function roundCheck() {
  const browser = await chromium.launch();
  for (const zoom of [1, 1.35]) {
    const ctx = `Erledigungs-Runde · Schrift ${Math.round(zoom * 100)} %`;
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, geolocation: { latitude: PLACES[0].lat, longitude: PLACES[0].lon }, permissions: ['geolocation'], locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    await context.route(/openfreemap\.org/, (r) => (r.request().url().includes('/styles/') ? r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }) : r.abort()));
    await context.route(/supabase\.co/, (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
    await context.addInitScript((z) => { try { localStorage.clear(); localStorage.setItem('welcomed', '1'); localStorage.setItem('supportHidden', '1'); } catch { /* */ } document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(z); }); }, zoom);
    const page = await context.newPage();
    page.on('pageerror', (e) => { if (!/WebGL/.test(e.message)) bad(ctx, `JavaScript-Fehler: ${e.message}`); });
    await page.clock.setFixedTime(new Date('2026-11-04T10:30:00+01:00')); // Mittwochvormittag: Container und Geschäfte offen
    await page.goto(BASE);
    await page.waitForTimeout(2500);
    const visible = async (sel) => page.evaluate((q) => {
      const b = document.querySelector(q); if (!b) return 'fehlt';
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.top < 0 || r.height === 0) return 'außerhalb des Bildschirms';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === b || b.contains(hit) ? 'ok' : 'verdeckt';
    }, sel);
    // Bei vergrößerter Schrift (CSS-Zoom) verrechnet sich Playwright bei Klick-Koordinaten → per Skript tippen; Erreichbarkeit prüft visible()
    const tap = (sel) => page.locator(sel).first().evaluate((el) => el.click());
    const chip = page.locator('#chips .roundchip');
    if (!(await chip.count())) { bad(ctx, 'Knopf „Erledigungs-Runde“ fehlt'); await context.close(); continue; }
    await tap('#chips .roundchip');
    await page.waitForTimeout(400);
    if (await page.locator('#round').isHidden()) { bad(ctx, 'Fenster öffnet nicht'); await context.close(); continue; }
    if ((await page.locator('#round-plan').isDisabled()) !== true) bad(ctx, '„Runde planen“ ohne Auswahl aktiv');
    for (const t of ['brief', 'geld', 'glas', 'papier']) await tap(`#round-tasks [data-task="${t}"]`);
    if (!(await page.locator('#round-tasks [data-task="kleider"]').isDisabled())) bad(ctx, 'Mehr als 4 Erledigungen wählbar');
    await tap('#round-tasks [data-task="papier"]'); // wieder ab → 3
    if (await page.locator('#round-tasks [data-task="kleider"]').isDisabled()) bad(ctx, 'Nach Abwählen bleibt Auswahl gesperrt');
    await tap('#round-modes [data-mode="driving"]');
    if ((await page.locator('#round-modes [data-mode="driving"]').getAttribute('aria-pressed')) !== 'true') bad(ctx, 'Auswahl „Auto“ wird nicht gedrückt');
    const pv = await visible('#round-plan');
    if (pv !== 'ok') bad(ctx, `„Runde planen“ ${pv}`);
    await tap('#round-plan');
    await page.waitForSelector('#round-res:not([hidden])', { timeout: 15000 }).catch(() => bad(ctx, 'Kein Ergebnis'));
    const stops = await page.locator('.round-list li').count();
    if (!(await page.locator('#round-form').isHidden())) bad(ctx, 'Auswahl bleibt über dem Ergebnis stehen');
    if (stops !== 3) bad(ctx, `${stops} statt 3 Stopps (Text: ${(await page.locator('#round-res').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)})`);
    const txt = await page.locator('#round-res').innerText().catch(() => '');
    if (/undefined|null|NaN|\[object/.test(txt)) bad(ctx, `Ergebnis enthält undefined/NaN: ${txt.slice(0, 120)}`);
    const href = await page.locator('#round-go').getAttribute('href').catch(() => null);
    if (!href) bad(ctx, 'Google-Maps-Link fehlt');
    else {
      const u = new URL(href);
      const wp = (u.searchParams.get('waypoints') || '').split('|').filter(Boolean).length;
      if (u.searchParams.has('origin')) bad(ctx, 'Google-Link enthält den eigenen Standort');
      if (wp !== Math.max(0, stops - 1) || !u.searchParams.get('destination') || u.searchParams.get('travelmode') !== 'driving') bad(ctx, `Google-Link passt nicht zur Runde: ${href}`);
    }
    const gv = await visible('#round-go');
    if (gv !== 'ok') bad(ctx, `Knopf „Google Maps“ ${gv}`);
    const mv = await visible('#round-map');
    if (mv !== 'ok') bad(ctx, `Knopf „Auf der Karte zeigen“ ${mv}`);
    await tap('#round-map');
    await page.waitForTimeout(900);
    if (!(await page.locator('#round').isHidden())) bad(ctx, 'Fenster schließt nach „Auf der Karte“ nicht');
    const mk = await page.locator('.round-mk').count();
    if (mk !== stops) bad(ctx, `${mk} Nummern auf der Karte statt ${stops}`);
    if (await page.locator('#roundbar').isHidden()) bad(ctx, 'Runden-Leiste erscheint nicht');
    await tap('#rb-list');
    await page.waitForTimeout(400);
    if (await page.locator('#round').isHidden()) bad(ctx, '„Liste“ öffnet die Runde nicht wieder');
    if ((await page.locator('.round-list li').count()) !== stops) bad(ctx, '„Liste“ zeigt die Stopps nicht');
    await tap('#round-edit');
    if (await page.locator('#round-form').isHidden()) bad(ctx, '„Erledigungen ändern“ zeigt die Auswahl nicht');
    await tap('#round-close');
    await tap('#rb-x');
    await page.waitForTimeout(400);
    if (await page.locator('.round-mk').count()) bad(ctx, 'Nummern bleiben nach „Runde beenden“ auf der Karte');
    if (!(await page.locator('#roundbar').isHidden())) bad(ctx, 'Runden-Leiste bleibt nach „Runde beenden“');
    await context.close();
  }
  await browser.close();
}
await roundCheck();

// App-Kurzbefehle (Manifest + Startlinks): jeder Link öffnet das Richtige
async function shortcutCheck() {
  const man = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  const sc = man.shortcuts || [];
  if (sc.length !== 4) bad('Kurzbefehle', `${sc.length} statt 4 Kurzbefehle im Manifest`);
  for (const s of sc) for (const ic of s.icons || []) { try { await readFile(new URL('../' + ic.src, import.meta.url)); } catch { bad('Kurzbefehle', `Symbol fehlt: ${ic.src}`); } }
  const browser = await chromium.launch();
  for (const [k, expect] of [['toilette', 'detail'], ['briefkasten', 'detail'], ['runde', 'round'], ['zuletzt', 'none']]) {
    const ctx = `Kurzbefehl ${k}`;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: PLACES[0].lat, longitude: PLACES[0].lon }, permissions: ['geolocation'], locale: 'de-DE' });
    await context.route(/openfreemap\.org/, (r) => (r.request().url().includes('/styles/') ? r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }) : r.abort()));
    await context.route(/supabase\.co/, (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
    await context.addInitScript(() => { try { if (!sessionStorage.getItem('x')) { localStorage.clear(); localStorage.setItem('welcomed', '1'); localStorage.setItem('supportHidden', '1'); localStorage.setItem('cats', JSON.stringify(['geldautomat'])); sessionStorage.setItem('x', '1'); } } catch { /* */ } });
    const page = await context.newPage();
    page.on('pageerror', (e) => { if (!/WebGL/.test(e.message)) bad(ctx, `JavaScript-Fehler: ${e.message}`); });
    await page.goto(BASE + '?k=' + k);
    await page.waitForTimeout(4500);
    const cats = await activeCats(page);
    if (/[?&]k=/.test(page.url())) bad(ctx, 'Startlink bleibt in der Adresse stehen');
    if (expect === 'detail') {
      if (cats.join(',') !== k) bad(ctx, `aktiv: ${cats.join(', ')} statt nur ${k}`);
      if (!(await page.locator('.detail').count())) bad(ctx, 'nächster Ort wird nicht geöffnet');
      else {
        const rows = await page.evaluate(() => document.querySelector('.detail h2')?.textContent || '');
        if (!rows) bad(ctx, 'Detail ohne Titel');
      }
    }
    if (expect === 'round' && (await page.locator('#round').isHidden())) bad(ctx, 'Erledigungs-Runde öffnet nicht');
    if (expect === 'none' && cats.join(',') !== 'geldautomat') bad(ctx, `„Wie zuletzt“ zeigt ${cats.join(', ') || 'nichts'} statt der letzten Auswahl`);
    await context.close();
  }
  await browser.close();
}
await shortcutCheck();

// „Wohin damit?“: Auswahl, jeder Gegenstand, Regel mit Quelle, passende Orte, Beenden stellt die alte Auswahl wieder her
async function wohinCheck() {
  const { WOHIN, wohinCats } = await import('../src/wohin.js');
  const browser = await chromium.launch();
  for (const zoom of [1, 1.35]) {
    const ctx = `Wohin damit · Schrift ${Math.round(zoom * 100)} %`;
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, geolocation: { latitude: PLACES[0].lat, longitude: PLACES[0].lon }, permissions: ['geolocation'], locale: 'de-DE' });
    await context.route(/openfreemap\.org/, (r) => (r.request().url().includes('/styles/') ? r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }) : r.abort()));
    await context.route(/supabase\.co/, (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
    await context.addInitScript((z) => { try { localStorage.clear(); localStorage.setItem('welcomed', '1'); localStorage.setItem('supportHidden', '1'); } catch { /* */ } document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(z); }); }, zoom);
    const page = await context.newPage();
    page.on('pageerror', (e) => { if (!/WebGL/.test(e.message)) bad(ctx, `JavaScript-Fehler: ${e.message}`); });
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    const tap = (sel) => page.locator(sel).first().evaluate((el) => el.click());
    const visible = async (sel) => page.evaluate((q) => {
      const b = document.querySelector(q); if (!b) return 'fehlt';
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.top < 0 || r.height === 0) return 'außerhalb des Bildschirms';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === b || b.contains(hit) ? 'ok' : 'verdeckt';
    }, sel);
    // Startkarte: Umschalter „Wo finde ich …? / Wohin damit?“
    if (!(await page.locator('.ov-tabs [data-ovtab="wohin"]').count())) bad(ctx, 'Umschalter „Wohin damit?“ fehlt auf der Startkarte');
    else {
      await tap('.ov-tabs [data-ovtab="wohin"]');
      await page.waitForTimeout(300);
      if ((await page.locator('#sheet-body [data-wohin]').count()) !== WOHIN.length) bad(ctx, 'Auswahl „Wohin damit?“ unvollständig');
      await tap('.ov-tabs [data-ovtab="find"]');
    }
    // Vorher eine normale Kategorie wählen – nach dem Beenden muss sie wieder da sein
    await tap('#chips .chip[data-id="briefkasten"]');
    await page.waitForTimeout(800);
    for (const w of WOHIN) {
      await tap('#chips [data-wohin-open]');
      await page.waitForTimeout(250);
      const btn = `#sheet-body [data-wohin="${w.id}"]`;
      const v = await visible(btn);
      if (v !== 'ok') bad(ctx, `Auswahl „${w.label}“ ${v}`);
      await tap(btn);
      await page.waitForTimeout(700);
      const cats = await activeCats(page);
      const want = wohinCats(w).sort().join(',');
      if (cats.join(',') !== want) bad(ctx, `„${w.label}“: aktiv ${cats.join(', ') || 'nichts'} statt ${want || 'nichts'}`);
      if (await page.locator('#wohinbar').isHidden()) bad(ctx, `„${w.label}“: Leiste „Wohin mit“ fehlt`);
      if (w.rule) {
        const rule = await page.locator('.wohin-rule').innerText().catch(() => '');
        if (!rule.includes('Quelle') || !rule.includes('Abfallsatzung')) bad(ctx, `„${w.label}“: Regel ohne Quelle oder Hinweis auf die Kommune`);
        if (w.src && !(await page.locator('.wohin-rule .wohin-src a').count())) bad(ctx, `„${w.label}“: Quelle nicht verlinkt`);
      }
      if (w.link && !(await page.locator('.wohin-rule .wohin-link').count())) bad(ctx, `„${w.label}“: Link fehlt`);
      const allowed = wohinCats(w);
      const wrong = await page.$$eval('#sheet-body .row', (a, ok) => a.filter((r) => !ok.includes(r.dataset.c)).length, allowed);
      if (wrong) bad(ctx, `„${w.label}“: ${wrong} unpassende Orte in der Liste`);
      const txt = await page.locator('#sheet-body').innerText().catch(() => '');
      if (/undefined|null|NaN|\[object/.test(txt)) bad(ctx, `„${w.label}“: Anzeige enthält undefined/NaN`);
    }
    await tap('#wb-x');
    await page.waitForTimeout(600);
    const back = await activeCats(page);
    if (back.join(',') !== 'briefkasten') bad(ctx, `Nach „Wohin damit“ beenden: ${back.join(', ') || 'nichts'} statt Briefkästen`);
    if (!(await page.locator('#wohinbar').isHidden())) bad(ctx, 'Leiste „Wohin mit“ bleibt nach dem Beenden');
    await context.close();
  }
  await browser.close();
}
await wohinCheck();

// „Hier fehlt was“ und Mini-Aufgaben: was gesendet wird (nur Raster bzw. feste Antworten), Ablauf, Knöpfe erreichbar
async function mitmachCheck() {
  const { gapCell } = await import('../src/reports.js');
  const browser = await chromium.launch();
  for (const zoom of [1, 1.35]) {
    const ctx = `Mitmachen · Schrift ${Math.round(zoom * 100)} %`;
    const sent = [];
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, geolocation: { latitude: PLACES[0].lat, longitude: PLACES[0].lon }, permissions: ['geolocation'], locale: 'de-DE' });
    await context.route(/openfreemap\.org/, (r) => (r.request().url().includes('/styles/') ? r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }) : r.abort()));
    await context.route(/supabase\.co/, (r) => {
      const q = r.request();
      if (q.method() === 'POST' && /\/rest\/v1\/(gaps|reports)$/.test(new URL(q.url()).pathname)) { sent.push({ path: new URL(q.url()).pathname, body: q.postDataJSON() }); return r.fulfill({ status: 201, body: '' }); }
      return r.fulfill({ contentType: 'application/json', body: '[]' });
    });
    await context.addInitScript((z) => { try { localStorage.clear(); localStorage.setItem('welcomed', '1'); localStorage.setItem('supportHidden', '1'); } catch { /* */ } document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(z); }); }, zoom);
    const page = await context.newPage();
    page.on('pageerror', (e) => { if (!/WebGL/.test(e.message)) bad(ctx, `JavaScript-Fehler: ${e.message}`); });
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    if ((await page.evaluate(() => document.documentElement.dataset.mitmachen)) !== '1') {
      notes.push(`[${ctx}] „Hier fehlt was“/Mini-Aufgaben noch ausgeschaltet (Datenbank-Erweiterung fehlt) – übersprungen`);
      if (await page.locator('.mini-q').count()) bad(ctx, 'Mini-Aufgabe sichtbar, obwohl ausgeschaltet');
      await context.close(); continue;
    }
    const tap = (sel) => page.locator(sel).first().evaluate((el) => el.click());
    const visible = async (sel) => page.evaluate((q) => {
      const b = document.querySelector(q); if (!b) return 'fehlt';
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.top < 0 || r.height === 0) return 'außerhalb des Bildschirms';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === b || b.contains(hit) ? 'ok' : 'verdeckt';
    }, sel);

    // A) „Fehlt was?“ → „An einer bestimmten Stelle“ → Fadenkreuz → Hier fehlt was
    await tap('#chips [data-wish]');
    await page.waitForTimeout(300);
    if (!(await page.locator('#wish-gap').count())) bad(ctx, 'Knopf „An einer bestimmten Stelle“ fehlt im Fenster „Fehlt was?“');
    else {
      await tap('#wish-gap');
      await page.waitForTimeout(300);
      if (await page.locator('#gapbar').isHidden()) bad(ctx, 'Leiste „Karte an die Stelle schieben“ fehlt');
      if (await page.locator('#crosshair').isHidden()) bad(ctx, 'Fadenkreuz fehlt');
      await tap('#gb-go');
      await page.waitForTimeout(300);
      if (await page.locator('#gap').isHidden()) bad(ctx, '„Was fehlt hier?“ öffnet nicht');
      if (!(await page.locator('#gap-send').isDisabled())) bad(ctx, '„Wunsch senden“ ohne Auswahl aktiv');
      await tap('#gap-items [data-gapitem="toilette"]');
      const v = await visible('#gap-send');
      if (v !== 'ok') bad(ctx, `„Wunsch senden“ ${v}`);
      await tap('#gap-send');
      await page.waitForTimeout(500);
      const g = sent.find((x) => x.path.endsWith('/gaps'));
      if (!g) bad(ctx, 'Wunsch wurde nicht gesendet');
      else {
        const keys = Object.keys(g.body).sort().join(',');
        if (keys !== 'cell,item') bad(ctx, `„Hier fehlt was“ sendet mehr als Art und Raster: ${keys}`);
        if (!/^\d{4,6}_\d{3,5}$/.test(g.body.cell)) bad(ctx, `Rasterzelle falsch: ${g.body.cell}`);
        const [cy, cx] = g.body.cell.split('_').map(Number), [py, px] = gapCell(PLACES[0].lat, PLACES[0].lon).split('_').map(Number);
        if (Math.abs(cy - py) > 3 || Math.abs(cx - px) > 3) bad(ctx, `Rasterzelle liegt nicht bei der Kartenmitte: ${g.body.cell}`);
      }
      if (!(await page.locator('#gap').isHidden())) bad(ctx, 'Fenster bleibt nach dem Senden offen');
    }

    // A2) Lange auf die Karte drücken öffnet „Was fehlt hier?“ (kurzes Tippen nicht)
    const press = (ms) => page.evaluate(async (dur) => {
      const el = document.querySelector('.maplibregl-canvas'); const r = el.getBoundingClientRect();
      const t = new Touch({ identifier: 1, target: el, clientX: r.left + r.width / 2, clientY: r.top + 220 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
      await new Promise((res) => setTimeout(res, dur));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
    }, ms);
    await press(150);
    await page.waitForTimeout(800);
    if (!(await page.locator('#gap').isHidden())) { bad(ctx, 'Kurzes Tippen öffnet schon „Was fehlt hier?“'); await tap('#gap-close'); }
    await press(900);
    await page.waitForTimeout(400);
    if (await page.locator('#gap').isHidden()) bad(ctx, 'Lange drücken öffnet „Was fehlt hier?“ nicht');
    else await tap('#gap-close');

    // B) Mini-Aufgaben: Toilette öffnen → Frage beantworten → nächste Frage wechselt → höchstens 3
    await tap('#chips .chip[data-id="toilette"]');
    await page.waitForTimeout(1500);
    const rows = page.locator('#sheet-body .row');
    if (!(await rows.count())) { bad(ctx, 'Keine Toiletten für die Mini-Aufgaben'); await context.close(); continue; }
    const answered = [];
    for (let k = 0; k < 4; k++) {
      await rows.first().evaluate((el) => el.click()).catch(() => {});
      await page.waitForTimeout(500);
      const q = await page.locator('.mini-q p').textContent().catch(() => null);
      if (!q) { if (k === 0) bad(ctx, 'Mini-Aufgabe: keine Frage angezeigt (Ort ohne Prüfdatum)'); break; }
      if (k === 3) { if (q) bad(ctx, `Mehr als 3 Fragen zu einem Ort: „${q}“`); break; }
      if (answered.includes(q)) bad(ctx, `Frage wiederholt sich: „${q}“`);
      answered.push(q);
      const v = await visible('.mini-q .mini-a .btn');
      if (v !== 'ok') bad(ctx, `Antwort-Knopf ${v}`);
      const before = sent.length;
      if (k === 2) await tap('.mini-q [data-mini="skip"]'); else await tap('.mini-q .btn.primary');
      await page.waitForTimeout(600);
      if (k < 2) {
        const r = sent.slice(before).find((x) => x.path.endsWith('/reports'));
        if (!r) bad(ctx, `Antwort auf „${q}“ nicht gesendet`);
        else if (!['confirm', 'fact', 'gone', 'hours'].includes(r.body.kind) || (r.body.kind === 'fact' && !/^(fee|wc|baby)_(yes|no)$|^times_ok$/.test(r.body.status || ''))) bad(ctx, `Antwort mit unerwartetem Inhalt: ${JSON.stringify(r.body).slice(0, 120)}`);
        else if ('message' in r.body) bad(ctx, 'Mini-Aufgabe sendet Text');
      } else if (sent.length !== before) bad(ctx, '„Weiß nicht“ sendet trotzdem etwas');
      await tap('#close').catch(() => {});
      await page.waitForTimeout(300);
    }
    await context.close();
  }
  await browser.close();
}
await mitmachCheck();

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

// „Neuen Ort melden“ auf kleinem Handy mit großer Systemschrift: der Melden-Knopf muss sichtbar und antippbar sein
async function addCheck() {
  const browser = await chromium.launch();
  for (const zoom of [1, 1.35]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, geolocation: { latitude: 50.5446, longitude: 7.1136 }, permissions: ['geolocation'] });
    await context.route(/openfreemap\.org/, (r) => r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }));
    await context.route(/supabase\.co/, (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
    await context.addInitScript((z) => { try { localStorage.setItem('welcomed', '1'); } catch { /* */ } document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(z); }); }, zoom);
    const page = await context.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(2000);
    const ctx = `Neuer Ort · Schriftgröße ${Math.round(zoom * 100)} %`;
    if (!(await page.locator('#btn-add').isVisible())) { notes.push(`[${ctx}] Plus-Knopf nicht aktiv (Datenbank im Test aus)`); await context.close(); continue; }
    await page.locator('#btn-add').click();
    await page.waitForTimeout(800);
    await page.locator('[data-cat]').nth(1).click();
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => {
      const b = document.getElementById('add-save'); if (!b) return 'fehlt';
      const r = b.getBoundingClientRect();
      if (r.bottom > innerHeight || r.top < 0 || r.height === 0) return `außerhalb des Bildschirms (oben ${Math.round(r.top)}, unten ${Math.round(r.bottom)}, Höhe ${innerHeight})`;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === b || b.contains(hit) ? 'ok' : 'verdeckt';
    });
    if (ok !== 'ok') bad(ctx, `„Melden“-Knopf ${ok}`);
    await context.close();
  }
  await browser.close();
}
await addCheck();

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
