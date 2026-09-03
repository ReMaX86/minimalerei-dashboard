/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Platzhalter-Farben im SpielerPlus/TeamPlus-Stil (dunkles Waldgrün +
        // knalliges Mint als Akzent) – Tokennamen sind aus der ersten Version
        // beibehalten (navy/gold), auch wenn die Werte jetzt grün statt
        // blau/gold sind, um ~100 Verwendungsstellen nicht umbenennen zu
        // müssen. Gegen echte TB-Wülfrath-Vereinsfarben austauschen, sobald
        // diese vorliegen (siehe README "Design").
        tbw: {
          navy: '#0F3D2A',
          navyDark: '#07160F',
          red: '#E5484D',
          gold: '#2FE38A',
          ink: '#101815',
          bg: '#F3F6F4'
        },
        status: {
          ok: '#22C55E',
          warn: '#F5A623',
          open: '#8A958E'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Anton', 'Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
