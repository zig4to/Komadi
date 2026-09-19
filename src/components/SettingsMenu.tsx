"use client";

import { useEffect, useRef, useState } from "react";
import { runBackup, shareBackup } from "@/lib/backup";
import { useTheme, type Theme } from "@/lib/useTheme";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Sistemska" },
  { value: "light", label: "Svetla" },
  { value: "dark", label: "Temna" },
];

export default function SettingsMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  const [backupBusy, setBackupBusy] = useState<"save" | "share" | null>(null);
  const [backupMessage, setBackupMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (backupTimer.current) clearTimeout(backupTimer.current);
  }, []);

  function todayStr(): string {
    return new Date().toLocaleDateString("sl-SI");
  }

  async function handleSaveBackup() {
    if (backupTimer.current) clearTimeout(backupTimer.current);
    setBackupBusy("save");
    setBackupMessage(null);

    try {
      await runBackup();
      setBackupMessage({ type: "success", text: `Uspešno shranjeno · ${todayStr()}` });
      backupTimer.current = setTimeout(() => setBackupMessage(null), 5000);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setBackupMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Backup ni uspel.",
        });
      }
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleShareBackup() {
    if (backupTimer.current) clearTimeout(backupTimer.current);
    setBackupBusy("share");
    setBackupMessage(null);

    try {
      const result = await shareBackup();
      setBackupMessage({
        type: "success",
        text:
          result.method === "share"
            ? `Uspešno deljeno · ${todayStr()}`
            : `Deljenje ni podprto, datoteka prenesena · ${todayStr()}`,
      });
      backupTimer.current = setTimeout(() => setBackupMessage(null), 5000);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setBackupMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Deljenje ni uspelo.",
        });
      }
    } finally {
      setBackupBusy(null);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Meni"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Meni"
        className="inline-flex items-center justify-center rounded-lg border border-neutral-300 p-2 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:hover:text-emerald-400"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px] shrink-0"
        >
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-neutral-200 bg-white p-1.5 text-sm shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        >
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <span className="flex items-center gap-2">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Nastavitve
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 shrink-0 transition-transform ${
                settingsOpen ? "" : "-rotate-90"
              }`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {settingsOpen && (
            <div className="mt-1 px-3 pb-2 pt-1">
              <p className="mb-1.5 text-xs font-medium text-neutral-500">Tema</p>
              <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    aria-pressed={theme === opt.value}
                    className={`flex-1 rounded-md px-2 py-1 text-xs transition ${
                      theme === opt.value
                        ? "bg-emerald-600 font-medium text-white"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 mt-3 text-xs font-medium text-neutral-500">Backup</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveBackup}
                  disabled={backupBusy !== null}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-400"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-[15px] w-[15px] shrink-0 ${backupBusy === "save" ? "animate-pulse" : ""}`}
                  >
                    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
                    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
                  </svg>
                  {backupBusy === "save" ? "Shranjujem…" : "Prenesi"}
                </button>
                <button
                  type="button"
                  onClick={handleShareBackup}
                  disabled={backupBusy !== null}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-400"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-[15px] w-[15px] shrink-0 ${backupBusy === "share" ? "animate-pulse" : ""}`}
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="m8.59 13.51 6.83 3.98" />
                    <path d="m15.41 6.51-6.82 3.98" />
                  </svg>
                  {backupBusy === "share" ? "Delim…" : "Deli"}
                </button>
              </div>
              {backupMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1.5 text-center text-xs ${
                    backupMessage.type === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {backupMessage.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
