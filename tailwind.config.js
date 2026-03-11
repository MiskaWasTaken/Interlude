/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // AMOLED Pure Blacks
        amoled: {
          black: "#000000",
          surface: "#0a0a0a",
          card: "#121212",
          elevated: "#1a1a1a",
          border: "#262626",
          hover: "#2a2a2a",
        },
        // Text Hierarchy
        text: {
          primary: "#ffffff",
          secondary: "#a1a1a1",
          muted: "#6b6b6b",
          disabled: "#404040",
        },
        // Accent Colors (Spotify-inspired gold)
        accent: {
          primary: "#d4a853",
          secondary: "#e6c47a",
          muted: "#9a7b3d",
        },
        // Status Colors
        success: "#22c55e",
        warning: "#f59e0b",
        error: "#ef4444",
      },
      spacing: {
        // Generous spacing scale
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
        30: "7.5rem",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(212, 168, 83, 0.15)",
        "glow-lg": "0 0 40px rgba(212, 168, 83, 0.2)",
        elevated: "0 8px 32px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
