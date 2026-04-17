/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Techy dark palette — near-black backgrounds with cyan/emerald accents.
        bg: {
          900: '#07090d',
          800: '#0b0f16',
          700: '#111722',
          600: '#192133',
        },
        border: {
          DEFAULT: '#1f2a3d',
          strong: '#2b3a55',
        },
        text: {
          DEFAULT: '#d6e0f0',
          muted: '#7b8aa5',
          dim: '#4b5a75',
        },
        accent: {
          cyan: '#22d3ee',
          emerald: '#34d399',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 0 24px -8px rgba(34,211,238,0.35)',
      },
      backgroundImage: {
        grid:
          'linear-gradient(to right, rgba(43,58,85,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(43,58,85,0.25) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
