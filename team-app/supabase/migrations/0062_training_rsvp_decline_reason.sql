-- Absage-Grund (optional) für die Karte "Training" (Vorlage:
-- docs/design/tipoff-design/elements/04-training/PROMPT.md) — gleiches
-- Muster wie decline_reason/decline_note auf game_squad (Migration 0060),
-- nur mit eigenem Grund-Set ("Termin" statt "Urlaub" — Urlaub hat für
-- Training schon ein eigenes System, player_absences). Keine neue RPC
-- nötig: Spieler dürfen ihre eigene training_rsvps-Zeile laut Migration
-- 0005 schon direkt per Upsert schreiben.

alter table public.training_rsvps
  add column decline_reason text
    check (decline_reason in ('krank', 'arbeit_schule', 'termin', 'anderer_grund')),
  add column decline_note text;
