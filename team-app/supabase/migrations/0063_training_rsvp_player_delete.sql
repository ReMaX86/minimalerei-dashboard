-- "Nochmal auf den gedrückten Knopf tippen nimmt die Antwort zurück"
-- (Karte "Training", PROMPT.md "Frist") — dafür fehlte eine Möglichkeit
-- für Spieler, ihre eigene Zu-/Absage wieder zu löschen (Migration 0005
-- kannte nur player insert/update own, kein delete own; nur Trainer
-- durften über die "write trainer"-Policy überhaupt löschen).

create policy "training_rsvps player delete own" on public.training_rsvps for delete
  using (player_id = public.current_player_id());
