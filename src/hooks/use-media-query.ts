"use client";

import { useState, useEffect, useCallback } from "react";

export function useMediaQuery(query: string): boolean {
  // Initialize to false to avoid SSR hydration mismatch.
  // The useEffect will sync to the correct value on mount.
  const [matches, setMatches] = useState(false);

  const getMatches = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // Sync immediately on mount
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query, getMatches]);

  return matches;
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
