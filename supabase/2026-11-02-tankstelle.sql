-- Nahfuchs: neue Kategorie "Tankstellen" (2.11.2026)
-- Einmal in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt: Meldungen (Öffnungszeiten falsch, vorübergehend geschlossen, gibt es nicht mehr, neuer Ort)
-- sind auch für Tankstellen erlaubt.

alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('briefkasten','glas','papier','altkleider','wertstoffhof','toilette','rastplatz','paketshop','packstation','geldautomat','ladesaeule','apotheke','tankstelle'));
