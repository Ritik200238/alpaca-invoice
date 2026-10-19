import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Palette: cool ink neutrals with a deep teal accent.
        // Contrast notes (WCAG 2.x): white on accent-500 5.47:1, white on accent-600 7.51:1,
        // primary-500 on white 5.27:1, accent-400 on primary-900 7.1:1.

        // Primary - ink neutrals (sidebar, text, borders, surfaces)
        primary: {
          50: "#F4F7F8",
          100: "#E9EEF1",
          200: "#D9E0E5",
          300: "#BFC9D0",
          400: "#86939D",
          500: "#5F6E78",
          600: "#4A5862",
          700: "#36434C",
          800: "#222D34",
          900: "#151D22",  // sidebar mid tone
          950: "#0B1114",  // sidebar / landing base
        },

        // Accent - deep teal (CTA, primary actions). 500 carries white text at AA.
        accent: {
          50: "#F0FAF9",
          100: "#D3F0ED",
          200: "#A6E1DB",
          300: "#6CCBC2",
          400: "#38B2A8",
          500: "#0F766E",  // main CTA
          600: "#0B5F59",
          700: "#094B47",
          800: "#073A37",
          900: "#052B29",
        },

        // Success - true green, kept apart from the teal accent so "paid" never reads as "action"
        success: {
          50: "#F0FAF3",
          100: "#DDF3E4",
          200: "#BDE6CB",
          300: "#8FD3A8",
          400: "#55BA80",
          500: "#2C9A5F",
          600: "#1F804C",
          700: "#186840",
        },

        // Re-tinted default palettes so existing emerald-* / purple-* classes follow the new system.
        // emerald = paid / resolved states (same ramp as success)
        emerald: {
          50: "#F0FAF3",
          100: "#DDF3E4",
          200: "#BDE6CB",
          300: "#8FD3A8",
          400: "#55BA80",
          500: "#2C9A5F",
          600: "#1F804C",
          700: "#186840",
          800: "#145334",
          900: "#0F3F28",
        },
        // purple = arbiter role; muted plum instead of saturated violet
        purple: {
          50: "#F8F5FB",
          100: "#EFE9F5",
          200: "#DDD1EA",
          300: "#C2AED6",
          400: "#9A82B5",
          500: "#7D63A0",
          600: "#6B4C8A",
          700: "#4D3868",
          800: "#3E2D55",
          900: "#35234A",
        },

        // Warning - amber
        warning: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
        },

        // Error - red
        error: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
        },

        // Info - blue
        info: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
        },

        // Form-control set (inputs, selects, checkboxes). 300 is the control border and
        // meets 3:1 against the field fill; 400 is placeholder text at 4.7:1.
        inkan: {
          50: "#FBFCFD",
          100: "#F1F5F7",
          200: "#E1E8EC",
          300: "#8794A0",
          400: "#66737D",
          500: "#566570",
          600: "#46535D",
          700: "#36424B",
          800: "#26313A",
          900: "#181F25",
        },

        // shadcn/ui 主题 tokens
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        // Latin: IBM Plex Sans. CJK glyphs fall through to the platform's Japanese / Chinese UI fonts.
        sans: [
          "IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI",
          "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo",
          "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK JP", "Noto Sans CJK SC", "sans-serif",
        ],
        mono: ["IBM Plex Mono", "JetBrains Mono", "SF Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "10px",
        "2xl": "14px",
      },
      // Ink-tinted shadows (cool, low alpha) instead of neutral black
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(15 27 34 / 0.06)',
        'md': '0 4px 8px -2px rgb(15 27 34 / 0.09), 0 2px 4px -2px rgb(15 27 34 / 0.05)',
        'lg': '0 10px 18px -4px rgb(15 27 34 / 0.10), 0 4px 8px -4px rgb(15 27 34 / 0.05)',
        'xl': '0 20px 28px -6px rgb(15 27 34 / 0.12), 0 8px 12px -6px rgb(15 27 34 / 0.06)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        slide: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 3s ease-in-out infinite",
        wiggle: "wiggle 1s ease-in-out infinite",
        slide: "slide 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
