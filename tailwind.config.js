/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#050505", // 深邃黑灰
        foreground: "#ffffff",
        brand: {
          light: "#A78BFA", // Violet-400
          DEFAULT: "#8B5CF6", // Violet-500 (主品牌色)
          dark: "#4C1D95", // Violet-900
          deep: "#2E1065", // Violet-950
        },
        accent: "#8B5CF6", // 统一使用 Violet-500 作为强调色，保持一致性
        secondary: "#C4B5FD", // Violet-300 辅助高亮
        card: "rgba(255, 255, 255, 0.03)", // 玻璃态卡片背景
        border: "rgba(139, 92, 246, 0.2)", // 紫色微光边框
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, #2E1065 0%, #000000 100%)', // 深紫到黑的渐变
        'glow-gradient': 'linear-gradient(to right, #8B5CF6, #D8B4FE)', // 按钮/文字的高亮渐变
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
