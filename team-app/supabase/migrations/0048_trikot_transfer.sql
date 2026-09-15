-- Direkte Übergabe eines Trikot-Sets an einen anderen Spieler, unabhängig
-- vom normalen Wasch-Rhythmus (z. B. weil der aktuelle Halter beim nächsten
-- Spiel nicht dabei ist und die Trikots stattdessen schon beim Training
-- an jemand anderen weitergegeben hat). Bewusst eine eigene, separate
-- Tabelle statt trikot_wash_log mitzunutzen: eine Übergabe ist kein
-- "Waschen" und darf den Wasch-Zähler (siehe naechsterSpieler() in
-- rotation.ts, der aus trikot_wash_log-Zeilen zählt) nicht erhöhen — sonst
-- würde die Rotation für einen Spieler weiterlaufen, der das Set nur kurz
-- weitergereicht, aber nie wirklich gewaschen hat.
create table public.trikot_transfer_log (
  id uuid primary key default gen_random_uuid(),
  set_id text not null references public.trikot_sets (id) on delete cascade,
  from_player_id uuid references public.players (id) on delete set null,
  to_player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index trikot_transfer_log_set_id_idx on public.trikot_transfer_log (set_id);

alter table public.trikot_transfer_log enable row level security;

-- Gleiches Muster wie trikot_wash_log: für alle angemeldeten Nutzer lesbar
-- (Verlauf/"Übergeben von"-Anzeige), Direktschreibzugriff nur für Trainer —
-- der reguläre Weg läuft über transfer_trikot_set() unten.
create policy "trikot_transfer_log select" on public.trikot_transfer_log for select
  using (auth.uid() is not null);
create policy "trikot_transfer_log write trainer" on public.trikot_transfer_log for all
  using (public.is_trainer())
  with check (public.is_trainer());

-- Analog zu confirm_trikot_handover() (Migration 0001/0017): nur der
-- aktuelle Halter des Sets selbst, ein Captain/Co-Captain oder der Trainer
-- dürfen die Übergabe auslösen. Anders als beim Wasch-Flow ohne Spiel-
-- Bezug (spielt jederzeit, nicht nur rund um einen bestimmten Termin).
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

-- reset_trikots() (Migration 0004) löscht bisher nur trikot_wash_log — ohne
-- diese Ergänzung blieben Übergaben nach einem Reset stehen und der
-- "Übergeben von"-Hinweis (latestTransferFrom() in trikots.ts) würde unter
-- einem frisch auf "Niemand" zurückgesetzten Set fälschlich weiter eine
-- alte Übergabe anzeigen.
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
  update public.trikot_sets set current_holder_id = null, since = null where true;
end;
$$;
