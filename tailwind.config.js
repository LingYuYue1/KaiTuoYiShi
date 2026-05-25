/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'tj-bg-primary': 'rgb(var(--tj-bg-primary))',
        'tj-bg-secondary': 'rgb(var(--tj-bg-secondary))',
        'tj-text-primary': 'rgb(var(--tj-text-primary))',
        'tj-text-secondary': 'rgb(var(--tj-text-secondary))',
        'tj-accent-primary': 'rgb(var(--tj-accent-primary))',
        'tj-accent-secondary': 'rgb(var(--tj-accent-secondary))',
        'tj-border': 'rgb(var(--tj-border))',
        'tj-danger': 'rgb(var(--tj-danger))',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'SimSun', 'serif'],
        sans: ['"Noto Sans SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};
