-- Trikot-Übergabe-Protokoll: hält für jede bestätigte Übergabe fest, wer
-- laut Rotation vorgeschlagen war UND wer am Ende tatsächlich bestätigt
-- hat. Anlass: live aufgefallen, dass sich nachträglich nicht mehr
-- rekonstruieren ließ, ob ein vorgeschlagener Spieler über "Kann nicht"
-- abgelehnt und stattdessen wer anders gewählt wurde, oder ob die
-- Rotation selbst einen falschen Vorschlag gemacht hatte — trikot_wash_log
-- speichert bisher nur das Endergebnis, nicht den Weg dahin. Analog zu
-- officiating_assignment_log (Migration 0050): reiner Nebeneffekt der
-- security-definer RPC unten, kein Client-Direktschreibzugriff, deshalb
-- auch keine Schreib-Policy nötig.
create table public.trikot_handover_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  set_id text not null references public.trikot_sets (id) on delete cascade,
  suggested_player_id uuid references public.players (id) on delete set null,
  confirmed_player_id uuid not null references public.players (id) on delete cascade,
  changed_by_label text not null,
  created_at timestamptz not null default now()
);

create index trikot_handover_log_game_id_idx on public.trikot_handover_log (game_id);

alter table public.trikot_handover_log enable row level security;

create policy "trikot_handover_log select" on public.trikot_handover_log for select
  using (auth.uid() is not null);

-- Ersetzt die bisherige Fassung (Migration 0017): zusätzlicher Parameter
-- p_suggested_player_id (vom Client mitgegeben, da die Rotationslogik
-- clientseitig in rotation.ts/naechsterSpieler() lebt, nicht in SQL) plus
-- der neue Log-Eintrag. p_game_id bleibt nullable wie bisher (Bestandsschutz
-- für eventuelle Aufrufe ohne Spielbezug) — der Log-Eintrag selbst braucht
-- aber zwingend ein Spiel, daher nur bei gesetztem p_game_id geschrieben.
create or replace function public.confirm_trikot_handover(
  p_set_id text,
  p_player_id uuid,
  p_game_id uuid default null,
  p_suggested_player_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_trainer()
    or public.current_player_id() = p_player_id
    or public.is_captain_or_co_captain()
  ) then
    raise exception 'not_authorized';
  end if;

  insert into public.trikot_wash_log (set_id, player_id, game_id)
  values (p_set_id, p_player_id, p_game_id);

  if p_game_id is not null then
    insert into public.trikot_handover_log (game_id, set_id, suggested_player_id, confirmed_player_id, changed_by_label)
    values (p_game_id, p_set_id, p_suggested_player_id, p_player_id, public.current_actor_label());
  end if;
end;
$$;
