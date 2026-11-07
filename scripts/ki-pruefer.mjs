// KI-Prüfer: schickt die Code-Änderungen eines Pushs an Claude und schreibt das Gutachten
// in die Zusammenfassung des GitHub-Laufs. Bei „KRITISCH“ wird ein Issue angelegt.
// Es wird nur Quelltext geschickt (Repo ist ohnehin öffentlich) – keine Daten-Dateien, keine Geheimnisse.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.KI_MODEL || 'claude-sonnet-5-5';
const MAX_DIFF = 120_000; // Zeichen, ca. 30.000 Tokens – hält die Kosten pro Lauf bei wenigen Cent
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n'); console.log(s); };

if (!KEY) { summary('ℹ️ KI-Prüfer übersprungen: Secret ANTHROPIC_API_KEY ist noch nicht hinterlegt.'); process.exit(0); }

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const after = process.env.AFTER || 'HEAD';
let before = process.env.BEFORE;
if (!before || /^0+$/.test(before)) before = `${after}~${Math.max(1, +process.env.COMMITS || 1)}`;
try { git('cat-file', '-e', `${before}^{commit}`); } catch { before = `${after}~1`; }

// Nur Quelltext: keine erzeugten Daten, Bibliotheken, Bilder, Videos, Android-Binärdateien
const EXCLUDE = ['data/**', 'vendor/**', 'work/**', 'sources/**', 'marketing/**/*.jpg', 'marketing/**/*.png', 'marketing/**/*.mp4',
  'icons/**', 'android/**/*.aab', 'android/**/*.apk', '*.lock', 'package-lock.json'];
const files = git('diff', '--name-only', before, after, '--', '.', ...EXCLUDE.map((p) => `:(exclude)${p}`)).split('\n').filter(Boolean);
if (!files.length) { summary('✅ KI-Prüfer: keine prüfbaren Quelltext-Änderungen.'); process.exit(0); }
let diff = git('diff', '--unified=4', before, after, '--', ...files);
const cut = diff.length > MAX_DIFF;
if (cut) diff = diff.slice(0, MAX_DIFF);
const log = git('log', '--format=- %s', `${before}..${after}`).trim();

const system = `Du bist ein strenger, erfahrener Code-Reviewer für „Nahfuchs“, eine kostenlose Karten-PWA (Vanilla JS, MapLibre, Supabase, GitHub Pages) eines Einzelunternehmers in Deutschland.
Grundsätze des Projekts: Rechtssicherheit und Datenschutz haben Vorrang. Kein Konto, kein Tracking, keine Werbung, keine Freitext-Eingaben in der App, Meldungen nur ortsbezogen und datensparsam (DSGVO, TDDDG). Daten Dritter nur mit passender Lizenz und Quellenangabe. Keine Tatsachenbehauptungen über Dritte (z. B. Handelsketten).
Prüfe den Diff auf: 1) echte Fehler/Abstürze/Logikfehler, 2) Sicherheit (XSS, unsichere URLs, Geheimnisse im Code, Supabase-RLS), 3) Datenschutz/Recht (neue Datenerhebung, Tracking, externe Anfragen, Lizenzen, irreführende Aussagen), 4) Barrierefreiheit und Browser-Kompatibilität (Chrome, Safari/WebKit, Firefox), 5) fehlende Tests für neue Funktionen.
Melde nur Dinge, die wirklich zählen – keine Stil-Kleinigkeiten. Antworte auf Deutsch, kurz und verständlich auch für Nicht-Programmierer.
Format: Erste Zeile genau „ERGEBNIS: OK“, „ERGEBNIS: HINWEISE“ oder „ERGEBNIS: KRITISCH“. Danach eine Liste: **Datei:Zeile** – Problem – Vorschlag. KRITISCH nur bei Sicherheitslücken, Datenschutz-/Rechtsverstößen oder Fehlern, die die App für Nutzer unbrauchbar machen.`;
const user = `Commits:\n${log}\n\nGeänderte Dateien (${files.length}):\n${files.join('\n')}\n${cut ? '\n(Diff gekürzt)\n' : ''}\n\`\`\`diff\n${diff}\n\`\`\``;

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, messages: [{ role: 'user', content: user }] }),
  signal: AbortSignal.timeout(300_000),
});
if (!res.ok) { summary(`⚠️ KI-Prüfer: API-Fehler ${res.status} – ${(await res.text()).slice(0, 300)}`); process.exit(0); }
const j = await res.json();
const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
const verdict = (text.match(/ERGEBNIS:\s*(OK|HINWEISE|KRITISCH)/) || [])[1] || 'HINWEISE';
const icon = { OK: '✅', HINWEISE: '🟡', KRITISCH: '🔴' }[verdict];
const cost = j.usage ? ` · ${j.usage.input_tokens} Eingabe-/${j.usage.output_tokens} Ausgabe-Tokens` : '';
summary(`## ${icon} KI-Prüfer: ${verdict}\n\n${MODEL}${cost}${cut ? ' · Diff gekürzt' : ''}\n\n${text}`);

if (verdict === 'KRITISCH' && process.env.GH_TOKEN && process.env.GITHUB_REPOSITORY) {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
    body: JSON.stringify({ title: `KI-Prüfer: kritischer Fund in ${after.slice(0, 7)}`, body: `${text}\n\n—\nLauf: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }),
  });
  console.log(`Issue: ${r.status}`);
}
