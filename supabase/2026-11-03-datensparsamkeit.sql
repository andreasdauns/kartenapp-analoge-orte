-- Nahfuchs: Datensparsamkeit und Spam-Schutz für Meldungen (3.11.2026)
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt:
--  1. Die Geräte-Kennung wird nicht mehr im Klartext gespeichert, sondern nur noch je Ort
--     verschlüsselt (SHA-256 aus Kennung + Ort). Meldungen eines Geräts lassen sich damit in der
--     Datenbank nicht mehr über verschiedene Orte hinweg verknüpfen (kein Bewegungsprofil).
--  2. Der Spam-Schutz zählt über eine Hilfstabelle, die nur einen Hash der Kennung enthält und
--     nach einer Stunde gelöscht wird. Zusätzlich: Grenzen je Ort und insgesamt pro Stunde.
--  3. Zustandsmeldungen (voll, geschlossen, Zeiten falsch) werden 30 Tage nach Ablauf gelöscht,
--     alle übrigen Meldungen weiterhin nach 12 Monaten.

-- Hilfsfunktion: Kennung je Ort (identisch zur Berechnung in der App, src/reports.js deviceKey)
create or replace function public.place_device_hash(dev text, place text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(dev || ':' || place, 'UTF8')), 'hex');
$$;
revoke all on function public.place_device_hash(text, text) from public, anon, authenticated;

-- 1) Hilfstabelle für den Spam-Schutz (nur Hash der Kennung, max. 1 Stunde)
create table if not exists public.report_rate (
  dev_hash text not null,
  at       timestamptz not null default now()
);
create index if not exists report_rate_idx on public.report_rate (dev_hash, at);
alter table public.report_rate enable row level security;
revoke all on public.report_rate from anon, authenticated;

-- 2) Neuer Schutz beim Anlegen einer Meldung (ersetzt reports_rate_limit)
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
  return new;
end;
$$;
revoke all on function public.reports_guard() from public, anon, authenticated;

drop trigger if exists reports_rate_limit on public.reports;
drop trigger if exists reports_guard on public.reports;
create trigger reports_guard before insert on public.reports for each row execute function public.reports_guard();
drop function if exists public.reports_rate_limit();

-- 3) Bestehende Meldungen umstellen (Klartext-Kennungen haben weniger als 64 Zeichen)
update public.reports set device = public.place_device_hash(device, place_id)
where char_length(device) <> 64;
drop index if exists public.reports_device_time_idx;

-- 4) Lesen: gespeicherte Kennung je Ort unverändert herausgeben (sie ist bereits verschlüsselt)
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
         r.device, r.created_at, r.expires_at
  from public.reports r, b
  where r.lat between b.s and b.n and r.lon between b.w and b.e
    and r.created_at > now() - interval '365 days'
  order by r.created_at desc
  limit 3000;
$$;
revoke all on function public.reports_in_box(double precision, double precision, double precision, double precision) from public;
grant execute on function public.reports_in_box(double precision, double precision, double precision, double precision) to anon;

-- 5) Eigene Meldungen löschen: nur wer die geheime Kennung des Geräts kennt
create or replace function public.delete_my_reports(dev text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if dev is null or char_length(dev) < 16 or char_length(dev) > 64 then return 0; end if;
  delete from public.reports where device = public.place_device_hash(dev, place_id);
  get diagnostics n = row_count;
  delete from public.report_rate where dev_hash = encode(sha256(convert_to('rate:' || dev, 'UTF8')), 'hex');
  return n;
end;
$$;
revoke all on function public.delete_my_reports(text) from public;
grant execute on function public.delete_my_reports(text) to anon;

-- 6) Löschfristen (täglich 3:15 Uhr) und stündliches Aufräumen der Hilfstabelle
select cron.unschedule(jobid) from cron.job where jobname = 'nahfuchs-meldungen-loeschen';
select cron.schedule('nahfuchs-meldungen-loeschen', '15 3 * * *',
  $$delete from public.reports
    where created_at < now() - interval '12 months'
       or (kind in ('status', 'closed', 'hours', 'note')
           and coalesce(expires_at, created_at) < now() - interval '30 days')$$);
select cron.unschedule(jobid) from cron.job where jobname = 'nahfuchs-spamschutz-aufraeumen';
select cron.schedule('nahfuchs-spamschutz-aufraeumen', '7 * * * *',
  $$delete from public.report_rate where at < now() - interval '1 hour'$$);

-- 7) Rechte prüfen: anon darf Meldungen nur anlegen, nicht lesen/ändern/löschen
revoke select, update, delete on public.reports from anon, authenticated;
grant insert on public.reports to anon;

-- 8) Rechte auf das Nötigste beschränken (Supabase-Standardrechte entfernen)
revoke truncate, references, trigger on public.reports from anon, authenticated;
revoke all on public.wishes from authenticated;
revoke truncate, references, trigger on public.wishes from anon;
revoke all on function public.wishes_limit() from public, anon, authenticated;
-- doppelter alter Löschjob (365 Tage) wird durch 'nahfuchs-meldungen-loeschen' ersetzt
select cron.unschedule(jobid) from cron.job where jobname = 'meldungen-aufraeumen';

-- 9) Hinweise des Supabase Security Advisors: angemeldete Nutzer gibt es nicht → Rechte entziehen;
--    Insert-Regeln nicht mehr pauschal „true“
revoke execute on function public.delete_my_reports(text) from authenticated;
revoke execute on function public.reports_in_box(double precision, double precision, double precision, double precision) from authenticated;
revoke insert on public.reports from authenticated;
drop policy if exists "Meldungen anlegen" on public.reports;
create policy "Meldungen anlegen" on public.reports for insert to anon
  with check (message is null and char_length(place_id) between 1 and 80 and device is not null);
drop policy if exists wishes_insert on public.wishes;
create policy wishes_insert on public.wishes for insert to anon with check (item is not null);
-- Bewusst offen (Funktion der App): anon darf reports_in_box und delete_my_reports aufrufen.
