-- Nahfuchs: Absicherung der Meldungen (2.11.2026)
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt:
--  1. Meldungen für die neuen Kategorien "Wertstoffhöfe" und "Apotheken" sind erlaubt.
--  2. Lesen geht nur noch über die Funktion reports_in_box: höchstens ein begrenzter
--     Kartenausschnitt und 3.000 Meldungen pro Abruf. Ein Komplett-Download der Tabelle geht nicht mehr.
--  3. Geräte-Kennungen werden nur noch pro Ort verschlüsselt (SHA-256) herausgegeben,
--     sodass niemand die Meldungen eines Geräts über verschiedene Orte hinweg verfolgen kann.

-- 1) neue Kategorie
alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('briefkasten','glas','papier','altkleider','wertstoffhof','toilette','rastplatz','paketshop','packstation','geldautomat','ladesaeule','apotheke'));

-- 2) geschützte Lese-Funktion
create or replace function public.reports_in_box(s double precision, w double precision, n double precision, e double precision)
returns table (place_id text, category text, kind text, status text, message text,
               lat double precision, lon double precision, device text,
               created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  with b as (
    select greatest(s, (s + n) / 2 - 0.5)  as s, least(n, (s + n) / 2 + 0.5)  as n,
           greatest(w, (w + e) / 2 - 1.0)  as w, least(e, (w + e) / 2 + 1.0)  as e
  )
  select r.place_id, r.category, r.kind, r.status, r.message, r.lat, r.lon,
         encode(sha256(convert_to(r.device || ':' || r.place_id, 'UTF8')), 'hex') as device,
         r.created_at, r.expires_at
  from public.reports r, b
  where r.lat between b.s and b.n and r.lon between b.w and b.e
    and r.created_at > now() - interval '365 days'
  order by r.created_at desc
  limit 3000;
$$;
revoke all on function public.reports_in_box(double precision, double precision, double precision, double precision) from public;
grant execute on function public.reports_in_box(double precision, double precision, double precision, double precision) to anon;

-- Der Spam-Schutz muss weiter zählen können, auch wenn "anon" nicht mehr direkt lesen darf
alter function public.reports_rate_limit() security definer set search_path = public;

-- 3) direktes Lesen der Tabelle sperren (Melden bleibt erlaubt)
drop policy if exists "Meldungen lesen" on public.reports;
revoke select on public.reports from anon;
