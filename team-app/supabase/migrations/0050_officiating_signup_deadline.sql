-- Kampfgericht: Spieler-Selbstverwaltung mit Meldefrist + Änderungs-Log.
--
-- Bisher (Migration 0001) war "Ich übernehme" für Spieler zwar möglich,
-- ein Rückgängigmachen ("Abwählen") aber bewusst nie erlaubt ("das ist der
-- Job des Trainers", siehe Kommentar dort) — genau das wurde vom Nutzer
-- jetzt als zu starr empfunden: Spieler sollen sich bis zu einer vom
-- Trainer festgelegten Meldefrist noch frei um- und abmelden können, erst
-- danach werden die Zuteilungen "fix" (nur noch Trainer/Kapitän können sie
-- per Hand ändern, z. B. nachdem sich zwei Spieler privat per WhatsApp auf
-- einen Tausch geeinigt haben). Damit trotz dieser Freiheit weiterhin
-- nachvollziehbar bleibt, wer wann was geändert hat, protokolliert jede
-- der drei Wege (Selbst-Übernahme, Selbst-Abwahl, Trainer/Kapitän-Zuteilung)
-- ab jetzt einen Eintrag in officiating_assignment_log.
--
-- officiating_signup_deadline ist bewusst nullable: kein gesetztes Datum
-- bedeutet "Selbstverwaltung zeitlich unbegrenzt möglich" (einfachste
-- Regel, konsistent mit anderen optionalen Fristen wie
-- officiating_games.game_time).
alter table public.reminder_settings
  add column officiating_signup_deadline date;

-- Ein einzelner, kompakter Änderungsverlauf für alle drei Wege oben. Je ein
-- Eintrag pro Änderung (nicht pro Task-Endzustand), damit auf der
-- Kampfgericht-Seite eine echte Historie ("wer hat wann was geändert")
-- angezeigt werden kann statt nur des aktuellen Stands. from/to sind
-- nullable, weil sowohl "offen -> Spieler X" (Übernahme) als auch
-- "Spieler X -> offen" (Abwahl) vorkommen.
create table public.officiating_assignment_log (
  id uuid primary key default gen_random_uuid(),
  officiating_task_id uuid not null references public.officiating_tasks (id) on delete cascade,
  from_player_id uuid references public.players (id) on delete set null,
  to_player_id uuid references public.players (id) on delete set null,
  changed_by_label text not null,
  created_at timestamptz not null default now()
);

create index officiating_assignment_log_task_id_idx on public.officiating_assignment_log (officiating_task_id);
create index officiating_assignment_log_created_at_idx on public.officiating_assignment_log (created_at desc);

alter table public.officiating_assignment_log enable row level security;

-- Lesbar für alle angemeldeten Nutzer (Verlauf-Anzeige auf der
-- Kampfgericht-Seite). Kein Schreib-Policy nötig/gewünscht — jeder Eintrag
-- entsteht ausschließlich als Nebeneffekt der drei security-definer RPCs
-- unten, nie durch einen direkten Client-Write.
create policy "officiating_assignment_log select" on public.officiating_assignment_log for select
  using (auth.uid() is not null);

-- Liefert einen lesbaren "wer war das"-Text fürs Log: Trainername mit
-- Rollenhinweis (ein Trainer handelt nie "als Spieler"), sonst einfach der
-- Spielername (auch wenn der Spieler zugleich Kapitän ist — der Log-Eintrag
-- beschreibt die Handlung, nicht ob die Person das Recht dazu qua Amt
-- hatte). Selbes Auflösungsmuster wie admin_push_subscribers() (Migration
-- 0047): erst Trainer, dann current_player_id().
create or replace function public.current_actor_label()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  select name into v_label from public.trainers where id = auth.uid();
  if v_label is not null then
    return v_label || ' (Trainer)';
  end if;

  select name into v_label from public.players where id = public.current_player_id();
  if v_label is not null then
    return v_label;
  end if;

  return 'Unbekannt';
end;
$$;

-- Ersetzt die bisherige Fassung (Migration 0001): zusätzlich zur
-- bestehenden "nur offene Slots"-Prüfung jetzt auch die Meldefrist prüfen
-- und den Vorgang protokollieren.
create or replace function public.claim_officiating_task(p_task_id uuid)
returns public.officiating_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_task public.officiating_tasks;
  v_deadline date;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player';
  end if;

  select officiating_signup_deadline into v_deadline from public.reminder_settings where id = 1;
  if v_deadline is not null and current_date > v_deadline then
    raise exception 'deadline_passed';
  end if;

  update public.officiating_tasks
  set assigned_player_id = v_player_id
  where id = p_task_id and assigned_player_id is null
  returning * into v_task;

  if v_task.id is null then
    raise exception 'slot_taken';
  end if;

  insert into public.officiating_assignment_log (officiating_task_id, from_player_id, to_player_id, changed_by_label)
  values (p_task_id, null, v_player_id, public.current_actor_label());

  return v_task;
end;
$$;

-- Neu: das bisher fehlende Gegenstück zu claim_officiating_task() — ein
-- Spieler gibt eine eigene, noch nicht fixierte Zuteilung wieder frei
-- ("Abwählen"). Nur die eigene Aufgabe, nur vor der Meldefrist; danach
-- (oder wenn die Aufgabe gar nicht der eigenen entspricht) schlägt die RPC
-- fehl und die Änderung muss über Trainer/Kapitän laufen.
create or replace function public.release_officiating_task(p_task_id uuid)
returns public.officiating_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_task public.officiating_tasks;
  v_deadline date;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player';
  end if;

  select officiating_signup_deadline into v_deadline from public.reminder_settings where id = 1;
  if v_deadline is not null and current_date > v_deadline then
    raise exception 'deadline_passed';
  end if;

  update public.officiating_tasks
  set assigned_player_id = null
  where id = p_task_id and assigned_player_id = v_player_id
  returning * into v_task;

  if v_task.id is null then
    raise exception 'not_your_task';
  end if;

  insert into public.officiating_assignment_log (officiating_task_id, from_player_id, to_player_id, changed_by_label)
  values (p_task_id, v_player_id, null, public.current_actor_label());

  return v_task;
end;
$$;

-- Neu: zentraler Weg für Trainer/Kapitän/Co-Kapitän, eine Aufgabe manuell
-- zuzuteilen oder wieder zu öffnen (p_player_id = null) — unabhängig von
-- der Meldefrist (das ist ja gerade der Zweck: nach Fristablauf laufen
-- Änderungen nur noch hier drüber). Ersetzt die bisherigen direkten
-- .update()-Aufrufe in OfficiatingAdmin.tsx und Kampfgericht.tsx, damit
-- jede Änderung protokolliert wird und Kapitäne (die laut
-- is_captain_or_co_captain() nicht automatisch "is_trainer()" sind) dieselbe
-- Möglichkeit bekommen wie der Trainer.
create or replace function public.admin_assign_officiating_task(p_task_id uuid, p_player_id uuid)
returns public.officiating_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_player_id uuid;
  v_task public.officiating_tasks;
begin
  if not (public.is_trainer() or public.is_captain_or_co_captain()) then
    raise exception 'not_authorized';
  end if;

  select assigned_player_id into v_from_player_id
  from public.officiating_tasks
  where id = p_task_id;

  update public.officiating_tasks
  set assigned_player_id = p_player_id
  where id = p_task_id
  returning * into v_task;

  if v_task.id is null then
    raise exception 'task_not_found';
  end if;

  insert into public.officiating_assignment_log (officiating_task_id, from_player_id, to_player_id, changed_by_label)
  values (p_task_id, v_from_player_id, p_player_id, public.current_actor_label());

  return v_task;
end;
$$;

-- Die bisherige RLS-Policy für die Direkt-Übernahme eines offenen Slots
-- entfällt: alle Spieler-Änderungen laufen ab jetzt ausschließlich über
-- claim_officiating_task()/release_officiating_task() oben (security
-- definer, prüfen Meldefrist + schreiben das Log) statt über einen
-- direkten Tabellen-Write, der beides umgehen könnte.
drop policy if exists "officiating_tasks claim open slot" on public.officiating_tasks;
