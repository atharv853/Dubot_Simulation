/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dobot: {
          bg: "var(--dobot-bg)",
          panel: "var(--dobot-panel)",
          surface: "var(--dobot-surface)",
          border: "var(--dobot-border)",
          accent: "var(--dobot-accent)",
          accentHover: "var(--dobot-accent-hover)",
          danger: "var(--dobot-danger)",
          dangerHover: "var(--dobot-danger-hover)",
          success: "var(--dobot-success)",
          warning: "var(--dobot-warning)",
          text: "var(--dobot-text)",
          muted: "var(--dobot-muted)",
          inputBg: "var(--dobot-input-bg)",
          wheelBg: "var(--dobot-wheel-bg)",
          wheelBtn: "var(--dobot-wheel-btn)",
          wheelHover: "var(--dobot-wheel-hover)",
        },
      },
    },
  },
  plugins: [],
};
