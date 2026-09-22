# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — dev server on **https://localhost:3000** (HTTPS, not HTTP — required because the backup feature uses the File System Access API / Web Share API, which need a secure context). Uses a self-signed cert auto-generated into `certificates/` on first run.
- `npm run build` — production build; static export to `out/` (`output: "export"` in `next.config.ts`).
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`).
- `npm run backup` — exports the `songs` table to `backups/songs-<timestamp>.json` via the Supabase REST API (`scripts/backup-songs.mjs`).
- No test suite exists in this repo.

Supabase Edge Functions are deployed separately from the Next.js build, via the Supabase CLI, not `npm run build`:

```powershell
supabase functions deploy guess-era
supabase functions deploy similar-songs
```

Both read one shared secret (`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`). Full one-time setup (CLI install/login/link, secret, deploy, smoke test) is documented step-by-step in README.md under "AI predlog obdobja".

## Architecture

**Fully static, client-only app — no custom server.** `next.config.ts` sets `output: "export"` (deployed to GitHub Pages by `.github/workflows/deploy.yml`, `basePath` driven by the `REPO_NAME` constant at the top of that file). The whole app is one client-component tree from `src/app/page.tsx` → `Dashboard.tsx`. There are no Next.js API routes; the only server-side code is the two Supabase Edge Functions under `supabase/functions/`, which are their own deploy target.

**All state lives in `Dashboard.tsx`.** It owns `songs`, `filters`, `activeView` (`"list" | "newest" | "popular"`), and all form/modal state, passed down as props to `SongCard`, `SongForm`, `Filters`, `SettingsMenu`. There is no global store (no Context/Redux/Zustand) — everything is prop-drilled from this one component.

**AI calls always go through a Supabase Edge Function, never straight from the browser to Anthropic.** `guess-era` (suggest a decade from title+author) and `similar-songs` (find similar songs via Claude + web search) are invoked with `supabase.functions.invoke(name, { body })` and read `ANTHROPIC_API_KEY` from `Deno.env` server-side. This is what keeps the key out of the client bundle — necessary because the app is a static export with no backend to otherwise hide it behind. Both functions share the same secret.

**Cross-component UI state (open/closed panels, theme) syncs via localStorage + a custom `window` event, not lifted React state.** See `usePersistentBool` in `Filters.tsx` and `useTheme` in `src/lib/useTheme.ts`: each reads/writes one `localStorage` key and dispatches/listens for a custom event (`komadi-storage`, `komadi-theme`) so independent component instances stay in sync without sharing a parent. This is why `Filters.tsx` exports two separate components, `FiltersToggle` (the pill button, rendered inline with the "Novo"/"Popularno" buttons in `Dashboard.tsx`) and `Filters` (the panel, rendered separately below) — they don't share props or a parent, just the same localStorage key.

**Data model:** a single Supabase table, `songs` (`supabase/schema.sql` + `supabase/migrations/`, applied by hand in the Supabase SQL Editor — there's no migration runner). `genre` and `era` are fixed enums (`GENRES`, `ERAS` in `src/lib/constants.ts`, typed as unions in `src/types/song.ts`); `mood` and `origin` are free-text and user-extensible — `DEFAULT_MOODS`/`DEFAULT_ORIGINS` are only seed suggestion lists, not constraints, and `SongForm` lets the user type a new value that then shows up in future pickers/filters. RLS policies allow public read/write with just the anon key — there is no auth, by design (personal single-user app; see "Varnostna opomba" in README.md before changing this).

**Component map:**
- `SongCard.tsx` — one song: click-anywhere-to-copy title, favorite/edit/delete, "Podobno" (AI similar-songs panel), clickable author name (sets the search filter to that author), "Akordi" pill that opens either an external link or `PdfViewer` depending on `chords_url`.
- `SongForm.tsx` — add/edit modal; the AI era-guess button lives here, plus the "Akordi (PDF)" upload (goes straight to the `song-chords` Supabase storage bucket, public URL written back to `chords_url`). Accepts either `initial` (editing an existing `Song`) or `prefill` (title/author only, used when adding a song suggested by "Podobno").
- `PdfViewer.tsx` — renders a chord PDF (from `chords_url`) directly into a `<canvas>` via `pdfjs-dist`, one page at a time, instead of leaving it to the browser's built-in PDF viewer — several mobile browsers (Android especially) don't render a PDF inline in an `<iframe>`, they just download it and offer to open it in an external app. `SongCard.tsx` decides whether to use this (own-hosted `.pdf`) or a plain external link (e.g. an Ultimate Guitar URL) based on whether `chords_url` ends in `.pdf`.
- `Filters.tsx` — `FiltersToggle` + `Filters`, see above.
- `SettingsMenu.tsx` — theme switch, backup (download/share via `src/lib/backup.ts`), and song import (via `src/lib/importSongs.ts`), behind one dropdown.
- `src/lib/importSongs.ts` — parses the two supported bulk-import formats (custom `.txt`, and `.json`) into `NewSong[]`; format spec is in README.md "Uvoz skladb". Bulk import never sets `chords_url`/`image_url` — those are always added afterwards, per song, through the UI (or directly against Supabase).

## Windows/Turbopack dev quirks

- Tailwind v4's important modifier is a **trailing** `!` (`mt-3!`) — a leading `!mt-3` (the v3 syntax) is silently ignored, not an error.
- The dev server sometimes doesn't pick up new Tailwind arbitrary-value/important classes via HMR. If a style change doesn't appear, kill the dev server and re-run `npm run dev` before assuming the class is wrong.
- Turbopack's CSS worker has been observed to crash on Windows (exit code `0xc0000142`) after repeated hot-reloads. If `next dev` starts returning 500s on every request, stop it, `rm -rf .next`, and restart.
- After `git pull` adds a new dependency to `package.json`, `node_modules` doesn't update itself — `npm run dev` will start fine but the feature using that dependency fails at runtime (e.g. `PdfViewer.tsx` throwing "Cannot find module 'pdfjs-dist'" the first time it renders). Run `npm install` after any pull that touches `package.json`/`package-lock.json`, then restart the dev server.

## GitHub Pages `basePath` gotcha

Production is served under `/Komadi/...` (`basePath` in `next.config.ts`, only set when `GITHUB_PAGES=true`), but `npm run dev` has an empty `basePath`. Any **root-absolute** hardcoded asset path (`/images/eras/60s.jpg`, `/icons/foo.svg`, …) therefore 404s in production while working perfectly in dev — this already broke the era-card images once. Prefix such paths with `process.env.NEXT_PUBLIC_BASE_PATH` (see `ERA_IMAGES` in `src/lib/constants.ts`, or `RegisterServiceWorker.tsx` for the same pattern applied to `sw.js`). Metadata-API paths (`icons: {...}` in `layout.tsx`) are fine as-is as long as they're written *without* a leading slash — Next resolves those against `basePath` automatically. Before trusting a new hardcoded static path, verify it survives a real production build: `GITHUB_PAGES=true npm run build` and grep `out/` (or the built JS chunks) for the path.
