/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Platzhalter-Farben – bitte gegen die echten TB-Wülfrath-Vereinsfarben
        // austauschen, sobald diese vorliegen (siehe README "Design").
        tbw: {
          navy: '#0B3D91',
          navyDark: '#082A66',
          red: '#D7263D',
          gold: '#F2A93B',
          ink: '#1A1D23',
          bg: '#F5F7FA'
        },
        status: {
          ok: '#1E9E5A',
          warn: '#F2A93B',
          open: '#8A93A3'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
