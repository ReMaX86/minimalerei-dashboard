-- Absage-Grund (optional) für die Karte "Nächstes Spiel" (Vorlage:
-- docs/design/tipoff-design/elements/02-naechstes-spiel/) — und Korrektur
-- an respond_to_squad(): "Doch dabei?" nach einer Absage war bisher nicht
-- möglich, weil eine Absage is_selected auf false setzt, die Funktion aber
-- is_selected = true als Vorbedingung für JEDES Update verlangte (Zu- und
-- Absage liefen über dieselbe WHERE-Klausel) — ein Spieler, der schon
-- abgesagt hatte, konnte über respond_to_squad(true) nie mehr zusagen.

alter table public.game_squad
  add column decline_reason text
    check (decline_reason in ('krank', 'arbeit_schule', 'urlaub', 'anderer_grund')),
  add column decline_note text;

create or replace function public.respond_to_squad(
  p_game_id uuid,
  p_confirmed boolean,
  p_decline_reason text default null,
  p_decline_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := public.current_player_id();
begin
  if v_player_id is null then
    raise exception 'not_a_player';
  end if;

  -- is_selected = true (aktuell nominiert) ODER confirmation = 'declined'
  -- (zuvor selbst abgesagt, jetzt "Doch dabei?") — nicht aber ein Spieler,
  -- den der Trainer schlicht nicht nominiert hat (is_selected = false,
  -- confirmation = 'pending'): der soll sich über diese Funktion nicht
  -- selbst in den Kader holen können.
  update public.game_squad
    set confirmation = case when p_confirmed then 'confirmed' else 'declined' end,
        is_selected = p_confirmed,
        decline_reason = case when p_confirmed then null else p_decline_reason end,
        decline_note = case when p_confirmed then null else p_decline_note end
    where game_id = p_game_id and player_id = v_player_id
      and (is_selected = true or confirmation = 'declined');

  if not found then
    raise exception 'not_in_squad';
  end if;

  if not p_confirmed then
    update public.games set squad_decline_pending = true where id = p_game_id;
  end if;
end;
$$;
