# Supabase – Reihenfolge der SQL-Dateien

Die Live-Datenbank (Projekt `xwbohqionahwwrdckefz`, Region Irland) ist auf dem Stand aller Dateien unten.
Für eine **neue** Datenbank in genau dieser Reihenfolge im SQL Editor ausführen:

1. `schema.sql` – nur die Tabelle `reports` anlegen (danach sofort weiter, die Lese-Rechte daraus werden in 2. entfernt)
2. `2026-11-02-absicherung.sql`
3. `2026-11-02-loeschen.sql`
4. `2026-11-02-tankstelle.sql`
5. `2026-11-03-wuensche.sql`
6. `2026-11-03-datensparsamkeit.sql`
7. `2026-11-03-statistik.sql`
8. `2026-11-04-parken.sql`
9. `2026-11-05-mitmachen.sql`
10. `2026-11-06-wickeln.sql`
11. `2026-11-07-ki-pruefer.sql`

Grundsätze: anonym nur **Einfügen** (über Regeln mit Prüfungen) und Lesen über die Funktion `reports_in_box`;
kein Freitext (`message is null`), Geräte-Kennung nur gehasht je Ort, automatische Löschfristen per `pg_cron`.
