/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#0E0B14",
        violet: "#5B2BFF",
        pink: "#FF2D95",
        amber: "#FFB21A",
        mist: "#E4DDF2",
        haze: "#B9AED3",
        dusk: "#9A90B3",
        smoke: "#8E84A6",
      },
      fontFamily: {
        display: ["Unbounded_800ExtraBold"],
        sans: ["DMSans_400Regular"],
        medium: ["DMSans_500Medium"],
        bold: ["DMSans_700Bold"],
      },
    },
  },
  plugins: [],
};
