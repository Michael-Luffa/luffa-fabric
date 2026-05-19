/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        grid: "#d8e1e6",
        luffa: "#1e8a5d",
        chain: "#315ea8",
        alert: "#b23a48"
      }
    }
  },
  plugins: []
};
