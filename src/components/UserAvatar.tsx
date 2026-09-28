"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fullNameFor, initialsFor } from "@/lib/userName";
import { useBackableOpen } from "@/lib/useBackableOpen";

// Krog z začetnicami prijavljenega uporabnika + pojavno okno z imenom,
// e-pošto in odjavo — enako kot v hubu TomStudios (auth.js, "Krog z
// začetnicami"). Ime in začetnice: src/lib/userName.ts.
export default function UserAvatar({ user: initialUser }: { user: User }) {
  const [user, setUser] = useState(initialUser);
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fullName = fullNameFor(user);

  useBackableOpen(open, () => setOpen(false));

  // pointerdown namesto click: na iOS Safari se "click" na neinteraktivnih
  // elementih ne sproži zanesljivo (enako kot v hubu).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setNameMsg("Vpiši ime in priimek.");
      return;
    }
    setSaving(true);
    setNameMsg(null);
    const { data, error } = await supabase.auth.updateUser({
      data: { first_name: firstName.trim(), last_name: lastName.trim() },
    });
    setSaving(false);
    if (error || !data.user) setNameMsg("Shranjevanje ni uspelo. Poskusi znova.");
    else setUser(data.user);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Prijavljen: ${fullName || user.email}`}
        title={fullName || user.email}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#10b981,#0891b2)] text-xs font-semibold tracking-wide text-white shadow-sm transition hover:brightness-110"
      >
        {initialsFor(user)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Uporabnik"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        >
          {fullName && <p className="truncate text-sm font-semibold">{fullName}</p>}
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>

          {!fullName && (
            <form onSubmit={saveName} className="mt-3 space-y-2">
              <p className="text-xs text-neutral-600 dark:text-neutral-300">Vpiši svoje ime:</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Ime"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
                />
                <input
                  type="text"
                  placeholder="Priimek"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Shrani
              </button>
              {nameMsg && <p className="text-xs text-red-600 dark:text-red-400">{nameMsg}</p>}
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              supabase.auth.signOut();
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Odjava
          </button>
        </div>
      )}
    </div>
  );
}
