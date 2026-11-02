# Nahfuchs-Reels (Stil B „Flach“ – gewählt am 2.11.2026)

Gezeichnete Erklär-Reels 1080×1920, 30 fps, H.264, ohne Ton. Stil: flache Vektor-Grafik in den App-Farben
(Hintergrund #EEF3EC, Dunkelgrün #1F4D3A, Tinte #17241D, Fuchs-Orange #E8742A, Weiß), Schrift Outfit 400/600/800,
weiche Feder-/Bounce-Animationen, Strichmännchen mit grünem Oberkörper, Fuchs-Maskottchen, Endkarte dunkelgrüner Kreis
mit „nahfuchs.de“ und drei Häkchen-Pillen „Kostenlos / Ohne Konto / Ohne Werbung“.
Wichtige Inhalte nur zwischen y ≈ 300 und 1545 (Instagram-Bedienelemente oben/unten).

- `style-b.js`: Zeitachse `render(t)` auf einem Canvas (Beispiel: „Brief muss heute noch weg?“, 11 s)
- `common.js`: Hilfsfunktionen (Easing, Fuchs, Formen)
- `render.js`: rendert per Playwright Bild für Bild und kodiert mit ffmpeg → `node render.js b`
  (Vorschau einzelner Zeitpunkte: `node render.js b preview 1,4,7,10`)
- Neues Reel: `style-b.js` kopieren, Szenen/Texte anpassen, Dauer in `render.js` (N = Sekunden × 30) setzen.
- Abhängigkeiten: `npm install` (Schriften @fontsource/outfit), Playwright-Chromium und ffmpeg.
- Plan und Reihenfolge: Projekt-Dokument „Nahfuchs Reels-Plan“.
