-- Element 22 "Meldungen": jede Meldung bekommt eine Sorte (Hinweis/Wichtig/
-- Dringend), die Laufzeit, Aussehen und Push festlegt, statt eines reinen
-- "angeheftet"-Flags. Dazu Lesestatus pro Spieler, damit der Trainer sieht,
-- wer schon bestätigt hat, und eine Meldung für einen Spieler nach dem
-- Bestätigen verschwindet.
--
-- pinned (bool, "bleibt oben") wird durch kind ersetzt — kind übernimmt
-- dieselbe Aufgabe vollständig (dringend/wichtig bleiben ohnehin oben, bis
-- sie beendet werden) und ist zugleich präziser (drei Stufen statt zwei).
-- Bestehende Zeilen: pinned=true -> 'wichtig', pinned=false -> 'hinweis'.
alter table public.announcements add column kind text;
update public.announcements set kind = case when pinned then 'wichtig' else 'hinweis' end;
alter table public.announcements alter column kind set not null;
alter table public.announcements add constraint announcements_kind_check check (kind in ('hinweis', 'wichtig', 'dringend'));
alter table public.announcements alter column kind set default 'hinweis';
alter table public.announcements drop column pinned;

-- Ablauf: nur beim Laden filtern (kein geplanter Job, siehe PROMPT.md
-- Rückfrage 1) — expires_at wird beim Anlegen aus der Sorte berechnet
-- (Hinweis +7 Tage, Wichtig +14 Tage, Dringend NULL = läuft nie automatisch
-- ab) und bleibt beim Bearbeiten relativ zum ursprünglichen created_at,
-- nicht zur Bearbeitungszeit. ended_at wird gesetzt, wenn der Trainer aktiv
-- "Beenden" klickt.
alter table public.announcements add column expires_at timestamptz;
alter table public.announcements add column ended_at timestamptz;

-- Ob beim Veröffentlichen ein Push angefordert wurde (Schalter im Formular)
-- — bei 'dringend' immer true, sonst je nach Schalterstellung. Der
-- bestehende, von Hand angelegte Datenbank-Trigger (siehe README "Push-
-- Benachrichtigungen") feuert weiterhin bei JEDEM Insert und schickt die
-- volle Zeile inkl. dieser Spalte mit — api/notify.ts entscheidet anhand
-- von push_requested/kind, ob wirklich verschickt wird, statt dass jede
-- neue Meldung ungefragt an alle geht.
alter table public.announcements add column push_requested boolean not null default false;

-- Lesestatus pro Spieler: eine Zeile pro bestätigter Meldung. Analog zu
-- bestehenden Log-Tabellen wie training_rsvps — Schreibzugriff nur über die
-- RPC unten (ein Spieler bestätigt immer nur sich selbst), Trainer dürfen
-- zum Zählen alles lesen, ein Spieler nur seine eigenen Zeilen (braucht er,
-- um "schon von mir bestätigt" clientseitig auszufiltern).
create table public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (announcement_id, player_id)
);

create index announcement_reads_announcement_id_idx on public.announcement_reads (announcement_id);
create index announcement_reads_player_id_idx on public.announcement_reads (player_id);

alter table public.announcement_reads enable row level security;

create policy "announcement_reads select" on public.announcement_reads for select
  using (public.is_trainer() or player_id = public.current_player_id());

-- Kein direkter Client-Schreibzugriff (keine weitere Policy) — ein Spieler
-- bestätigt ausschließlich über diese RPC, die player_id selbst aus der
-- Sitzung ableitet, statt sie vom Client entgegenzunehmen (verhindert, dass
-- jemand eine fremde player_id unterschiebt).
create or replace function public.confirm_announcement_read(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_authorized';
  end if;

  insert into public.announcement_reads (announcement_id, player_id)
  values (p_announcement_id, v_player_id)
  on conflict (announcement_id, player_id) do nothing;
end;
$$;
