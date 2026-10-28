// Government-portal look: navy primary (remaps Tailwind's `blue` so every page follows), saffron and green accents from the national colours.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {
    fontFamily: { sans: ['"Noto Sans"', '"Open Sans"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'] },
    colors: {
      blue: { 50: '#eef3fb', 100: '#dbe6f6', 200: '#b9cdec', 300: '#8eabdc', 400: '#5f83c6', 500: '#3d63ad', 600: '#2a4d94', 700: '#1f3d7a', 800: '#172f61', 900: '#0f2347', 950: '#0a1830' },
      saffron: { 50: '#fff4e8', 400: '#ffab4d', 500: '#f58220', 600: '#e0701a' },
      indiagreen: { 500: '#138808' },
    } },
  },
  plugins: [],
}
