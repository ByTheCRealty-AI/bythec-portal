import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta premium By the C — tema claro, verdes da marca da Andrea.
        page: "#f6f8f7",         // fundo da página (off-white suave, nunca branco puro chapado)
        surface: "#ffffff",      // superfícies de card
        ink: "#0f1b19",          // texto principal (near-black esverdeado)
        primary: "#198577",      // verde-teal profundo (logo)
        secondary: "#04a27f",    // verde mais vivo (acento)
      },
      fontFamily: {
        // Fontes premium via next/font (Space Grotesk display + Satoshi-like body).
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        // Sombra suave premium para cards no tema claro.
        card: "0 1px 2px rgba(15,27,25,0.04), 0 8px 24px -12px rgba(15,27,25,0.10)",
        glow: "0 8px 24px -8px rgba(25,133,119,0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
