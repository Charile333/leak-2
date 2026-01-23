/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#ffffff",
        brand: {
          light: "#005f73", // 深青蓝
          DEFAULT: "#0a192f", // 深海军蓝
          dark: "#050b14", // 极深蓝
        },
        accent: "#00e0ff", // 亮青色，配合深海背景
        card: "#0f172a", // 稍微带蓝的深色背景
        border: "#1e293b", // Slate-800
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, #0a192f 0%, #000000 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
