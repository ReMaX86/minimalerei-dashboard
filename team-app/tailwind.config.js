/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "Hallenanzeige"-Farbwelt (Redesign, siehe .impeccable/surfaces/
        // src-pages-dashboard-tsx.md und PRODUCT.md "Brand Commitments") —
        // Tokennamen aus der ersten Version bewusst beibehalten (navy/gold),
        // nur die Werte getauscht, um die ~100 bestehenden Verwendungsstellen
        // nicht umbenennen zu müssen (gleiches Vorgehen wie beim vorherigen
        // Platzhalter-Wechsel). navy/navyDark tragen jetzt die dunklen
        // "Arena"-Flächen (Live-Ticker, Nav, Login), bg das warme
        // "Papier"-Grau für dichte Datenlisten, gold die satte
        // Anzeigetafel-Bernstein-Akzentfarbe.
        tbw: {
          navy: '#12141C',
          navyDark: '#08090F',
          red: '#E5484D',
          gold: '#FFA733',
          ink: '#1C1A17',
          bg: '#F6F2E9'
        },
        status: {
          ok: '#16A34A',
          // Bewusst ein gedämpftes Bernstein-Braun statt eines zweiten
          // hellen Orange/Gelb — sonst kollidiert die Warn-Farbe optisch mit
          // dem gold-Akzent, der jetzt überall "primäre Aktion" bedeutet.
          warn: '#B45309',
          open: '#8B93A1'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Anton', 'Inter', 'system-ui', 'sans-serif'],
        // Für Punktstände/Statistiken: eine echte tabellarische Zifferndarstellung
        // (siehe .tabular-score in index.css) statt Inter mit nur
        // font-variant-numeric — JetBrains Mono liefert breitere, klar
        // unterscheidbare Ziffern im Anzeigetafel-Charakter.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
};
