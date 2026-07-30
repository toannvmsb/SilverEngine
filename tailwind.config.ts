import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        regime: {
          low: "#16a34a",
          normal: "#22c55e",
          cautious: "#eab308",
          high: "#f97316",
          stress: "#ef4444",
          crisis: "#7f1d1d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
