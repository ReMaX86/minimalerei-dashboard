-- Betrachter (z. B. Abteilungsleiter) bekommen Zugriff auf Spiele, Team und
-- das Live-Stats-Tracking — bisher sahen sie nur Startseite und
-- Kampfgericht. Der Zugriff auf /spiele und /team ist reine Client-Routing-
-- Sache (App.tsx/BottomNav.tsx), aber "Tracking übernehmen" braucht auch
-- serverseitig grünes Licht: die betroffenen Policies/RPCs prüften bisher
-- nur `is_trainer() or current_player_id() is not null`, Betrachter fielen
-- also durch. Analog zu is_trainer() (Migration 0006) bzw. current_player_id
-- überall dort ergänzt, wo während des Live-Trackings geschrieben wird.
--
-- claim_stat_session/heartbeat_stat_session/release_stat_session (Migration
-- 0028) brauchten keine Änderung — die prüfen von Anfang an nur
-- `auth.uid() is not null`, ohne Rollen-Einschränkung.

drop policy "game_stat_events write" on public.game_stat_events;
create policy "game_stat_events write" on public.game_stat_events for all
  using (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null);

drop policy "game_court_state write" on public.game_court_state;
create policy "game_court_state write" on public.game_court_state for all
  using (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null);

drop policy "game_player_numbers write" on public.game_player_numbers;
create policy "game_player_numbers write" on public.game_player_numbers for all
  using (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null)
  with check (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null);

create or replace function public.finalize_game_stats(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null) then
    raise exception 'not_authorized';
  end if;

  update public.games set stats_finalized_at = now() where id = p_game_id;
  delete from public.game_stat_sessions where game_id = p_game_id;
end;
$$;

-- Live-Ticker-Push beim Viertelwechsel (Migration 0042) soll auch feuern,
-- wenn ein Betrachter trackt — sonst würde das nur unbemerkt fehlschlagen
-- (der Client behandelt einen Fehler hier bewusst still, siehe
-- GameStatsTracker.tsx selectQuarter()).
create or replace function public.announce_quarter_score(p_game_id uuid, p_quarter smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_trainer() or public.current_player_id() is not null or public.current_viewer_id() is not null) then
    raise exception 'not_authorized';
  end if;

  update public.games
    set last_announced_quarter = p_quarter
    where id = p_game_id and p_quarter > last_announced_quarter;

  return found;
end;
$$;
