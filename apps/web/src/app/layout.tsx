import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

// No next/font/google here: it downloads fonts at build time, which breaks
// hermetic Docker/Railway builds. The Tailwind font stack leads with Inter
// and falls back to system fonts.

export const metadata: Metadata = {
  title: "Meridian — AI-native ERP",
  description: "CRM, projects, and business management powered by AI",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1114" },
  ],
};

// Runs before first paint so the stored theme is on <html> ahead of any
// styled markup — without it the page paints light and then flips.
// Light is the default: an ERP is a daylight, all-day tool, and a business
// showing this to a customer should not have to explain why it opened dark.
const themeScript = `(function(){try{var t=localStorage.getItem('meridian-theme');var d=t==='dark'?'dark':'light';document.documentElement.classList.add(d);document.documentElement.style.colorScheme=d;}catch(e){document.documentElement.classList.add('light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
