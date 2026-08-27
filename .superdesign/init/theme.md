# Meridian Theme Tokens

## Compact Token Summary

### Colors (HSL via CSS variables, dark theme only)

| Token | Value |
|-------|-------|
| `--background` | `222 47% 6%` |
| `--foreground` | `210 40% 98%` |
| `--card` | `222 47% 8%` |
| `--card-foreground` | `210 40% 98%` |
| `--primary` | `217 91% 60%` (blue) |
| `--primary-foreground` | `222 47% 6%` |
| `--secondary` | `217 33% 17%` |
| `--secondary-foreground` | `210 40% 98%` |
| `--muted` | `217 33% 17%` |
| `--muted-foreground` | `215 20% 65%` |
| `--accent` | `217 33% 17%` |
| `--accent-foreground` | `210 40% 98%` |
| `--destructive` | `0 62% 50%` |
| `--border` | `217 33% 17%` |
| `--input` | `217 33% 17%` |
| `--ring` | `217 91% 60%` |

### Typography

- **Sans:** Inter, ui-sans-serif, system-ui
- **Scale:** text-xs (12px), text-sm (14px), text-base (16px), text-2xl/3xl for headings
- **Weight:** font-medium (labels), font-semibold (nav), font-bold (stats)

### Spacing & Radius

- `--radius`: `0.5rem` (8px)
- Card padding: p-6 / pt-0 for content
- Page padding: p-8
- Sidebar width: w-64 (256px)

### Shadows

- Cards: `shadow-sm` (minimal)
- Modals/panels: `shadow-2xl`

### Breakpoints (Tailwind defaults)

- sm: 640px, md: 768px, lg: 1024px, xl: 1280px

---

## Raw Source: globals.css

```css
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

@layer base {
  :root {
    --background: 222 47% 6%;
    --foreground: 210 40% 98%;
    --card: 222 47% 8%;
    --card-foreground: 210 40% 98%;
    --primary: 217 91% 60%;
    --primary-foreground: 222 47% 6%;
    --secondary: 217 33% 17%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 65%;
    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62% 50%;
    --border: 217 33% 17%;
    --input: 217 33% 17%;
    --ring: 217 91% 60%;
    --radius: 0.5rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

## Raw Source: tailwind.config.ts

```ts
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: [
        "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI",
        "Roboto", "Helvetica Neue", "Arial", "sans-serif",
      ],
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```
