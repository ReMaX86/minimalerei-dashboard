-- Endstand eintragen — Karte "Letztes Ergebnis" (Vorlage:
-- docs/design/tipoff-design/elements/03-letztes-ergebnis/PROMPT.md):
-- "Jede·r mit Zugang kann das Ergebnis nachtragen", nicht nur der Trainer.
-- games ist bisher trainer-only beschreibbar ("games write trainer",
-- Migration 0001) — GamesAdmin.tsx "Endstand nachtragen" bleibt für
-- Trainer/Admin unverändert der direkte Table-Write; diese Funktion ist
-- der zusätzliche, engere Weg für alle anderen (Spieler, Betrachter).

create or replace function public.report_final_score(
  p_game_id uuid,
  p_score_us integer,
  p_score_opponent integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_score_us < 0 or p_score_opponent < 0 then
    raise exception 'invalid_score';
  end if;

  -- Nur eintragen, solange noch kein Ergebnis vorliegt — nie ein bereits
  -- (live oder manuell) finalisiertes Spiel überschreiben.
  update public.games
    set final_score_us = p_score_us,
        final_score_opponent = p_score_opponent,
        stats_finalized_at = now()
    where id = p_game_id
      and stats_finalized_at is null;

  if not found then
    raise exception 'already_finalized_or_not_found';
  end if;
end;
$$;
