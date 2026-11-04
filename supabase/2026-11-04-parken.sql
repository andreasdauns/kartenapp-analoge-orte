-- Nahfuchs: Kategorie „Parken“ (4.11.2026)
-- Einmal in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt: Meldungen (gibt es nicht mehr, geschlossen, Zeiten falsch, Hinweis, neuer Ort)
-- sind auch für Park & Ride (inkl. Mitfahrerparkplätze) und Wanderparkplätze erlaubt.
-- Ohne diese Änderung lehnt die Datenbank solche Meldungen ab.

alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('briefkasten','glas','papier','altkleider','wertstoffhof','toilette','rastplatz','paketshop','packstation','geldautomat','ladesaeule','apotheke','tankstelle','parkride','wanderpark'));
