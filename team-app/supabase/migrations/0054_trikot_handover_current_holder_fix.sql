-- Regression aus Migration 0052: beim Hinzufügen von trikot_handover_log
-- wurde confirm_trikot_handover() komplett neu geschrieben und dabei die
-- "update trikot_sets set current_holder_id = ..., since = ..."-Zeile aus
-- der ursprünglichen Fassung (Migration 0001/0017) versehentlich weggelassen.
-- Folge: jede Bestätigung landete korrekt in trikot_wash_log und im neuen
-- trikot_handover_log, aber die "Wer hat die Trikots?"-Anzeige (getrieben
-- von trikot_sets.current_holder_id/since) blieb auf dem alten Stand
-- stehen bzw. zeigte "Niemand", live aufgefallen nach einer Übergabe an
-- einen Ersatz-Wäscher. Fix: die fehlende Zeile wieder ergänzt, Rest der
-- Funktion (inkl. Log-Eintrag) unverändert.
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

  update public.trikot_sets
  set current_holder_id = p_player_id, since = current_date
  where id = p_set_id;

  if p_game_id is not null then
    insert into public.trikot_handover_log (game_id, set_id, suggested_player_id, confirmed_player_id, changed_by_label)
    values (p_game_id, p_set_id, p_suggested_player_id, p_player_id, public.current_actor_label());
  end if;
end;
$$;
