"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fullNameFor, initialsFor } from "@/lib/userName";

// Razdelek "Uporabnik" na vrhu menija ⋮ (SettingsMenu.tsx): krog z
// začetnicami, ime in e-pošta, obrazec za ime (če ga ni) in odjava — enako
// kot v hubu TomStudios (auth.js). Ime in začetnice: src/lib/userName.ts.
export default function UserMenuSection({ user: initialUser }: { user: User }) {
  const [user, setUser] = useState(initialUser);
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fullName = fullNameFor(user);

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
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#10b981,#0891b2)] text-[9px] font-semibold tracking-wide text-white">
            {initialsFor(user)}
          </span>
          <span className="truncate">Uporabnik</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-1 px-3 pb-2 pt-1">
          {fullName && <p className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">{fullName}</p>}
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
            onClick={() => supabase.auth.signOut()}
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
    </>
  );
}
