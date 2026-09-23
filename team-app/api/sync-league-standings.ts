import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// Holt die Liga-Tabelle vom DBB (basketball-bund.net) und schreibt sie in
// public.league_standings (Migration 0056) — auf Nutzeranfrage, um die
// offizielle Tabelle direkt in der App zu zeigen. Der DBB bietet dafür
// keine öffentliche API (alte, rein serverseitig gerenderte JSP-Anwendung,
// der sichtbare "Export (Excel)"-Button ruft eine JS-Funktion auf statt
// einer festen URL) — die Daten kommen daher per Scraping der öffentlich
// erreichbaren HTML-Tabellenseite.
//
// Aufgerufen per pg_cron (wie die anderen Erinnerungsarten), siehe README
// "Liga-Tabelle" für die Einrichtung — seit Migration 0066 zusätzlich per
// "Jetzt aktualisieren"-Button im Adminbereich (siehe StandingsSyncSettings.tsx).
//
// ACHTUNG: die HTML-Struktur der DBB-Seite konnte beim Bauen dieser Funktion
// nicht live geprüft werden (Netzwerkbeschränkung der Entwicklungsumgebung)
// — die Parsing-Logik unten ist deshalb bewusst robust gegen genaue
// Klassennamen/verschachtelte Tags gehalten (sucht die Tabelle über ihre
// Kopfzeilen-Texte "Rang"/"Name" statt über CSS-Selektoren, ordnet Spalten
// über die Kopfzeilen-Reihenfolge zu). Liefert die Seite unerwartet 0 Zeilen,
// wird die bestehende Tabelle NICHT gelöscht (lieber ein veralteter Stand
// als eine leere Tabelle in der App) — sichtbar am Response-Feld
// "skipped": "no_rows_parsed".
//
// Bewusst KOMPLETT ohne eigene lokale Imports (siehe ausführliche Begründung
// in send-training-reminders.ts — Vercel bündelt für api/-Functions dieses
// Projekts keine lokalen Dateiabhängigkeiten).

interface ParsedRow {
  rang: number;
  teamName: string;
  spiele: number;
  siege: number;
  niederlagen: number;
  punkte: number;
  koerbeErzielt: number;
  koerbeErhalten: number;
  diff: number;
  isOwnTeam: boolean;
}

// Buchstaben-only-Vergleich statt direktem String-Vergleich: macht den
// Abgleich robust gegen eine mögliche falsche Zeichenkodierung der alten
// JSP-Seite (Umlaute könnten als Mojibake ankommen) — nicht-Buchstaben
// (inkl. eines falsch kodierten "ü") fallen dabei einfach weg.
function normalizeTeamKey(name: string): string {
  return name.replace(/[^a-zA-Z]/g, '').toLowerCase();
}

