import { CATEGORIES } from '../../src/categories.js';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const F = (w) => 'data:font/woff2;base64,' + fs.readFileSync(`../reels/node_modules/@fontsource/outfit/files/outfit-latin-${w}-normal.woff2`).toString('base64');
const fox = fs.readFileSync('../../icons/icon.svg', 'utf8');
const shot = 'data:image/png;base64,' + fs.readFileSync('../store/screenshot-3-briefkasten.png').toString('base64');
const C = { bg: '#EEF3EC', gr: '#1F4D3A', ink: '#17241D', or: '#E8742A', muted: '#4E6157' };
const css = `@font-face{font-family:O;font-weight:400;src:url(${F(400)})}@font-face{font-family:O;font-weight:600;src:url(${F(600)})}@font-face{font-family:O;font-weight:800;src:url(${F(800)})}
*{box-sizing:border-box}body{margin:0}.s{width:1080px;height:1350px;font-family:O;color:${C.ink};background:${C.bg};position:relative;overflow:hidden;padding:110px 90px}
h1{font-size:96px;font-weight:800;line-height:1.02;margin:0 0 30px}h2{font-size:76px;font-weight:800;line-height:1.05;margin:0 0 40px}p{font-size:42px;line-height:1.3;margin:0 0 24px;color:${C.muted}}
.or{color:${C.or}}.pill{display:inline-flex;align-items:center;gap:16px;background:#fff;border-radius:60px;padding:18px 34px;font-size:38px;font-weight:600;margin:0 14px 18px 0}
.dot{width:34px;height:34px;border-radius:50%;background:${C.or};display:inline-block}.n{position:absolute;right:70px;bottom:60px;font-size:30px;color:${C.muted};font-weight:600}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.cat{background:#fff;border-radius:28px;padding:16px 22px;display:flex;align-items:center;gap:18px;font-size:34px;font-weight:600;line-height:1.1}
.ic{width:66px;height:66px;border-radius:50%;display:grid;place-items:center;flex:none}.ic svg{width:40px;height:40px}`;
const page = (body, n, dark) => `<html><head><meta charset=utf-8><style>${css}</style></head><body><div class="s" style="${dark ? `background:${C.gr};color:#fff` : ''}">${body}<div class="n" style="${dark ? 'color:#cfe0d6' : ''}">${n}/5</div></div></body></html>`;
const foxBig = `<div style="width:300px;height:300px;margin:0 0 60px">${fox.replace('<svg', '<svg width="300" height="300"')}</div>`;
const cats = CATEGORIES.map((c) => `<div class="cat"><span class="ic" style="background:${c.color};color:${c.ink}">${c.icon}</span>${c.plural.replace(/ \(.*\)/, '')}</div>`).join('');
const slides = [
  page(`${foxBig}<h1>Das ist <span class="or">Nahfuchs</span></h1><p style="font-size:48px">Briefkasten, Container, WC & mehr – alles Wichtige für den Alltag in deiner Nähe. In ganz Deutschland.</p><div style="margin-top:50px"><span class="pill"><span class="dot"></span>Kostenlos</span><span class="pill"><span class="dot"></span>Ohne Konto</span><span class="pill"><span class="dot"></span>Ohne Werbung</span></div>`, 1),
  page(`<h2>Was du <span class="or">findest</span></h2><div class="grid">${cats}</div>`, 2),
  page(`<h2>Alles auf <span class="or">einen Blick</span></h2><p>Leerungszeiten, Öffnungszeiten, Entfernung – und mit einem Tipp zur Route.</p><div style="display:flex;justify-content:center;margin-top:30px"><img src="${shot}" style="height:820px;border-radius:44px;box-shadow:0 30px 80px rgba(23,36,29,.25)"></div>`, 3),
  page(`<h2>Mach <span class="or">mit</span></h2><p style="font-size:46px">Container voll? Toilette defekt? Neuer Briefkasten?</p><p style="font-size:46px">Kurz antippen – sofort für alle sichtbar. Ganz ohne Konto.</p><p style="font-size:46px">Neue Orte zählen, sobald drei Leute sie bestätigt haben.</p><div style="width:220px;height:220px;margin-top:60px">${fox.replace('<svg', '<svg width="220" height="220"')}</div>`, 4),
  page(`${foxBig.replace('margin:0 0 60px', 'margin:40px auto 60px')}<div style="text-align:center"><p style="color:#fff;font-size:52px;font-weight:600;margin-bottom:10px">Jetzt im Browser testen:</p><div style="font-size:140px;font-weight:800">nahfuchs<span class="or">.de</span></div><p style="color:#cfe0d6;font-size:42px;margin-top:40px">Bald auch im Google Play Store.</p></div>`, 5, true),
];
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
for (let i = 0; i < slides.length; i++) { await pg.setContent(slides[i]); await pg.waitForTimeout(300); await pg.screenshot({ path: `slide-${i + 1}.png` }); }
await b.close(); console.log('ok');
