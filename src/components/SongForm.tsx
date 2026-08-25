"use client";

import { useState } from "react";
import { DIFFICULTIES, ERAS, GENRES, STATUSES } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import type { NewSong, Song } from "@/types/song";

const emptyForm = {
  title: "",
  author: "",
  genre: GENRES[0],
  era: ERAS[0],
  song_key: "",
  capo: "",
  difficulty: "",
  status: STATUSES[0],
  link: "",
  favorite: false,
  notes: "",
};

export default function SongForm({
  onAdded,
  onClose,
}: {
  onAdded: (song: Song) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      song_key: form.song_key.trim() || null,
      capo: form.capo === "" ? null : Number(form.capo),
      difficulty: (form.difficulty || null) as NewSong["difficulty"],
      status: form.status,
      link: form.link.trim() || null,
      favorite: form.favorite,
      notes: form.notes.trim() || null,
    };

    const { data, error: insertError } = await supabase
      .from("songs")
      .insert(payload)
      .select()
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Napaka pri shranjevanju.");
      return;
    }

    onAdded(data as Song);
    setForm(emptyForm);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dodaj skladbo</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-200 text-sm"
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
        </Field>

        <Field label="Tonaliteta">
          <input
            value={form.song_key}
            onChange={(e) => setForm({ ...form, song_key: e.target.value })}
            className={inputClass}
            placeholder="npr. Em"
          />
        </Field>

        <Field label="Kapo (0–11)">
          <input
            type="number"
            min={0}
            max={11}
            value={form.capo}
            onChange={(e) => setForm({ ...form, capo: e.target.value })}
            className={inputClass}
            placeholder="npr. 2"
          />
        </Field>

        <Field label="Težavnost">
          <select
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            className={inputClass}
          >
            <option value="">— brez —</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status učenja">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Povezava (akordi / video)" className="sm:col-span-2">
          <input
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
            className={inputClass}
            placeholder="https://..."
          />
        </Field>

        <Field label="Opombe" className="sm:col-span-2">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={inputClass}
            rows={2}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={form.favorite}
          onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-700 bg-neutral-800"
        />
        Priljubljena
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Prekliči
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Shranjujem…" : "Shrani skladbo"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none";

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
