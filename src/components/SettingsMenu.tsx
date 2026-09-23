"use client";

import { useEffect, useRef, useState } from "react";
import { runBackup, shareBackup } from "@/lib/backup";
import { parseImportJson, parseImportText, type ParsedImport } from "@/lib/importSongs";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { useTheme, type Theme } from "@/lib/useTheme";
import type { QueuedSong, Song } from "@/types/song";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Sistemska" },
  { value: "light", label: "Svetla" },
  { value: "dark", label: "Temna" },
];

export default function SettingsMenu({ onImported }: { onImported?: (songs: Song[]) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  // Sistemski gumb "Nazaj" (Android) naj meni zapre enako kot klik zunaj njega ali Escape.
  useBackableOpen(menuOpen, () => setMenuOpen(false));

  const [backupBusy, setBackupBusy] = useState<"save" | "share" | null>(null);
  const [backupMessage, setBackupMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [importPending, setImportPending] = useState<ParsedImport | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // "Čakalna vrsta": hitro predlagane skladbe (glej gumb "Hitro" ob
  // "Dodaj skladbo" v Dashboard.tsx in tabelo queued_songs) — naloži se ob
  // vsakem odprtju menija, da se count/seznam ne postara med sejo.
  const [queuedOpen, setQueuedOpen] = useState(false);
  const [queuedSongs, setQueuedSongs] = useState<QueuedSong[]>([]);
  const [queuedError, setQueuedError] = useState<string | null>(null);
  const [queuedDeletingId, setQueuedDeletingId] = useState<string | null>(null);

  async function handleDeleteQueued(id: string) {
    const prev = queuedSongs;
    setQueuedDeletingId(id);
    setQueuedSongs((s) => s.filter((x) => x.id !== id));
    const { error } = await supabase.from("queued_songs").delete().eq("id", id);
    setQueuedDeletingId(null);
    if (error) {
      setQueuedSongs(prev);
      setQueuedError(error.message);
    }
  }

  useEffect(() => () => {
    if (backupTimer.current) clearTimeout(backupTimer.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("queued_songs")
        .select("*")
        .order("added_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setQueuedError(error.message);
        return;
      }
      setQueuedError(null);
      setQueuedSongs(data as QueuedSong[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [menuOpen]);

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

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportMessage(null);
    const text = await file.text();
    const parsed = file.name.toLowerCase().endsWith(".json")
      ? parseImportJson(text)
      : parseImportText(text);
    setImportPending(parsed);
  }

  async function handleConfirmImport() {
    if (!importPending || importPending.songs.length === 0) return;
    setImportBusy(true);

    const { data, error } = await supabase.from("songs").insert(importPending.songs).select();

    setImportBusy(false);

    if (error || !data) {
      setImportMessage({ type: "error", text: error?.message ?? "Uvoz ni uspel." });
      return;
    }

    onImported?.(data as Song[]);
    setImportMessage({ type: "success", text: `Uvoženih ${data.length} skladb · ${todayStr()}` });
    setImportPending(null);
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
        className={`inline-flex items-center justify-center rounded-full border border-current/40 p-2.5 transition ${
          menuOpen
            ? "bg-[linear-gradient(115deg,#475569_15%,#94a3b8_100%)] text-white"
            : "bg-[linear-gradient(115deg,rgba(100,116,139,0.14)_15%,rgba(100,116,139,0.03)_95%)] text-slate-600 hover:bg-[linear-gradient(115deg,rgba(100,116,139,0.24)_15%,rgba(100,116,139,0.06)_95%)] dark:text-slate-400 dark:hover:bg-[linear-gradient(115deg,rgba(100,116,139,0.32)_15%,rgba(100,116,139,0.1)_95%)]"
        }`}
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

              <p className="mb-1.5 mt-3 text-xs font-medium text-neutral-500">Uvoz skladb</p>
              <input
                ref={importFileRef}
                type="file"
                accept=".txt,.json,text/plain,application/json"
                onChange={handleImportFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-400"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[15px] w-[15px] shrink-0"
                >
                  <path d="M12 3v12" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                </svg>
                Izberi .txt ali .json datoteko
              </button>

              {importPending && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-neutral-200 p-2 text-xs dark:border-neutral-800">
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">
                    {importPending.songs.length === 0
                      ? "Ni najdenih skladb za uvoz."
                      : `Pripravljenih ${importPending.songs.length} skladb za uvoz.`}
                  </p>
                  {importPending.warnings.length > 0 && (
                    <ul className="max-h-24 space-y-0.5 overflow-y-auto text-amber-600 dark:text-amber-400">
                      {importPending.warnings.map((w, i) => (
                        <li key={i}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={importBusy || importPending.songs.length === 0}
                      className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {importBusy ? "Uvažam…" : "Uvozi"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportPending(null)}
                      disabled={importBusy}
                      className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-neutral-600 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      Prekliči
                    </button>
                  </div>
                </div>
              )}

              {importMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1.5 text-center text-xs ${
                    importMessage.type === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {importMessage.text}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setQueuedOpen((v) => !v)}
            aria-expanded={queuedOpen}
            className="mt-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
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
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Čakalna vrsta
              {queuedSongs.length > 0 && (
                <span className="rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {queuedSongs.length}
                </span>
              )}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 shrink-0 transition-transform ${queuedOpen ? "" : "-rotate-90"}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {queuedOpen && (
            <div className="mt-1 px-3 pb-2 pt-1">
              {queuedError && (
                <p className="text-xs text-red-600 dark:text-red-400">{queuedError}</p>
              )}
              {queuedSongs.length === 0 && !queuedError && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Čakalna vrsta je prazna.
                </p>
              )}
              {queuedSongs.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {queuedSongs.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                          {q.title}
                        </p>
                        <p className="truncate text-neutral-500 dark:text-neutral-400">{q.author}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteQueued(q.id)}
                        disabled={queuedDeletingId === q.id}
                        aria-label="Odstrani iz čakalne vrste"
                        title="Odstrani iz čakalne vrste"
                        className="shrink-0 p-1 text-neutral-400 hover:text-red-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:text-red-400"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
