-- Element 13 "Trikots": die Blätter "Wer hat den Satz jetzt?" und "Wer hat
-- das Set dann?" (nach "Nein" auf die Nachfrage) brauchen eine dritte
-- Zielperson zusätzlich zu den Teammitgliedern — "In der Halle abgelegt"
-- (niemand hat den Satz gerade). transfer_trikot_set() (Migration 0048)
-- verlangte bisher ein Pflicht-Ziel (to_player_id not null) — Spalte wird
-- nullable, die Funktion selbst braucht dafür keine Änderung (reicht
-- p_to_player_id einfach durch).
alter table public.trikot_transfer_log alter column to_player_id drop not null;

-- Zusätzlich: bisher durfte nur der aktuelle Halter/Trainer/Captain
-- übergeben — ein Satz, der schon "in der Halle" liegt (current_holder_id
-- ist null), hatte dadurch keinen Weg, von einer normalen Person
-- übernommen zu werden ("Ich hab ihn" lief für alle außer Trainer/Captain
-- ins Leere). Erweiterung: ist das Set gerade niemandem zugeordnet, darf
-- jede angemeldete Person es sich zuweisen.
create or replace function public.transfer_trikot_set(p_set_id text, p_to_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_player_id uuid;
begin
  select current_holder_id into v_from_player_id
  from public.trikot_sets
  where id = p_set_id;

  if not (
    public.is_trainer()
    or (v_from_player_id is not null and public.current_player_id() = v_from_player_id)
    or public.is_captain_or_co_captain()
    or (v_from_player_id is null and public.current_player_id() is not null)
  ) then
    raise exception 'not_authorized';
  end if;

  insert into public.trikot_transfer_log (set_id, from_player_id, to_player_id)
  values (p_set_id, v_from_player_id, p_to_player_id);

  update public.trikot_sets
  set current_holder_id = p_to_player_id, since = current_date
  where id = p_set_id;
end;
$$;

-- "Nein" auf die Nachfrage zum letzten Spiel setzt laut PROMPT.md NUR den
-- Besitz (transfer_trikot_set-Semantik, kein Waschzähler, Vorschlag fürs
-- nächste Spiel bleibt unberührt) — schreibt also NICHT in trikot_wash_log,
-- wodurch pendingWasherFor() (trikots.ts) die Nachfrage nie als beantwortet
-- erkennen würde (die rote Karte bliebe für immer stehen). Eigene, schlanke
-- Tabelle statt trikot_wash_log zweckzuentfremden — hält nur fest, dass die
-- Nachfrage zu diesem Spiel+Satz beantwortet wurde.
create table public.trikot_ask_resolutions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  set_id text not null references public.trikot_sets (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, set_id)
);

alter table public.trikot_ask_resolutions enable row level security;

create policy "trikot_ask_resolutions select" on public.trikot_ask_resolutions for select
  using (auth.uid() is not null);

-- Kombiniert Übergabe + Markierung "Nachfrage beantwortet" atomar in einem
-- Aufruf (statt zwei Client-Roundtrips, die bei einem Fehler zwischen den
-- beiden Schritten einen inkonsistenten Zustand hinterlassen könnten).
-- Gleiche Berechtigungsregel wie transfer_trikot_set() oben.
create or replace function public.resolve_trikot_ask_no(p_game_id uuid, p_set_id text, p_to_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_player_id uuid;
begin
  select current_holder_id into v_from_player_id
  from public.trikot_sets
  where id = p_set_id;

  if not (
    public.is_trainer()
    or (v_from_player_id is not null and public.current_player_id() = v_from_player_id)
    or public.is_captain_or_co_captain()
    or (v_from_player_id is null and public.current_player_id() is not null)
  ) then
    raise exception 'not_authorized';
  end if;

  insert into public.trikot_transfer_log (set_id, from_player_id, to_player_id)
  values (p_set_id, v_from_player_id, p_to_player_id);

  update public.trikot_sets
  set current_holder_id = p_to_player_id, since = current_date
  where id = p_set_id;

  insert into public.trikot_ask_resolutions (game_id, set_id)
  values (p_game_id, p_set_id)
  on conflict (game_id, set_id) do nothing;
end;
$$;

-- reset_trikots() (Migration 0004/0048) räumt jetzt auch die neue Tabelle
-- mit auf — sonst bliebe nach einem Reset eine "Nachfrage beantwortet"-
-- Markierung für ein Spiel stehen, dessen Wasch-/Übergabe-Verlauf bereits
-- gelöscht wurde.
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
  update public.trikot_sets set current_holder_id = null, since = null where true;
end;
$$;
