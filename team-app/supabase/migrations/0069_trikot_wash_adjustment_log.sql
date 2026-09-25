-- Element 20 "Admin · Trikots": der Waschzähler ist bisher rein abgeleitet
-- (COUNT der Zeilen in trikot_wash_log pro Spieler, siehe naechsterSpieler()
-- in rotation.ts) — es gibt keine speicherbare Zahl, die sich direkt
-- korrigieren ließe. Für "Zähler einzeln ändern" und "Stände übertragen"
-- (Saisonstart mitten in der Saison) braucht es eine Möglichkeit, den
-- Zähler manuell zu verschieben, ohne eine echte Wäsche vorzutäuschen (die
-- an einem konkreten Spiel hängt, siehe trikot_wash_log.game_id) und ohne
-- den bestehenden, getesteten trikot_wash_log-Mechanismus anzufassen.
--
-- Eigene Tabelle, analog zu trikot_transfer_log (Migration 0048): ein
-- Delta statt eines absoluten Stands, damit mehrere Anpassungen sich
-- korrekt aufaddieren und der Verlauf jede einzelne Änderung mit Grund
-- nachvollziehbar hält (kein "letzter Wert gewinnt"). Der tatsächliche
-- Waschzähler ergibt sich künftig aus washLog.length + Summe(delta) —
-- siehe Anpassungen in trikots.ts/rotation.ts-Aufrufern.
create table public.trikot_wash_adjustment_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  delta int not null check (delta <> 0),
  reason text,
  created_at timestamptz not null default now()
);

create index trikot_wash_adjustment_log_player_id_idx on public.trikot_wash_adjustment_log (player_id);

alter table public.trikot_wash_adjustment_log enable row level security;

-- Gleiches Muster wie trikot_wash_log/trikot_transfer_log: für alle
-- angemeldeten Nutzer lesbar (Verlauf-Anzeige), Schreibzugriff nur für den
-- Trainer — anders als eine Übergabe/Wäsche ist eine Anpassung ausschließlich
-- ein Admin-Werkzeug, kein Spieler-Self-Service, daher kein zusätzlicher
-- "eigener Datensatz"-Fall wie bei confirm_trikot_handover().
create policy "trikot_wash_adjustment_log select" on public.trikot_wash_adjustment_log for select
  using (auth.uid() is not null);
create policy "trikot_wash_adjustment_log write trainer" on public.trikot_wash_adjustment_log for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- reset_trikots() (Migration 0004/0048/0067) räumt jetzt auch die neue
-- Tabelle mit auf — sonst würde eine "Rotation zurücksetzen" nicht mehr
-- wirklich auf 0 zurücksetzen, sobald mindestens eine Anpassung existiert.
create or replace function public.reset_trikots()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then
    raise exception 'not_authorized';
  end if;

  delete from public.trikot_wash_log where true;
  delete from public.trikot_transfer_log where true;
  delete from public.trikot_ask_resolutions where true;
  delete from public.trikot_wash_adjustment_log where true;
  update public.trikot_sets set current_holder_id = null, since = null where true;
end;
$$;
