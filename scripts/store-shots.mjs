// Erstellt Store-Bilder für Google Play: Titelbild (1024×500) und Handy-Screenshots (1080×1920) von https://nahfuchs.de.
// Ort: Köln-Innenstadt (öffentlicher Ort, nicht der Wohnort von Andreas). Läuft in GitHub Actions (store-shots.yml).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = fileURLToPath(new URL('../marketing/store/', import.meta.url));
const SITE = process.env.SITE || 'https://nahfuchs.de/';

const browser = await chromium.launch();
// Titelbild
{
  const p = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await p.goto(new URL('../marketing/store/feature.html', import.meta.url).href);
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + 'feature-graphic.png' });
}
const ctx = await browser.newContext({
  viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'de-DE',
  geolocation: { latitude: 50.9384, longitude: 6.9465 }, permissions: ['geolocation'],
});
await ctx.addInitScript(() => { try { localStorage.setItem('welcomed', '1'); localStorage.setItem('supportHidden', '1'); localStorage.removeItem('cats'); } catch { /* */ } });
const page = await ctx.newPage();
await page.goto(SITE);
await page.waitForTimeout(2500);
await page.locator('#use-loc').click().catch(() => {});
await page.waitForTimeout(4000);
const chip = (id) => page.locator(`#chips .chip[data-id="${id}"]`);
const settle = () => page.waitForTimeout(4500);

// 1) Container in der Nähe
await chip('container').click(); await settle();
await page.screenshot({ path: OUT + 'screenshot-1-container.png' });
await chip('container').click();
// 2) Öffentliche Toiletten mit Detail
await chip('toilette').click(); await settle();
await page.locator('#sheet-body .row').first().click(); await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + 'screenshot-2-toilette.png' });
await page.locator('#close').click().catch(() => {}); await page.waitForTimeout(800);
await chip('toilette').click();
// 3) Briefkästen mit Leerungszeiten
await chip('briefkasten').click(); await settle();
await page.screenshot({ path: OUT + 'screenshot-3-briefkasten.png' });
await browser.close();
console.log('Store-Bilder erstellt');
