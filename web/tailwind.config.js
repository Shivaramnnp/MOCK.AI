import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.resolve(__dirname, 'index.html'),
    path.resolve(__dirname, 'candidate-rehearsal.html'),
    path.resolve(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#4F6EF7',
          variant: '#9B4DFF',
          green: '#1DB974',
          amber: '#FF9500',
          red: '#FF3B4E',
        },
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F6EF7',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          DEFAULT: '#4F6EF7',
        },
        surface: {
          DEFAULT: '#F5F7FF',
          elev1: '#FFFFFF',
          elev2: '#F0F2FF',
          elev3: '#E8ECF8',
          text: '#0F1320',
          muted: '#7B83A6',
          border: '#E0E4F4',
        },
        darkSurface: {
          DEFAULT: '#0F1117',
          elev1: '#171B26',
          elev2: '#1E2335',
          elev3: '#252A3D',
          text: '#E8EAF2',
          muted: '#8892AA',
          border: '#2A2F45',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(15, 19, 32, 0.05)',
        glow: '0 0 25px rgba(79, 110, 247, 0.25)',
      },
    },
  },
  plugins: [],
};
