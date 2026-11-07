-- Nahfuchs: Funde der KI-Komplettprüfung vom 7.11.2026 (Datenbank)
-- Einmal komplett in Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Bewirkt:
--  1. Ablaufdatum von Meldungen wird serverseitig begrenzt: Zustandsmeldungen höchstens 3 Tage
--     (in der App 12–48 Stunden), „vorübergehend geschlossen“ höchstens 8 Tage (App: 7). Ein manipulierter
--     Client kann damit keine „voll/geschlossen“-Meldung mehr monatelang aktuell halten.
--  2. Index auf created_at: Die Spam-Zählung „Meldungen der letzten Stunde“ liest nicht mehr die ganze Tabelle.

-- 1) Ablaufdatum begrenzen
create or replace function public.reports_expiry_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Nur begrenzen, nie neu setzen: Zustand höchstens 3 Tage (App: 12–48 h), „vorübergehend geschlossen“ höchstens 8 Tage (App: 7 Tage)
  if new.expires_at is not null then
    new.expires_at := least(new.expires_at, now() + case when new.kind = 'closed' then interval '8 days' else interval '3 days' end);
    if new.expires_at < now() then new.expires_at := now() + interval '1 hour'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.reports_expiry_cap() from public, anon, authenticated;
drop trigger if exists reports_expiry_cap on public.reports;
create trigger reports_expiry_cap before insert on public.reports
  for each row execute function public.reports_expiry_cap();

-- 2) Index für die Zählung je Stunde
create index if not exists reports_created_idx on public.reports (created_at);
