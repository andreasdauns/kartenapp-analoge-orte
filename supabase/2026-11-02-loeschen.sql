-- Nahfuchs: Löschfunktionen für den Datenschutz (2.11.2026)
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt:
--  1. Nutzer können auf der Info-Seite „Meine Meldungen löschen“ tippen (löscht alle Meldungen ihres Geräts).
--  2. Meldungen werden nach 12 Monaten automatisch gelöscht (täglich um 3:15 Uhr).

-- 1) Eigene Meldungen löschen (nur wer die geheime Geräte-Kennung kennt, also das Gerät selbst)
create or replace function public.delete_my_reports(dev text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if dev is null or length(dev) < 16 then return 0; end if;
  delete from public.reports where device = dev;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.delete_my_reports(text) from public;
grant execute on function public.delete_my_reports(text) to anon;

-- 2) Automatische Löschung nach 12 Monaten
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'nahfuchs-meldungen-loeschen';
select cron.schedule('nahfuchs-meldungen-loeschen', '15 3 * * *',
  $$delete from public.reports where created_at < now() - interval '12 months'$$);
