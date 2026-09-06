"use client";

import { useTheme } from "@/lib/useTheme";

/**
 * Ob nalaganju uveljavi shranjeno izbiro teme (svetla / temna / sistemska)
 * in se odziva na spremembe sistemske nastavitve. Nič ne izriše.
 */
export default function ThemeProvider() {
  useTheme();
  return null;
}
