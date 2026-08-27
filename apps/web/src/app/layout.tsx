import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian — AI-native ERP",
  description: "CRM, projects, and business management powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
