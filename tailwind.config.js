/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dobot: {
          bg: "#121417",
          panel: "#1b1e24",
          surface: "#242932",
          border: "#2e3440",
          accent: "#1890ff",
          accentHover: "#40a9ff",
          danger: "#ff4d4f",
          dangerHover: "#ff7875",
          success: "#52c41a",
          warning: "#faad14",
          text: "#e6e8eb",
          muted: "#8c939f",
        },
      },
    },
  },
  plugins: [],
};
