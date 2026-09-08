-- Skill-Tags umbenannt (deutscher Name + Spitzname, z. B. "3-Point
-- (Sniper)" statt "Distanzwurf") und um passende Icons ergänzt (rein
-- clientseitig, siehe SKILL_ICONS in src/types/database.ts) sowie einen
-- neuen Skill "Fastbreak (Turbo)" für schnelle Spieler ergänzt, die im
-- Gegenstoß stark sind. players.skills ist eine reine text[]-Spalte ohne
-- Constraint (Migration 0014) — bereits vergebene Tags mit den alten
-- Namen werden hier auf die neuen umbenannt, damit kein Spieler beim
-- Umstieg unbemerkt eine bereits gesetzte Stärke verliert.

update public.players
set skills = (
  select array_agg(
    case skill
      when 'Distanzwurf' then '3-Point (Sniper)'
      when 'Verteidigung' then 'Verteidigung (Defense Monster)'
      when 'Athletik' then 'Athletik (Highflyer)'
      when 'Passspiel' then 'Passspiel (Playmaker)'
      when 'Rebound' then 'Rebound (Glas-Cleaner)'
      else skill
    end
  )
  from unnest(skills) as skill
)
where skills && array['Distanzwurf', 'Verteidigung', 'Athletik', 'Passspiel', 'Rebound'];
