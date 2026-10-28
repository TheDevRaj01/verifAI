/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aicte: {
          navy: '#0B3B60',
          blue: '#1A56DB',
          darkBlue: '#082846',
          lightBlue: '#EBF5FF',
          sky: '#38BDF8',
          accent: '#FF9933', // Indian Saffron
          green: '#138808', // Indian Flag Green
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
