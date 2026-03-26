/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#08090c',
        card: '#0d0f14',
        border: '#1a1d26',
        dim: '#5a5e6a',
        amber: '#f0b800',
        green: '#00c853',
        red: '#ff5252',
        cyan: '#00bcd4',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
