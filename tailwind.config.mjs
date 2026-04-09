/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#1e1f22',
        surface: '#2b2d31',
        panel: '#313338',
        muted: '#949ba4',
        line: '#3f4147',
        blurple: '#5865f2',
        text: '#dbdee1'
      },
      borderRadius: {
        xl: '0.75rem'
      }
    }
  },
  plugins: []
};
