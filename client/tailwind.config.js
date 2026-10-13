/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#116D6E',
          dark: '#0E5A5B',
          light: '#1A8A8B',
        },
        espresso: {
          DEFAULT: '#321E1E',
          light: '#4A2E2E',
        },
        brown: {
          DEFAULT: '#4E3636',
          light: '#6B4F4F',
          muted: '#8A7070',
        },
        crimson: {
          DEFAULT: '#CD1818',
          dark: '#A51313',
          light: '#E02020',
        },
        cream: {
          DEFAULT: '#FDFBF7',
          dark: '#F5F0E8',
          card: '#FFFFFF',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        btn: '12px',
      },
      boxShadow: {
        soft: '0 2px 16px rgba(50, 30, 30, 0.06)',
        medium: '0 4px 24px rgba(50, 30, 30, 0.10)',
        lifted: '0 8px 32px rgba(50, 30, 30, 0.12)',
        inner: 'inset 0 2px 4px rgba(50, 30, 30, 0.05)',
      },
      minWidth: {
        tap: '44px',
      },
      minHeight: {
        tap: '44px',
      },
      fontSize: {
        'total': ['2.5rem', { lineHeight: '1', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};
