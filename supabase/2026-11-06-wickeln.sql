-- Nahfuchs: Kategorie „Wickelplätze“ (6.11.2026) – Meldungen auch für Wickelplätze erlauben
alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('briefkasten','glas','papier','altkleider','sammelstelle','wertstoffhof','toilette','wickeln','rastplatz','paketshop','packstation','geldautomat','ladesaeule','apotheke','tankstelle','parkride','wanderpark'));
