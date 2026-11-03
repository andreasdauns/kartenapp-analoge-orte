-- Nahfuchs: anonyme Nutzungsstatistik, rein serverseitig (3.11.2026)
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
--
-- Grundsatz: Die App sendet dafür KEINE zusätzliche Anfrage und speichert nichts auf dem Gerät.
-- Gezählt wird nur in Funktionen, die die App ohnehin aufruft:
--  * reports_in_box (Meldungen eines Kartenausschnitts laden) → Tageszähler 'kartenabrufe'
--  * Trigger reports_guard (beim Anlegen einer Meldung)        → Tageszähler je Art/Kategorie/Zustand
-- Gespeichert werden ausschließlich Tag + Kennzahl + Anzahl. Keine IP-Adresse, keine Kennung,
-- keine Koordinaten, keine Ort-IDs, keine Uhrzeit. Löschung nach 25 Monaten.
-- Auswertung nur über stats_summary(): Summen der letzten 90 Tage, Einzelwerte unter 5 → null.

-- 1) Zähltabelle: nur Tag, Kennzahl, Anzahl
create table if not exists public.stats_daily (
  day    date   not null,
  metric text   not null check (char_length(metric) <= 80),
  n      bigint not null default 0,
  primary key (day, metric)
);
alter table public.stats_daily enable row level security;
revoke all on public.stats_daily from public, anon, authenticated;
-- bewusst keine Policies: kein Lesen/Schreiben von außen, nur über die Funktionen unten

-- 2) Hilfsfunktion zum Hochzählen (deutscher Kalendertag)
create or replace function public.stats_count(m text)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.stats_daily as sd (day, metric, n)
  values ((now() at time zone 'Europe/Berlin')::date, m, 1)
  on conflict (day, metric) do update set n = sd.n + 1;
$$;
revoke all on function public.stats_count(text) from public, anon, authenticated;

-- 3) reports_in_box: Rückgabe unverändert, zusätzlich Tageszähler 'kartenabrufe'
--    (jetzt plpgsql/VOLATILE, weil die Funktion schreibt; die App ruft sie per POST auf)
create or replace function public.reports_in_box(s double precision, w double precision, n double precision, e double precision)
returns table (place_id text, category text, kind text, status text, message text,
               lat double precision, lon double precision, device text,
               created_at timestamptz, expires_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.stats_count('kartenabrufe');
  return query
  with b as (
    select greatest(s, (s + n) / 2 - 0.5)  as s, least(n, (s + n) / 2 + 0.5)  as n,
           greatest(w, (w + e) / 2 - 1.0)  as w, least(e, (w + e) / 2 + 1.0)  as e
  )
  select r.place_id, r.category, r.kind, r.status, r.message, r.lat, r.lon,
         r.device, r.created_at, r.expires_at
  from public.reports r, b
  where r.lat between b.s and b.n and r.lon between b.w and b.e
    and r.created_at > now() - interval '365 days'
  order by r.created_at desc
  limit 3000;
end;
$$;
revoke all on function public.reports_in_box(double precision, double precision, double precision, double precision) from public, authenticated;
grant execute on function public.reports_in_box(double precision, double precision, double precision, double precision) to anon;

-- 4) reports_guard: unverändert, zusätzlich Tageszähler je Art/Kategorie/Zustand.
--    Grund: Zustandsmeldungen werden nach 30 Tagen gelöscht; die Zahl soll trotzdem erhalten bleiben.
--    Scheitert die Meldung (z. B. doppelte Bestätigung), wird auch die Zählung zurückgerollt.
create or replace function public.reports_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if new.device is null or char_length(new.device) < 16 or char_length(new.device) > 64 then
    raise exception 'Ungültige Meldung';
  end if;
  h := encode(sha256(convert_to('rate:' || new.device, 'UTF8')), 'hex');
  delete from public.report_rate where at < now() - interval '1 hour';
  if (select count(*) from public.report_rate where dev_hash = h) >= 30 then
    raise exception 'Zu viele Meldungen – bitte später erneut versuchen';
  end if;
  if (select count(*) from public.reports where place_id = new.place_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Zu viele Meldungen zu diesem Ort – bitte später erneut versuchen';
  end if;
  if (select count(*) from public.reports where created_at > now() - interval '1 hour') >= 3000 then
    raise exception 'Zu viele Meldungen – bitte später erneut versuchen';
  end if;
  insert into public.report_rate (dev_hash, at) values (h, now());
  new.device := public.place_device_hash(new.device, new.place_id);
  new.created_at := now();
  perform public.stats_count('meldung:' || new.kind || ':' || new.category || ':' || coalesce(new.status, '-'));
  return new;
end;
$$;
revoke all on function public.reports_guard() from public, anon, authenticated;

-- 5) Einmalig: vorhandene Meldungen als Tageszahlen übernehmen (nur Zählwerte, keine Einzeldaten)
insert into public.stats_daily (day, metric, n)
select (created_at at time zone 'Europe/Berlin')::date,
       'meldung:' || kind || ':' || category || ':' || coalesce(status, '-'), count(*)
