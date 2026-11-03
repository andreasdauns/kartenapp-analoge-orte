-- Nahfuchs: Wünsche und Rückmeldungen (3.11.2026)
-- Nur feste Auswahlpunkte, kein Text, keine Geräte-Kennung, keine Position. Lesen nur im Supabase-Dashboard.
create table if not exists public.wishes (
  id bigint generated always as identity primary key,
  item text not null check (item in (
    'aed','trinkwasser','buecher','fahrrad','wickeln','spielplatz','hundekot','wohnmobil',
    'ort_fehlt','daten_falsch','langsam','standort','bedienung','gefaellt')),
  created_on date not null default current_date
);
alter table public.wishes enable row level security;
revoke all on public.wishes from anon, authenticated;
grant insert (item) on public.wishes to anon;
drop policy if exists wishes_insert on public.wishes;
create policy wishes_insert on public.wishes for insert to anon with check (true);

-- Löschung nach 12 Monaten (täglich 3:20 Uhr)
select cron.unschedule(jobid) from cron.job where jobname = 'nahfuchs-wuensche-loeschen';
select cron.schedule('nahfuchs-wuensche-loeschen', '20 3 * * *',
  $$delete from public.wishes where created_on < current_date - interval '12 months'$$);

-- Schutz vor Massen-Einträgen: höchstens 5000 Einträge pro Tag insgesamt
create or replace function public.wishes_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.wishes where created_on = current_date) >= 5000 then
    raise exception 'Zu viele Einträge heute';
  end if;
  new.created_on := current_date;
  return new;
end;
$$;
drop trigger if exists wishes_limit on public.wishes;
create trigger wishes_limit before insert on public.wishes for each row execute function public.wishes_limit();
