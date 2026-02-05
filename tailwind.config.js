/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080C12",
        foreground: "#ffffff",
        primary: "#FFFFFF",
        accent: "#38BDF8",
        secondary: "#1E293B",
        muted: "#94A3B8",
        warning: "#FACC15",
        card: "#0F1623",
        border: "#1E293B",
        tech: "#0D1216",
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, #080C12 0%, #0F1623 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
