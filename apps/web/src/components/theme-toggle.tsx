"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-4 w-4" aria-hidden="true" />
          Light Mode
        </>
      ) : (
        <>
          <Moon className="h-4 w-4" aria-hidden="true" />
          Dark Mode
        </>
      )}
    </Button>
  );
}
