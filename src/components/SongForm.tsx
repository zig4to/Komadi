"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { ERAS, GENRES } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import type { NewSong, Song } from "@/types/song";

const emptyForm = {
  title: "",
  author: "",
  genre: GENRES[0],
  era: ERAS[0],
  favorite: false,
  mood: null as string | null,
  origin: null as string | null,
  image_url: null as string | null,
};

export default function SongForm({
  initial,
  prefill,
  knownMoods,
  knownOrigins,
  authorImages,
  onSetAuthorImage,
  onSaved,
  onClose,
}: {
  initial?: Song | null;
  prefill?: { title: string; author: string } | null;
  knownMoods: string[];
  knownOrigins: string[];
  authorImages: Record<string, string>;
  onSetAuthorImage: (author: string, imageUrl: string | null) => void | Promise<void>;
  onSaved: (song: Song, mode: "insert" | "update") => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          author: initial.author,
          genre: initial.genre,
          era: initial.era,
          favorite: initial.favorite,
          mood: initial.mood,
          origin: initial.origin,
          image_url: initial.image_url,
        }
      : prefill
        ? { ...emptyForm, title: prefill.title, author: prefill.author }
        : emptyForm,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guessing, setGuessing] = useState(false);
  const [guessError, setGuessError] = useState<string | null>(null);
  const [addingMood, setAddingMood] = useState(false);
  const [addingOrigin, setAddingOrigin] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authorImage = authorImages[form.author.trim()] ?? null;

  async function handleImageFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const author = form.author.trim();
    if (!file || !author) return;
    setUploadingImage(true);
    setImageError(null);
    try {
      const blob = await compressImage(file);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("song-images")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("song-images").getPublicUrl(path);
      await onSetAuthorImage(author, data.publicUrl);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Nalaganje slike ni uspelo.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleRemoveAuthorImage() {
    const author = form.author.trim();
    if (!author) return;
    await onSetAuthorImage(author, null);
  }

  async function handleGuessEra() {
    if (!form.title.trim() || !form.author.trim()) {
      setGuessError("Za AI predlog najprej vnesi naslov in avtorja.");
      return;
    }
    setGuessing(true);
    setGuessError(null);

    const { data, error: fnError } = await supabase.functions.invoke("guess-era", {
      body: { title: form.title.trim(), author: form.author.trim() },
    });

    setGuessing(false);

    const era = (data as { era?: string } | null)?.era;
    if (fnError || !era) {
      setGuessError(
        (data as { error?: string } | null)?.error ??
          fnError?.message ??
          "AI predloga ni bilo mogoče pridobiti.",
      );
      return;
    }

    setForm((f) => ({ ...f, era: era as typeof f.era }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      setError("Naslov in avtor sta obvezna.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload: NewSong = {
      title: form.title.trim(),
      author: form.author.trim(),
      genre: form.genre,
      era: form.era,
      favorite: form.favorite,
      mood: form.mood?.trim() || null,
      origin: form.origin?.trim() || null,
      image_url: form.image_url,
    };

    const { data, error: dbError } = initial
      ? await supabase.from("songs").update(payload).eq("id", initial.id).select().single()
      : await supabase.from("songs").insert(payload).select().single();

    setSaving(false);

    if (dbError || !data) {
      setError(dbError?.message ?? "Napaka pri shranjevanju.");
      return;
    }

    onSaved(data as Song, initial ? "update" : "insert");
    if (!initial) {
      setForm(emptyForm);
      setAddingMood(false);
      setAddingOrigin(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {initial ? "Uredi skladbo" : "Dodaj skladbo"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-800 text-sm dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Zapri ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Naslov skladbe *">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputClass}
            placeholder="npr. Wonderwall"
          />
        </Field>

        <Field label="Avtor / izvajalec *">
          <input
            required
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            className={inputClass}
            placeholder="npr. Oasis"
          />
        </Field>

        <Field label="Žanr">
          <select
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value as typeof form.genre })}
            className={inputClass}
          >
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Obdobje">
          <div className="flex gap-2">
            <select
              value={form.era}
              onChange={(e) => setForm({ ...form, era: e.target.value as typeof form.era })}
              className={inputClass}
            >
              {ERAS.map((era) => (
                <option key={era} value={era}>
                  {era}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGuessEra}
              disabled={guessing}
              aria-label="Predlagaj obdobje z AI"
              title="Predlagaj obdobje z AI"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-neutral-300 px-2.5 text-neutral-500 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-emerald-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-[18px] w-[18px] shrink-0 ${guessing ? "animate-pulse" : ""}`}
              >
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                <path d="M20 3v4" />
                <path d="M22 5h-4" />
                <path d="M4 17v2" />
                <path d="M5 18H3" />
              </svg>
            </button>
          </div>
        </Field>

        <Field label="Razpoloženje" className="sm:col-span-2">
          {addingMood ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={form.mood ?? ""}
                onChange={(e) => setForm({ ...form, mood: e.target.value })}
                placeholder="npr. Taborniška"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  setAddingMood(false);
                  setForm({ ...form, mood: null });
                }}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              >
                Prekliči
              </button>
            </div>
          ) : (
            <select
              value={form.mood ?? ""}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setForm({ ...form, mood: null });
                  setAddingMood(true);
                  return;
                }
                setForm({ ...form, mood: e.target.value || null });
              }}
              className={inputClass}
            >
              <option value="">Brez</option>
              {knownMoods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__new__">+ Dodaj novo razpoloženje…</option>
            </select>
          )}
        </Field>

        <Field label="Izvor" className="sm:col-span-2">
          {addingOrigin ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={form.origin ?? ""}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                placeholder="npr. Balkanska"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  setAddingOrigin(false);
                  setForm({ ...form, origin: null });
                }}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              >
                Prekliči
              </button>
            </div>
          ) : (
            <select
              value={form.origin ?? ""}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setForm({ ...form, origin: null });
                  setAddingOrigin(true);
                  return;
                }
                setForm({ ...form, origin: e.target.value || null });
              }}
              className={inputClass}
            >
              <option value="">Brez</option>
              {knownOrigins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value="__new__">+ Dodaj nov izvor…</option>
            </select>
          )}
        </Field>
      </div>

      {guessError && <p className="text-sm text-amber-600 dark:text-amber-400">{guessError}</p>}

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={form.favorite}
            onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-800"
          />
          Priljubljena
        </label>

        <div className="flex items-center gap-2">
          {authorImage && (
            <div className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={authorImage} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={handleRemoveAuthorImage}
                aria-label="Odstrani sliko avtorja"
                title="Odstrani sliko avtorja"
                className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
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
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage || !form.author.trim()}
            aria-label="Naloži sliko avtorja"
            title="Naloži sliko avtorja"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-neutral-300 p-2 text-neutral-500 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-emerald-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-[18px] w-[18px] shrink-0 ${uploadingImage ? "animate-pulse" : ""}`}
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.1-3.1a2 2 0 0 0-2.814.014L6 21" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {imageError && <p className="text-sm text-red-600 dark:text-red-400">{imageError}</p>}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Prekliči
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Shranjujem…" : initial ? "Shrani spremembe" : "Shrani skladbo"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
