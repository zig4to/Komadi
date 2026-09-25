"use client";

import { useEffect, useRef, useState } from "react";

// "Glasovno" dodajanje (gumb nad "Hitro" po kliku na "+"): v dveh korakih
// posluša izvajalca in naslov prek vgrajenega prepoznavanja govora v
// brskalniku (Web Speech API — Chrome, tudi na Androidu). Na koncu odda oba
// niza, Dashboard.tsx pa ju takoj zapiše v čakalno vrsto (queued_songs).
// Brez podpore v brskalniku pokaže obvestilo.

// Minimalni tipi, ker Web Speech API ni povsod v lib.dom.
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

export function getSpeechRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Najprej izvajalec, nato naslov (enak vrstni red kot v obrazcu "Hitro").
const STEPS = [
  { key: "author", prompt: "Povej izvajalca" },
  { key: "title", prompt: "Povej naslov skladbe" },
] as const;

const LANGS = [
  { value: "sl-SI", label: "SL" },
  { value: "en-US", label: "EN" },
] as const;

// "suspicious minds" → "Suspicious Minds" — prepoznava vrne male črke.
function titleCase(s: string) {
  return s.trim().replace(/\s+/g, " ").replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());
}

export default function VoiceQuickAdd({
  onAdd,
  onCancel,
}: {
  // Zapiše v čakalno vrsto; vrne sporočilo napake ali null.
  onAdd: (title: string, author: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<(typeof LANGS)[number]["value"]>("sl-SI");
  const [values, setValues] = useState<string[]>(["", ""]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Po uspešnem dodajanju: "✓ Dodano: …" z možnostjo "Dodaj še eno".
  const [added, setAdded] = useState<string | null>(null);
  // Obvestilo "✓ Dodano" po 5 s zdrsne navzgor in izgine, nato se okno zapre.
  const [leaving, setLeaving] = useState(false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });
  useEffect(() => {
    if (!added) return;
    const hide = setTimeout(() => setLeaving(true), 5000);
    const close = setTimeout(() => onCancelRef.current(), 5500);
    return () => {
      clearTimeout(hide);
      clearTimeout(close);
    };
  }, [added]);
  const recRef = useRef<Recognition | null>(null);
  const supported = getSpeechRecognition() !== null;
  // Po naslovu mikrofon posluša še ukaz "dodaj" (EN: "add") = klik na
  // "Dodaj v tabelo". valuesRef da ukaz vidi najnovejši naslov/izvajalca.
  const [awaitingCommand, setAwaitingCommand] = useState(false);
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  });

  async function submit() {
    stop();
    setAwaitingCommand(false);
    const v = valuesRef.current;
    const title = v[STEPS.findIndex((x) => x.key === "title")].trim();
    const author = v[STEPS.findIndex((x) => x.key === "author")].trim();
    if (!title || !author) {
      setError("Manjka " + (!author ? "izvajalec" : "naslov") + " — tapni polje in ga povej.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onAdd(title, author);
    setBusy(false);
    if (err) setError(err);
    else setAdded(author + " – " + title);
  }

  function listenCommand() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    stop();
    setError(null);
    setInterim("");
    setAwaitingCommand(true);
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
      if (!finalText) return;
      setInterim("");
      setAwaitingCommand(false);
      if (/\b(dodaj|add)\b/i.test(finalText)) void submit();
      else setError("Slišal sem »" + finalText.trim() + "« — za dodajanje reci »dodaj« ali klikni gumb.");
    };
    rec.onerror = (e) => {
      setAwaitingCommand(false);
      if (e.error === "not-allowed") setError("Dostop do mikrofona ni dovoljen — dovoli ga v nastavitvah brskalnika.");
      else if (e.error !== "aborted" && e.error !== "no-speech") setError("Napaka pri prepoznavanju govora (" + e.error + ").");
    };
    rec.onend = () => {
      setListening(false);
      setAwaitingCommand(false);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
  }

  function listen(forStep: number) {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    stop();
    setError(null);
    setInterim("");
    setAwaitingCommand(false);
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
      if (finalText) {
        const text = titleCase(finalText);
        setValues((v) => v.map((x, i) => (i === forStep ? text : x)));
        setInterim("");
        // Samodejno naprej: po izvajalcu posluša naslov.
        if (forStep < STEPS.length - 1) {
          setStep(forStep + 1);
          setTimeout(() => listen(forStep + 1), 350);
        } else {
          setTimeout(() => listenCommand(), 350);
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") setError("Nisem slišal ničesar — poskusi znova.");
      else if (e.error === "not-allowed") setError("Dostop do mikrofona ni dovoljen — dovoli ga v nastavitvah brskalnika.");
      else if (e.error !== "aborted") setError("Napaka pri prepoznavanju govora (" + e.error + ").");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  // Ob odprtju takoj začne poslušati izvajalca; ob zaprtju ustavi mikrofon.
  useEffect(() => {
    const t = setTimeout(() => listen(0), 0);
    return () => {
      clearTimeout(t);
      recRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = STEPS[step];
  const done = values[0].trim() !== "" && values[1].trim() !== "";

  if (added) {
    return (
      <div
        className={`space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5 text-sm transition-all duration-500 ease-in ${
          leaving ? "-translate-y-6 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <p className="font-medium text-emerald-700 dark:text-emerald-400">✓ Dodano v čakalno vrsto: {added}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setAdded(null);
              setLeaving(false);
              setValues(["", ""]);
              setStep(0);
              listen(0);
            }}
            className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            Dodaj še eno
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          >
            Zapri
          </button>
        </div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-4 text-sm">
        <p className="text-neutral-700 dark:text-neutral-200">
          Ta brskalnik ne podpira prepoznavanja govora. Uporabi Chrome (tudi na Androidu) ali dodaj skladbo z gumbom
          &nbsp;<span className="font-medium">Hitro</span>.
        </p>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
          Nazaj
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-sky-500/40 bg-[linear-gradient(115deg,rgba(14,165,233,0.12)_15%,rgba(14,165,233,0.02)_95%)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Glasovno dodajanje</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-sky-500/40 p-0.5 text-xs" role="group" aria-label="Jezik prepoznavanja">
            {LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => {
                  setLang(l.value);
                  stop();
                }}
                aria-pressed={lang === l.value}
                className={`rounded-full px-2 py-0.5 font-medium ${lang === l.value ? "bg-sky-600 text-white" : "text-neutral-600 dark:text-neutral-300"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              stop();
              onCancel();
            }}
            className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Zapri ✕
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <button
          type="button"
          onClick={() => (listening ? stop() : done ? listenCommand() : listen(step))}
          aria-label={listening ? "Ustavi poslušanje" : "Poslušaj"}
          className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white transition ${
            listening ? "bg-sky-600" : "bg-sky-500/70 hover:bg-sky-600"
          }`}
        >
          {listening && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-sky-500/40" />}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="relative h-7 w-7"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
          </svg>
        </button>
        <p className="text-base font-medium text-neutral-800 dark:text-neutral-100">
          {listening && awaitingCommand
            ? "Reci »dodaj«, da dodaš v tabelo …"
            : listening
              ? current.prompt + " …"
              : done
                ? "Klikni »Dodaj v tabelo« ali tapni mikrofon in reci »dodaj«"
                : "Tapni mikrofon in " + current.prompt.toLowerCase()}
        </p>
        {interim && <p className="text-sm italic text-neutral-500 dark:text-neutral-400">{interim}</p>}
        {error && <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>}
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setStep(i);
              listen(i);
            }}
            className={`rounded-lg border px-3 py-2 text-left transition ${
              step === i ? "border-sky-500 bg-white/70 dark:bg-neutral-900/70" : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">{s.key === "title" ? "Naslov" : "Izvajalec"} · tapni za ponovitev</dt>
            <dd className="truncate font-medium text-neutral-900 dark:text-neutral-100">{values[i] || "—"}</dd>
          </button>
        ))}
      </dl>

      <div className="flex justify-end gap-2">
        {step === 0 && !listening && values[0] && (
          <button
            type="button"
            onClick={() => {
              setStep(1);
              listen(1);
            }}
            className="rounded-full border border-sky-500/50 px-4 py-1.5 text-sm font-medium text-sky-700 dark:text-sky-400"
          >
            Naprej
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !done}
          className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {busy ? "Dodajam…" : "Dodaj v tabelo"}
        </button>
      </div>
    </div>
  );
}
