"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

/** `iconOnly` drops the label for tight rows; the aria-label carries the meaning. */
export function ThemeToggle({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <Button
      variant={iconOnly ? "ghost" : "outline"}
      size="sm"
      className={className}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {!iconOnly && (theme === "dark" ? "Light Mode" : "Dark Mode")}
    </Button>
  );
}
