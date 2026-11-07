-- ⚠️ VERALTET – NICHT MEHR AUSFÜHREN (Stand 7.11.2026)
-- Diese Datei ist nur die allererste Fassung. Sie würde Lese-Rechte für alle wieder öffnen,
-- die spätere Absicherungen entfernt haben. Neue Datenbank: siehe supabase/README.md (Reihenfolge).
--
-- Around the Corner: Datenbank für Nutzer-Meldungen
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  place_id    text not null check (char_length(place_id) <= 80),
  category    text not null check (category in ('briefkasten','glas','papier','altkleider','toilette','rastplatz','paketshop','packstation','geldautomat','ladesaeule')),
  kind        text not null check (kind in ('status','hours','closed','gone','new','confirm','note')),
  status      text check (status is null or status in ('voll','halb','leer','sauber','ok','dreckig','defekt')),
  message     text check (message is null or char_length(message) <= 300),
  lat         double precision not null check (lat between 47 and 55.5),
  lon         double precision not null check (lon between 5.5 and 15.5),
  device      text not null check (char_length(device) between 8 and 64),
  expires_at  timestamptz
);

create index if not exists reports_geo_idx on public.reports (lat, lon);
create index if not exists reports_place_idx on public.reports (place_id);
create index if not exists reports_device_time_idx on public.reports (device, created_at);

-- Pro Gerät nur eine Bestätigung bzw. "gibt es nicht mehr"-Meldung je Ort
create unique index if not exists reports_one_vote_idx on public.reports (place_id, device, kind) where kind in ('confirm','gone','new');

-- Schutz gegen Spam: höchstens 30 Meldungen pro Gerät und Stunde
create or replace function public.reports_rate_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.reports where device = new.device and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Zu viele Meldungen – bitte später erneut versuchen';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports for each row execute function public.reports_rate_limit();

-- Zugriff: jeder darf melden und lesen, niemand darf ändern oder löschen
alter table public.reports enable row level security;
drop policy if exists "Meldungen lesen" on public.reports;
create policy "Meldungen lesen" on public.reports for select to anon using (created_at > now() - interval '365 days');
drop policy if exists "Meldungen anlegen" on public.reports;
create policy "Meldungen anlegen" on public.reports for insert to anon with check (true);
grant select, insert on public.reports to anon;