from public.reports
group by 1, 2
on conflict (day, metric) do nothing;

-- 6) Auswertung: nur Summen der letzten 90 Tage; Einzelwerte unter 5 werden als null ("<5") ausgegeben.
--    Wochensummen und 7-/90-Tage-Summen ohne Aufschlüsselung nach Kategorie werden ungekürzt gezeigt.
create or replace function public.stats_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select (now() at time zone 'Europe/Berlin')::date as heute),
  d as (select s.day, s.metric, s.n from public.stats_daily s, p where s.day > p.heute - 90),
  k as (select day, n from d where metric = 'kartenabrufe'),
  m as (select day, split_part(metric, ':', 2) as art, split_part(metric, ':', 3) as kategorie,
               nullif(split_part(metric, ':', 4), '-') as zustand, n
        from d where metric like 'meldung:%'),
  wu as (select created_on as day, item, count(*)::bigint as n
         from public.wishes, p where created_on > p.heute - 90 group by 1, 2)
  select jsonb_build_object(
    'stand', (select heute from p),
    'zeitraum_tage', 90,
    'hinweis', 'Nur anonyme Gesamtzahlen. Aufgeschlüsselte Werte unter 5 sind null (<5).',
    'summen_7_tage', jsonb_build_object(
      'kartenabrufe',   (select coalesce(sum(n), 0) from k, p where day > heute - 7),
      'meldungen',      (select coalesce(sum(n), 0) from m, p where day > heute - 7),
      'neue_orte',      (select coalesce(sum(n), 0) from m, p where day > heute - 7 and art = 'new'),
      'bestaetigungen', (select coalesce(sum(n), 0) from m, p where day > heute - 7 and art = 'confirm'),
      'wuensche',       (select coalesce(sum(n), 0) from wu, p where day > heute - 7)),
    'summen_90_tage', jsonb_build_object(
      'kartenabrufe',   (select coalesce(sum(n), 0) from k),
      'meldungen',      (select coalesce(sum(n), 0) from m),
      'neue_orte',      (select coalesce(sum(n), 0) from m where art = 'new'),
      'bestaetigungen', (select coalesce(sum(n), 0) from m where art = 'confirm'),
      'wuensche',       (select coalesce(sum(n), 0) from wu)),
    'kartenabrufe_tag', (select coalesce(jsonb_agg(jsonb_build_object(
        'tag', day, 'n', case when n >= 5 then n end) order by day), '[]'::jsonb) from k),
    'kartenabrufe_woche', (select coalesce(jsonb_agg(jsonb_build_object('woche', wo, 'n', s) order by wo), '[]'::jsonb)
        from (select date_trunc('week', day)::date as wo, sum(n) as s from k group by 1) x),
    'meldungen_woche', (select coalesce(jsonb_agg(jsonb_build_object('woche', wo, 'art', art, 'n', s) order by wo, art), '[]'::jsonb)
        from (select date_trunc('week', day)::date as wo, art, sum(n) as s from m group by 1, 2) x),
    'meldungen_tag', (select coalesce(jsonb_agg(jsonb_build_object(
        'tag', day, 'kategorie', kategorie, 'art', art, 'zustand', zustand,
        'n', case when n >= 5 then n end) order by day, kategorie, art, zustand), '[]'::jsonb) from m),
    'meldungen_kategorie_90', (select coalesce(jsonb_agg(jsonb_build_object(
        'kategorie', kategorie, 'art', art, 'zustand', zustand,
        'n', case when s >= 5 then s end) order by kategorie, art, zustand), '[]'::jsonb)
        from (select kategorie, art, zustand, sum(n) as s from m group by 1, 2, 3) x),
    'wuensche_tag', (select coalesce(jsonb_agg(jsonb_build_object(
        'tag', day, 'punkt', item, 'n', case when n >= 5 then n end) order by day, item), '[]'::jsonb) from wu),
    'wuensche_90', (select coalesce(jsonb_agg(jsonb_build_object(
        'punkt', item, 'n', case when s >= 5 then s end) order by s desc, item), '[]'::jsonb)
        from (select item, sum(n) as s from wu group by 1) x),
    'wuensche_woche', (select coalesce(jsonb_agg(jsonb_build_object('woche', wo, 'n', s) order by wo), '[]'::jsonb)
        from (select date_trunc('week', day)::date as wo, sum(n) as s from wu group by 1) x)
  );
$$;
revoke all on function public.stats_summary() from public, authenticated;
grant execute on function public.stats_summary() to anon;

-- 7) Löschfrist: Tageszahlen nach 25 Monaten löschen (monatlich am 1., 3:40 Uhr)
select cron.unschedule(jobid) from cron.job where jobname = 'nahfuchs-statistik-loeschen';
select cron.schedule('nahfuchs-statistik-loeschen', '40 3 1 * *',
  $$delete from public.stats_daily where day < current_date - interval '25 months'$$);

-- 8) PostgREST über die geänderten Funktionen informieren
notify pgrst, 'reload schema';
