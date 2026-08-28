"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { readBrandingCache } from "@/lib/branding";

interface MeridianLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-xl",
};

export function MeridianLogo({ className, size = "md" }: MeridianLogoProps) {
  // Read after mount: localStorage does not exist during SSR, and rendering the
  // default mark first then swapping is the honest tradeoff — the alternative
  // is inlining an image into the pre-paint script.
  const [logo, setLogo] = useState<{ dataUri: string; alt: string } | null>(null);
  useEffect(() => setLogo(readBrandingCache()?.logo ?? null), []);

  if (logo) {
    return (
      <img
        src={logo.dataUri}
        alt={logo.alt}
        className={cn("shrink-0 rounded-lg object-contain", sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground shadow-elevated",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
        <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.25" />
        <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  );
}
