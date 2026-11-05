-- Nahfuchs: Sammelstellen, Mini-Aufgaben und „Hier fehlt was“ (5.11.2026)
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt:
--  1. Meldungen sind auch für die neue Kategorie „Sammelstellen“ (Batterien, Elektro …) erlaubt.
--  2. Mini-Aufgaben: neue Meldungsart „fact“ mit fester Antwortliste (z. B. „Toilette kostenlos: ja/nein“).
--     Speicherung wie alle Meldungen (ortsbezogen, Löschung nach 12 Monaten über den bestehenden Löschjob).
--  3. „Hier fehlt was“: Tabelle gaps mit NUR Art, Rasterzelle (ca. 500 × 500 m, im Browser gerundet) und Datum –
--     keine Geräte-Kennung, kein genauer Punkt, kein Text. Lesen nur im Supabase-Dashboard. Löschung nach 12 Monaten.

-- 1) Kategorien
alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('briefkasten','glas','papier','altkleider','sammelstelle','wertstoffhof','toilette','rastplatz','paketshop','packstation','geldautomat','ladesaeule','apotheke','tankstelle','parkride','wanderpark'));

-- 2) Mini-Aufgaben: Meldungsart „fact“ und feste Antworten
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check
  check (kind in ('status','hours','closed','gone','new','confirm','note','fact'));
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status is null or status in ('voll','halb','leer','sauber','ok','dreckig','defekt',
                                      'fee_no','fee_yes','wc_yes','wc_no','baby_yes','baby_no','times_ok'));

-- 3) „Hier fehlt was“
create table if not exists public.gaps (
  id bigint generated always as identity primary key,
  item text not null check (item in (
    'toilette','glas','papier','altkleider','briefkasten','geldautomat','packstation','sammelstelle','ladesaeule',
    'aed','trinkwasser','buecher','wickeln','sitzbank','fahrrad','anderes')),
  cell text not null check (cell ~ '^[0-9]{4,6}_[0-9]{3,5}$'),
  created_on date not null default current_date
);
alter table public.gaps enable row level security;
revoke all on public.gaps from anon, authenticated;
grant insert (item, cell) on public.gaps to anon;
drop policy if exists gaps_insert on public.gaps;
create policy gaps_insert on public.gaps for insert to anon with check (item is not null and cell is not null);

-- Schutz vor Massen-Einträgen: höchstens 5000 Wünsche pro Tag insgesamt
create or replace function public.gaps_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.gaps where created_on = current_date) >= 5000 then
    raise exception 'Zu viele Einträge heute';
  end if;
  new.created_on := current_date;
  return new;
end;
$$;
revoke all on function public.gaps_limit() from public, anon, authenticated;
drop trigger if exists gaps_limit on public.gaps;
create trigger gaps_limit before insert on public.gaps for each row execute function public.gaps_limit();

-- Löschung nach 12 Monaten (täglich 3:25 Uhr)
select cron.unschedule(jobid) from cron.job where jobname = 'nahfuchs-luecken-loeschen';
select cron.schedule('nahfuchs-luecken-loeschen', '25 3 * * *',
  $$delete from public.gaps where created_on < current_date - interval '12 months'$$);

-- Auswertung (nur im Dashboard, nicht öffentlich): Rasterzellen mit mindestens 3 Wünschen
create or replace view public.gaps_summary with (security_invoker = true) as
  select item, cell, count(*) as wuensche, max(created_on) as zuletzt
  from public.gaps
  where created_on > current_date - interval '12 months'
  group by item, cell
  having count(*) >= 3;
revoke all on public.gaps_summary from anon, authenticated;
