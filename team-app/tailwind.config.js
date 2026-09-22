/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tipoff-Redesign (Übergabe von Claude Design, "Night Court" v0.1,
        // siehe docs/design/tipoff-design/DESIGN.md) — Werte zeigen direkt auf
        // die CSS-Variablen aus src/styles/tipoff-tokens.css, damit spätere
        // Feinjustierungen NUR dort passieren müssen, nie hier.
        to: {
          bg: 'var(--to-bg)',
          surface: 'var(--to-surface)',
          surface2: 'var(--to-surface-2)',
          border: 'var(--to-border)',
          borderMatchday: 'var(--to-border-matchday)',
          line: 'var(--to-line)',
          divider: 'var(--to-divider)',
          text: 'var(--to-text)',
          text2: 'var(--to-text-2)',
          text3: 'var(--to-text-3)',
          textDisabled: 'var(--to-text-disabled)',
          accent: 'var(--to-accent)',
          accentHover: 'var(--to-accent-hover)',
          accentSoft: 'var(--to-accent-soft)',
          onAccent: 'var(--to-on-accent)',
          danger: 'var(--to-danger)',
          dangerText: 'var(--to-danger-text)',
          dangerSoft: 'var(--to-danger-soft)',
          vacation: 'var(--to-vacation)',
          vacationSoft: 'var(--to-vacation-soft)',
          vacationFrame: 'var(--to-vacation-frame)',
          lineMuted: 'var(--to-line-muted)'
        },
        // Alte "Hallenanzeige"-Tokens bleiben vorerst bestehen, solange noch
        // nicht jeder Screen auf Tipoff umgestellt ist (siehe Rollout-Plan) —
        // werden entfernt, sobald die letzte Seite migriert ist.
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
          warn: '#B45309',
          open: '#8B93A1'
        }
      },
      fontFamily: {
        // Basis-Familien global auf die Tipoff-Schriften umgestellt — die
        // volle Typo-Behandlung (font-stretch/italic/letter-spacing) kommt
        // aus den .to-display/.to-number/.to-label/.to-data-Klassen in
        // tipoff-tokens.css, diese Familien sind hier nur der Fallback für
        // gewöhnlichen Tailwind-Gebrauch (font-sans/font-display/font-mono).
        sans: ['Geist', 'system-ui', 'sans-serif'],
        display: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        'to-sm': 'var(--to-radius-sm)',
        'to-md': 'var(--to-radius-md)',
        'to-lg': 'var(--to-radius-lg)',
        'to-xl': 'var(--to-radius-xl)',
        'to-2xl': 'var(--to-radius-2xl)',
        'to-pill': 'var(--to-radius-pill)'
      }
    }
  },
  plugins: []
};