function parseStandings(html: string): ParsedRow[] {
  const $ = cheerio.load(html);
  let headerCells: ReturnType<typeof $> | null = null;
  let dataTable: ReturnType<typeof $> | null = null;

  $('table').each((_, tbl) => {
    if (dataTable) return;
    const $tbl = $(tbl);
    // Bewusst .children() statt .find(): jede Kopfzeilen-Zelle der echten
    // DBB-Seite verschachtelt ihr Label in eine eigene kleine Tabelle
    // (<td><table><tr><td>Rang</td></tr></table></td>) — .find('td') würde
    // sowohl die äußere als auch die innere Zelle treffen und die
    // Spaltenzuordnung dadurch verdoppeln/verschieben (live so aufgefallen:
    // "Name" landete auf den Werten der "Spiele"-Spalte usw.). .children()
    // bleibt bei den direkten Kind-Zellen der Zeile, .text() liest trotzdem
    // den kompletten (verschachtelten) Zellinhalt korrekt aus.
    const firstRowCells = $tbl.find('tr').first().children('td, th');
    const headerTexts = firstRowCells.map((__, el) => $(el).text().trim().toLowerCase()).get();
    if (headerTexts.some((t) => t.includes('rang')) && headerTexts.some((t) => t.includes('name'))) {
      dataTable = $tbl;
      headerCells = firstRowCells;
    }
  });

  if (!dataTable || !headerCells) return [];

  const headerTexts = (headerCells as ReturnType<typeof $>).map((_, el) => $(el).text().trim().toLowerCase()).get();
  const colIndex = (needle: string) => headerTexts.findIndex((t) => t.includes(needle));
  const idxRang = colIndex('rang');
  const idxName = colIndex('name');
  const idxSpiele = colIndex('spiele');
  const idxWL = colIndex('w/l');
  const idxPkte = colIndex('pkte');
  const idxKoerbe = colIndex('körbe') !== -1 ? colIndex('körbe') : colIndex('korbe');
  const idxDiff = colIndex('diff');

  const rows: ParsedRow[] = [];
  (dataTable as ReturnType<typeof $>)
    .find('tr')
    .slice(1)
    .each((_, tr) => {
      const cells = $(tr).children('td');
      if (cells.length === 0) return;
      const cellText = (i: number) => (i >= 0 && i < cells.length ? $(cells.get(i)).text().trim() : '');

      const rang = parseInt(cellText(idxRang), 10);
      const teamName = cellText(idxName);
      if (!teamName || Number.isNaN(rang)) return;

      const spiele = parseInt(cellText(idxSpiele), 10) || 0;
      const [siegeStr, niederlagenStr] = cellText(idxWL).split('/');
      const siege = parseInt(siegeStr ?? '', 10) || 0;
      const niederlagen = parseInt(niederlagenStr ?? '', 10) || 0;
      const punkte = parseInt(cellText(idxPkte), 10) || 0;
      const [erzieltStr, erhaltenStr] = cellText(idxKoerbe).split(':').map((s) => s.trim());
      const koerbeErzielt = parseInt(erzieltStr ?? '', 10) || 0;
      const koerbeErhalten = parseInt(erhaltenStr ?? '', 10) || 0;
      const parsedDiff = parseInt(cellText(idxDiff), 10);
      const diff = Number.isNaN(parsedDiff) ? koerbeErzielt - koerbeErhalten : parsedDiff;

      rows.push({
        rang,
        teamName,
        spiele,
        siege,
        niederlagen,
        punkte,
        koerbeErzielt,
        koerbeErhalten,
        diff,
        isOwnTeam: normalizeTeamKey(teamName).includes('wlfrath')
      });
    });

  return rows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server ist nicht vollständig konfiguriert.' });
    return;
  }

  // Zwei Aufrufer: der tägliche pg_cron-Job (Webhook-Secret, wie bei den
  // anderen api/-Functions) UND jetzt zusätzlich der "Jetzt aktualisieren"-
  // Button im Adminbereich (echte Trainer/Admin-Session statt eines dem
  // Client bekannten Secrets). Für Letzteres wird der mitgeschickte
  // Supabase-Access-Token gegen die is_trainer()-RPC geprüft — dieselbe
  // security-definer Funktion, die auch alle anderen Trainer-only RLS-
  // Policies/RPCs im Projekt verwendet (siehe Migration 0006).
  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  const hasValidWebhookSecret = !!webhookSecret && req.headers['x-webhook-secret'] === webhookSecret;

  let isAdminRequest = false;
  if (!hasValidWebhookSecret) {
    const authHeader = req.headers.authorization;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (authHeader?.startsWith('Bearer ') && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data } = await userClient.rpc('is_trainer');
      isAdminRequest = data === true;
    }
  }

  if (!hasValidWebhookSecret && !isAdminRequest) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Liga-ID kommt seit Migration 0066 aus der Datenbank (im Adminbereich
  // editierbar) statt aus der Vercel-Env-Var DBB_LIGA_ID — die Env-Var
  // bleibt nur als Fallback, falls die Sync-Status-Zeile unerwartet fehlt.
  const { data: statusRow } = await supabase.from('standings_sync_status').select('liga_id').eq('id', 1).maybeSingle();
  const ligaId = statusRow?.liga_id || process.env.DBB_LIGA_ID || '54636';

  // Element 10 "Spielplan/Ergebnisse/Tabelle": jeder Lauf trägt sich hier
  // ein (Erfolg oder Fehler), damit der Tabellen-Reiter einen "letzte
  // Aktualisierung fehlgeschlagen"-Hinweis zeigen kann, ohne den letzten
  // guten Stand in league_standings selbst zu verlieren.
  const nowIso = new Date().toISOString();
  await supabase.from('standings_sync_status').update({ last_attempt_at: nowIso }).eq('id', 1);

  async function fail(message: string) {
    await supabase.from('standings_sync_status').update({ last_error: message }).eq('id', 1);
  }

  let html: string;
  try {
    const response = await fetch(`https://www.basketball-bund.net/index.jsp?Action=102&liga_id=${ligaId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TBWTeamApp/1.0)' }
    });
    if (!response.ok) {
      await fail(`DBB-Seite antwortete mit Status ${response.status}.`);
      res.status(502).json({ error: 'DBB-Seite nicht erreichbar.', status: response.status });
      return;
    }
    html = await response.text();
  } catch (err) {
    await fail((err as Error).message);
    res.status(502).json({ error: 'DBB-Seite nicht erreichbar.', details: (err as Error).message });
    return;
  }

  const rows = parseStandings(html);
  if (rows.length === 0) {
    await fail('Keine Zeilen aus der DBB-Seite geparst.');
    res.status(200).json({ skipped: 'no_rows_parsed' });
    return;
  }

  const { error: deleteError } = await supabase.from('league_standings').delete().eq('liga_id', ligaId);
  if (deleteError) {
    await fail(deleteError.message);
    res.status(500).json({ error: 'Alte Tabelle konnte nicht gelöscht werden.', details: deleteError.message });
    return;
  }

  // Räumt Zeilen einer früher konfigurierten Liga-ID weg (die Admin-UI
  // erlaubt jetzt, die Liga-ID zu ändern) — league_standings wird überall
  // im Client ohne eigenen liga_id-Filter gelesen, geht also von genau
  // einer aktiven Liga aus.
  await supabase.from('league_standings').delete().neq('liga_id', ligaId);

  const { error: insertError } = await supabase.from('league_standings').insert(
    rows.map((r) => ({
      liga_id: ligaId,
      rang: r.rang,
      team_name: r.teamName,
      is_own_team: r.isOwnTeam,
      spiele: r.spiele,
      siege: r.siege,
      niederlagen: r.niederlagen,
      punkte: r.punkte,
      koerbe_erzielt: r.koerbeErzielt,
      koerbe_erhalten: r.koerbeErhalten,
      diff: r.diff
    }))
  );
  if (insertError) {
    await fail(insertError.message);
    res.status(500).json({ error: 'Tabelle konnte nicht gespeichert werden.', details: insertError.message });
    return;
  }

  await supabase.from('standings_sync_status').update({ last_success_at: nowIso, last_error: null }).eq('id', 1);
  res.status(200).json({ updated: rows.length, ligaId });
}
