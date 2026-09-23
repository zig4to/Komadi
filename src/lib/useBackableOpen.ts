"use client";

import { useEffect, useRef } from "react";
import { popBackable, pushBackable } from "./backNavigation";

// Poveže obstoječe "isOpen" stanje kateregakoli pod-pogleda (filter, PDF
// pregled, obrazec, panel filtrov, meni ...) s sistemskim gumbom "Nazaj" —
// ob odprtju potisne zgodovinski vnos, ob zaprtju (od koderkoli, tudi prek
// obstoječega gumba) ga počisti. Ne podvaja obstoječe zaporne logike, samo
// pokliče isto onClose funkcijo, ki jo že uporablja pripadajoč gumb.
export function useBackableOpen(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const id = pushBackable(() => onCloseRef.current());
    return () => popBackable(id);
  }, [isOpen]);
}
