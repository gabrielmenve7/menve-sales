"use client";

import { useEffect } from "react";
import { applyAccentToDocument, readStoredAccent } from "@/lib/accent-presets";

export function AccentHydration() {
  useEffect(() => {
    applyAccentToDocument(readStoredAccent());
  }, []);
  return null;
}
