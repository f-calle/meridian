"use client";

import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — Meridian` : "Meridian — AI-native ERP";
    return () => {
      document.title = previous;
    };
  }, [title]);
}
