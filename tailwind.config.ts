import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        "brand-ink": "rgb(var(--brand-ink) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // «display» es la misma Biennale; el peso y el espaciado de los títulos están en globals.css
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
      },
      boxShadow: {
        float: "0 12px 32px -8px rgb(15 23 42 / 0.28), 0 0 0 1px rgb(var(--line) / 0.8)",
        soft: "0 1px 3px 0 rgb(15 23 42 / 0.12), 0 1px 2px -1px rgb(15 23 42 / 0.1)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: { shimmer: "shimmer 2s linear infinite" },
    },
  },
  plugins: [],
};

export default config;
