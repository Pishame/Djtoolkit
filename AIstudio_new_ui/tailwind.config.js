/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
    "./*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#ff0080",
        "background-light": "#f8f5f7",
        "background-dark": "#1e1e1e",
        "surface-dark": "#2d2d2d",
        "rail-dark": "#181818",
      },
      fontFamily: {
        display: ["Inter", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

