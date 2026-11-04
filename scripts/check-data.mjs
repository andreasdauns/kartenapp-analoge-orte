// Qualitätsprüfung der gebauten Kacheln – läuft nach build-data.mjs und vor dem Veröffentlichen.
// Bei Fehlern bricht der Lauf ab: dann bleibt die Version vom Vortag online.
// Aufruf: node scripts/check-data.mjs [--prev https://nahfuchs.de/data/index.json]
import { readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { CATEGORIES } from '../src/categories.js';

const root = new URL('../', import.meta.url);
const dataDir = new URL('data/', root);
const CATS = new Set(CATEGORIES.map((c) => c.id));
const DE = { s: 47.2, n: 55.1, w: 5.8, e: 15.1 };
const prevUrl = process.argv.includes('--prev') ? process.argv[process.argv.indexOf('--prev') + 1] : null;

const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const index = JSON.parse(await readFile(new URL('index.json', dataDir), 'utf8'));
const files = (await readdir(new URL('t/', dataDir))).filter((f) => f.endsWith('.json'));

const seen = new Map();
const counts = {};
const ex = { dupId: [], near: [], innerDup: [], bad: [] };
let total = 0, nearDup = 0;
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
const TIME_KEY = /hours|times|date|conditional/;
// Diese Kategorien stehen oft wirklich mehrfach nebeneinander (Container-Reihe, Ladepunkte, Automaten)
const MULTI_OK = new Set(['glas', 'papier', 'altkleider', 'ladesaeule', 'geldautomat', 'briefkasten', 'packstation']);

for (const f of files) {
  const tile = JSON.parse(await readFile(new URL(`t/${f}`, dataDir), 'utf8'));
  const [ty, tx] = f.replace('.json', '').split('_').map(Number);
  const near = new Map();
  for (const it of tile.items) {
    total++;
    counts[it.c] = (counts[it.c] || 0) + 1;
    const where = `${it.c} ${it.id} (${it.lat}, ${it.lon})`;
    // 1) Pflichtfelder und Wertebereiche
    if (!CATS.has(it.c)) { err(`Unbekannte Kategorie: ${where}`); continue; }
    if (!it.id || typeof it.lat !== 'number' || typeof it.lon !== 'number' || !it.t || typeof it.t !== 'object') { if (ex.bad.length < 10) ex.bad.push(where); err(`Unvollständiger Eintrag: ${where}`); continue; }
    if (it.lat < DE.s || it.lat > DE.n || it.lon < DE.w || it.lon > DE.e) warn(`Außerhalb Deutschlands: ${where}`);
    if (Math.floor(it.lat / index.tileDeg) !== ty || Math.floor(it.lon / index.tileDeg) !== tx) err(`Falsche Kachel: ${where} in ${f}`);
    // 2) Gleiches Objekt doppelt (gleiche ID + Kategorie)
    const k = `${it.id}|${it.c}`;
    if (seen.has(k)) { if (ex.dupId.length < 10) ex.dupId.push(where); err(`Doppelt: ${where}`); } else seen.set(k, f);
    // 3) Wiederholte Mehrfachwerte („A;B;A“)
    for (const [key, v] of Object.entries(it.t)) {
      if (typeof v !== 'string' || TIME_KEY.test(key) || !v.includes(';')) continue;
      const parts = v.split(';').map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (new Set(parts).size < parts.length) { if (ex.innerDup.length < 10) ex.innerDup.push(`${where} ${key}=${v}`); err(`Wert doppelt: ${where} ${key}=${v}`); }
    }
    // 4) Gleicher Ort zweimal (gleiche Kategorie + gleicher Name/Betreiber, < 40 m) – nur Hinweis
    if (MULTI_OK.has(it.c)) continue;
    const label = norm(it.t.name || it.t.operator || it.t.brand);
    const cell = `${it.c}|${Math.round(it.lat * 2500)}|${Math.round(it.lon * 1600)}|${label}`;
    if (near.has(cell)) { nearDup++; if (ex.near.length < 10) ex.near.push(`${where} ≈ ${near.get(cell)}`); } else near.set(cell, it.id);
  }
}

// 5) Plausibilität der Mengen
if (total < 300000) err(`Nur ${total} Orte – erwartet werden über 300.000`);
for (const c of CATS) if (!counts[c]) err(`Keine Orte in Kategorie ${c}`);
const sum = Object.values(index.counts || {}).reduce((a, b) => a + b, 0);
if (sum !== total) err(`index.json zählt ${sum} Orte, Kacheln enthalten ${total}`);
if (nearDup) warn(`${nearDup} mögliche Doppel-Orte (gleiche Kategorie und gleicher Name, < 40 m) – bitte ansehen`);

// 6) Vergleich mit der aktuell veröffentlichten Version (großer Einbruch = Fehler, nicht veröffentlichen)
let prev = null;
if (prevUrl) {
  try { prev = await (await fetch(prevUrl)).json(); } catch { warn('Vorversion nicht abrufbar – Vergleich übersprungen'); }
}
// Gewollter Rückgang (z. B. nach Entfernen von Doppelten): Commit-Nachricht enthält „[Rückgang ok]“ → nur Hinweis
const dropMsg = process.env.ALLOW_DROP === 'true' ? warn : err;
if (prev?.counts) {
  const ptotal = Object.values(prev.counts).reduce((a, b) => a + b, 0);
  if (total < ptotal * 0.9) dropMsg(`Orte gesamt: ${ptotal} → ${total} (minus ${Math.round((1 - total / ptotal) * 100)} %)`);
  for (const [c, n] of Object.entries(prev.counts)) {
    const now = counts[c] || 0;
    if (n >= 200 && now < n * 0.7) dropMsg(`${c}: ${n} → ${now} (minus ${Math.round((1 - now / n) * 100)} %)`);
  }
}

const report = {
  checked: new Date().toISOString(),
  ok: errors.length === 0,
  total, counts,
  previousTotal: prev?.counts ? Object.values(prev.counts).reduce((a, b) => a + b, 0) : null,
  errors: errors.slice(0, 50), errorCount: errors.length,
  warnings: warnings.slice(0, 50), warningCount: warnings.length,
  examples: ex,
};
await writeFile(new URL('quality.json', dataDir), JSON.stringify(report, null, 1));
const md = `## Datenprüfung: ${report.ok ? '✅ in Ordnung' : '❌ Fehler'}\n\n- Orte: ${total}${report.previousTotal ? ` (vorher ${report.previousTotal})` : ''}\n- Fehler: ${errors.length}\n- Hinweise: ${warnings.length}\n\n${errors.slice(0, 20).map((e) => `- ❌ ${e}`).join('\n')}\n${warnings.slice(0, 20).map((w) => `- ⚠️ ${w}`).join('\n')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
if (!report.ok) process.exit(1);
