/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // AMOLED Theme - True blacks
        amoled: {
          black: '#000000',
          surface: '#0a0a0a',
          elevated: '#121212',
          card: '#181818',
          hover: '#282828',
          border: '#282828',
        },
        // Text colors
        text: {
          primary: '#ffffff',
          secondary: '#b3b3b3',
          muted: '#6a6a6a',
        },
        // Accent colors (will be dynamic based on album art)
        accent: {
          primary: '#d4a853',
          secondary: '#c9963e',
          glow: 'rgba(212, 168, 83, 0.3)',
        },
        // Format badge colors
        format: {
          flac: '#d4a853',
          hires: '#22c55e',
          dsd: '#a855f7',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(212, 168, 83, 0.3)',
        'card': '0 8px 24px rgba(0, 0, 0, 0.5)',
        'player': '0 -8px 32px rgba(0, 0, 0, 0.8)',
      },
      animation: {
        'gradient': 'gradient 15s ease infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundSize: {
        '200%': '200% 200%',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [],
};
