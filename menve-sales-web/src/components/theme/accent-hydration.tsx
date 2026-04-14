"use client";

import { useEffect } from "react";
import { clearLegacyAccentTheme } from "@/lib/accent-presets";

export function AccentHydration() {
  useEffect(() => {
    clearLegacyAccentTheme();
  }, []);
  return null;
}
