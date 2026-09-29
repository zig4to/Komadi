"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyEditedText,
  isChordLineText,
  isSectionText,
  isTabStaffText,
  toEditableText,
  transposeEditedLine,
} from "@/lib/chords";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import type { Song } from "@/types/song";

// Napredni urejevalnik besedila z akordi in tablatur (gumb "Uredi besedilo"
// na strani "Popravi skladbe"). Isti zapis kot "Uredi besedilo in akorde" v
// ChordsViewer.tsx (akordi v svoji vrstici nad besedilom, brez UG oznak), ob
// shranjevanju pa applyEditedText ohrani nespremenjene vrstice v UG obliki.
// Dodatno: barvanje vrstic (akordi / razdelki / tablatura), številke vrstic,
// način prepisovanja, premik akorda po stolpcih, stolpci tablature,
// transponiranje, iskanje in zamenjava, razveljavi/uveljavi.

const FONT_KEY = "komadi:editor:font";
const FONT_MIN = 11;
const FONT_MAX = 22;
const LINE_HEIGHT = 1.5;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const SECTIONS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Solo", "Outro"];
const TAB_TEMPLATE = ["e", "B", "G", "D", "A", "E"].map((s) => `${s}|${"-".repeat(32)}|`).join("\n");

type Snapshot = { text: string; start: number; end: number };

function lineKind(line: string): "section" | "chords" | "tab" | "text" {
  if (isSectionText(line)) return "section";
  if (isTabStaffText(line)) return "tab";
  if (isChordLineText(line)) return "chords";
  return "text";
}

const KIND_CLASS = {
  section: "text-violet-600 dark:text-violet-400",
  chords: "text-orange-600 dark:text-orange-400",
  tab: "text-emerald-700 dark:text-emerald-400",
  text: "text-neutral-800 dark:text-neutral-100",
} as const;

const KIND_LABEL = { section: "Razdelek", chords: "Akordi", tab: "Tablatura", text: "Besedilo" } as const;

// Začetek in konec vrstice, v kateri je položaj `pos`.
function lineBounds(text: string, pos: number) {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  const nl = text.indexOf("\n", pos);
  return { start, end: nl === -1 ? text.length : nl };
}

function readFont() {
  try {
    const n = Number(window.localStorage.getItem(FONT_KEY));
    return n >= FONT_MIN && n <= FONT_MAX ? n : 15;
  } catch {
    return 15;
  }
}

function ToolButton({
  onClick,
  title,
  active = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // obdrži fokus/izbiro v urejevalniku
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition disabled:opacity-40 ${
        active
          ? "border-orange-400 bg-orange-400/15 text-orange-700 dark:text-orange-300"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="mr-0.5 hidden text-[10px] font-semibold uppercase tracking-wide text-neutral-400 sm:inline">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function ChordsTextEditor({
  song,
  onClose,
  onSaved,
}: {
  song: Song;
  onClose: () => void;
  onSaved: (chordsText: string) => void;
}) {
  const original = song.chords_text ?? "";
  const initial = toEditableText(original);
  const [text, setText] = useState(initial);
  const [overwrite, setOverwrite] = useState(false);
  const [fontSize, setFontSize] = useState(readFont);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const history = useRef<{ undo: Snapshot[]; redo: Snapshot[]; last: number }>({ undo: [], redo: [], last: 0 });
  const dirty = text !== initial;

  useEffect(() => {
    try {
      window.localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {
      // brez localStorage — velikost velja samo za to odprtje
    }
  }, [fontSize]);

  // --- Spremembe besedila z zgodovino (razveljavi/uveljavi) ---

  function selection() {
    const ta = taRef.current;
    return { start: ta?.selectionStart ?? 0, end: ta?.selectionEnd ?? 0 };
  }

  function setSelection(start: number, end = start) {
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
      updateCaret();
    });
  }

  // `coalesce`: tipkanje v kratkem času se združi v en korak razveljavitve.
  // `moveCaret`: orodja postavijo kazalec; pri navadnem tipkanju (onChange) ga
  // ne premikamo, da ne motimo tipkovnice na telefonu (samodokončanje).
  function commit(next: string, start: number, end = start, coalesce = false, moveCaret = true) {
    if (next === text) return moveCaret ? setSelection(start, end) : undefined;
    const h = history.current;
    const now = Date.now();
    const sel = selection();
    if (!(coalesce && now - h.last < 700 && h.undo.length > 0)) h.undo.push({ text, start: sel.start, end: sel.end });
    if (h.undo.length > 300) h.undo.shift();
    h.redo = [];
    h.last = coalesce ? now : 0;
    setCanUndo(true);
    setCanRedo(false);
    setText(next);
    if (moveCaret) setSelection(start, end);
  }

  function undo() {
    const h = history.current;
    const snap = h.undo.pop();
    if (!snap) return;
    const sel = selection();
    h.redo.push({ text, start: sel.start, end: sel.end });
    h.last = 0;
    setText(snap.text);
    setCanUndo(h.undo.length > 0);
    setCanRedo(true);
    setSelection(snap.start, snap.end);
  }

  function redo() {
    const h = history.current;
    const snap = h.redo.pop();
    if (!snap) return;
    const sel = selection();
    h.undo.push({ text, start: sel.start, end: sel.end });
    h.last = 0;
    setText(snap.text);
    setCanUndo(true);
    setCanRedo(h.redo.length > 0);
    setSelection(snap.start, snap.end);
  }

  function updateCaret() {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const line = before.split("\n").length;
    const col = pos - (before.lastIndexOf("\n") + 1) + 1;
    setCaret({ line, col });
  }

  // --- Urejevalna orodja ---

  // Način prepisovanja: znak nadomesti tistega pod kazalcem (ne na koncu vrstice).
  function typeOverwrite(ch: string) {
    const { start, end } = selection();
    if (start !== end) return false;
    const { end: lineEnd } = lineBounds(text, start);
    const replaceLen = start < lineEnd ? 1 : 0;
    commit(text.slice(0, start) + ch + text.slice(start + replaceLen), start + 1, start + 1, true);
    return true;
  }

  // Premik akorda (ali drugega kosa) pod kazalcem v vrstici akordov za en
  // stolpec levo/desno — ostali akordi ostanejo na mestu.
  function moveChord(dir: -1 | 1) {
    const { start } = selection();
    const { start: ls, end: le } = lineBounds(text, start);
    const line = text.slice(ls, le);
    const col = start - ls;
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let tok: { s: number; e: number } | null = null;
    while ((m = re.exec(line))) {
      if (col >= m.index && col <= m.index + m[0].length) {
        tok = { s: m.index, e: m.index + m[0].length };
        break;
      }
    }
    if (!tok) return;
    let next = line;
    if (dir === 1) {
      // Pred naslednjim kosom mora ostati vsaj en presledek.
      if (tok.e < line.length && !(line[tok.e] === " " && line[tok.e + 1] === " ") && tok.e + 1 < line.length) return;
      next = line.slice(0, tok.s) + " " + line.slice(tok.s, tok.e) + line.slice(tok.e + (tok.e < line.length ? 1 : 0));
    } else {
      if (tok.s === 0 || line[tok.s - 1] !== " " || (tok.s >= 2 && line[tok.s - 2] !== " ")) return;
      const after = tok.e < line.length ? " " : "";
      next = line.slice(0, tok.s - 1) + line.slice(tok.s, tok.e) + after + line.slice(tok.e);
    }
    commit(text.slice(0, ls) + next + text.slice(le), start + dir);
  }

  // Zaporedne vrstice tablature okoli kazalca (en blok strun).
  function tabBlock() {
    const lines = text.split("\n");
    const { start } = selection();
    const cur = text.slice(0, start).split("\n").length - 1;
    if (!isTabStaffText(lines[cur] ?? "")) return null;
    let a = cur;
    let b = cur;
    while (a > 0 && isTabStaffText(lines[a - 1])) a--;
    while (b < lines.length - 1 && isTabStaffText(lines[b + 1])) b++;
    const col = start - (text.lastIndexOf("\n", start - 1) + 1);
    return { lines, a, b, col, cur };
  }

  // Vstavi/odstrani stolpec v vseh strunah bloka hkrati (strune ostanejo poravnane).
  function tabColumn(add: boolean) {
    const blk = tabBlock();
    if (!blk) return;
    const { lines, a, b, col, cur } = blk;
    for (let i = a; i <= b; i++) {
      const l = lines[i];
      if (add) lines[i] = l.length >= col ? l.slice(0, col) + "-" + l.slice(col) : l.padEnd(col, "-") + "-";
      else if (col < l.length) lines[i] = l.slice(0, col) + l.slice(col + 1);
    }
    const next = lines.join("\n");
    const pos = lines.slice(0, cur).reduce((n, l) => n + l.length + 1, 0) + col + (add ? 1 : 0);
    commit(next, pos);
  }

  function insertBlock(block: string) {
    const { start } = selection();
    const { start: ls, end: le } = lineBounds(text, start);
    const line = text.slice(ls, le);
    // Prazna vrstica se zamenja, sicer se blok vstavi pred trenutno vrstico.
    const next = line.trim() === "" ? text.slice(0, ls) + block + text.slice(le) : text.slice(0, ls) + block + "\n" + text.slice(ls);
    commit(next, ls + block.length);
  }

  function transpose(semitones: number) {
    const { start, end } = selection();
    const lines = text.split("\n");
    let a = 0;
    let b = lines.length - 1;
    if (start !== end) {
      a = text.slice(0, start).split("\n").length - 1;
      b = text.slice(0, end).split("\n").length - 1;
    }
    for (let i = a; i <= b; i++) lines[i] = transposeEditedLine(lines[i], semitones);
    commit(lines.join("\n"), start, end);
  }

  function trimTrailing() {
    const { start } = selection();
    commit(text.split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n"), Math.min(start, text.length));
  }

  function findNext() {
    if (!find) return;
    const hay = text.toLowerCase();
    const needle = find.toLowerCase();
    const { end } = selection();
    let i = hay.indexOf(needle, end);
    if (i === -1) i = hay.indexOf(needle);
    if (i === -1) return setError(`»${find}« ni najden.`);
    setError(null);
    setSelection(i, i + find.length);
  }

  function replaceOne() {
    const { start, end } = selection();
    if (find && text.slice(start, end).toLowerCase() === find.toLowerCase()) {
      commit(text.slice(0, start) + replace + text.slice(end), start + replace.length);
    }
    requestAnimationFrame(findNext);
  }

  function replaceAll() {
    if (!find) return;
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const count = (text.match(re) ?? []).length;
    if (count === 0) return setError(`»${find}« ni najden.`);
    setError(null);
    commit(text.replace(re, replace), 0);
  }

  const matchCount = find ? (text.toLowerCase().split(find.toLowerCase()).length - 1) : 0;

  // --- Shrani / zapri ---

  async function save() {
    if (!dirty) return onClose();
    setSaving(true);
    setError(null);
    const next = applyEditedText(original, text);
    const { error: dbError } = await supabase.from("songs").update({ chords_text: next }).eq("id", song.id);
    setSaving(false);
    if (dbError) return setError(`Shranjevanje ni uspelo: ${dbError.message}`);
    onSaved(next);
    onClose();
  }

  function requestClose() {
    if (dirty && !window.confirm("Zavržem spremembe?")) return;
    onClose();
  }

  useBackableOpen(true, requestClose);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "s") return e.preventDefault(), void save();
    if (mod && k === "z" && !e.shiftKey) return e.preventDefault(), undo();
    if (mod && (k === "y" || (k === "z" && e.shiftKey))) return e.preventDefault(), redo();
    if (mod && k === "f") return e.preventDefault(), setFindOpen(true);
    if (e.key === "Escape") return e.preventDefault(), requestClose();
    if (e.key === "Insert") return e.preventDefault(), setOverwrite((v) => !v);
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      return moveChord(e.key === "ArrowLeft" ? -1 : 1);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const { start, end } = selection();
      return commit(text.slice(0, start) + "  " + text.slice(end), start + 2);
    }
    if (overwrite && !mod && !e.altKey && e.key.length === 1) {
      if (typeOverwrite(e.key)) e.preventDefault();
    }
  }

  function syncScroll() {
    const ta = taRef.current;
    if (!ta) return;
    if (hlRef.current) hlRef.current.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  const lines = text.split("\n");
  const currentKind = lineKind(lines[caret.line - 1] ?? "");
  const inTab = currentKind === "tab";
  const metrics = { fontFamily: MONO, fontSize, lineHeight: LINE_HEIGHT };
  const lineH = fontSize * LINE_HEIGHT;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div data-view-portal className="fixed inset-0 z-50 flex flex-col bg-white text-neutral-900 dark:bg-[#0d0d10] dark:text-neutral-100">
      {/* Glava */}
      <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{song.title}</p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{song.author} · urejanje besedila in akordov</p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          disabled={saving}
          className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          Prekliči
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full border border-orange-400 bg-orange-400/15 px-3 py-1 text-xs font-semibold text-orange-700 disabled:opacity-50 dark:text-orange-300"
        >
          {saving ? "Shranjujem …" : "Shrani"}
        </button>
      </div>

      {/* Orodna vrstica */}
      <div className="flex gap-3 overflow-x-auto border-b border-neutral-200 px-3 py-2 [scrollbar-width:thin] dark:border-neutral-800">
        <Group label="Uredi">
          <ToolButton onClick={undo} disabled={!canUndo} title="Razveljavi (Ctrl+Z)">↶</ToolButton>
          <ToolButton onClick={redo} disabled={!canRedo} title="Uveljavi (Ctrl+Y)">↷</ToolButton>
          <ToolButton onClick={() => setOverwrite((v) => !v)} active={overwrite} title="Način prepisovanja (Insert) — tipkanje nadomesti znake, poravnava ostane">
            Prepiši
          </ToolButton>
          <ToolButton onClick={() => setFindOpen((v) => !v)} active={findOpen} title="Poišči in zamenjaj (Ctrl+F)">
            Išči
          </ToolButton>
        </Group>
        <Group label="Akord">
          <ToolButton onClick={() => moveChord(-1)} title="Premakni akord pod kazalcem levo (Alt+←)">◂ akord</ToolButton>
          <ToolButton onClick={() => moveChord(1)} title="Premakni akord pod kazalcem desno (Alt+→)">akord ▸</ToolButton>
          <ToolButton onClick={() => transpose(-1)} title="Transponiraj za pol tona nižje (izbor ali cela pesem)">−½</ToolButton>
          <ToolButton onClick={() => transpose(1)} title="Transponiraj za pol tona višje (izbor ali cela pesem)">+½</ToolButton>
        </Group>
        <Group label="Tab">
          <ToolButton onClick={() => insertBlock(TAB_TEMPLATE)} title="Vstavi prazno tablaturo s 6 strunami">+ tab</ToolButton>
          <ToolButton onClick={() => tabColumn(true)} disabled={!inTab} title="Vstavi stolpec v vse strune (kazalec v tablaturi)">+ stolpec</ToolButton>
          <ToolButton onClick={() => tabColumn(false)} disabled={!inTab} title="Odstrani stolpec iz vseh strun (kazalec v tablaturi)">− stolpec</ToolButton>
        </Group>
        <Group label="Razdelek">
          {SECTIONS.map((s) => (
            <ToolButton key={s} onClick={() => insertBlock(`[${s}]`)} title={`Vstavi razdelek [${s}]`}>
              {s}
            </ToolButton>
          ))}
        </Group>
        <Group label="Prikaz">
          <ToolButton onClick={() => setFontSize((f) => Math.max(FONT_MIN, f - 1))} title="Manjša pisava">A−</ToolButton>
          <ToolButton onClick={() => setFontSize((f) => Math.min(FONT_MAX, f + 1))} title="Večja pisava">A+</ToolButton>
          <ToolButton onClick={trimTrailing} title="Odstrani presledke na koncu vrstic">Počisti</ToolButton>
        </Group>
      </div>

      {/* Iskanje in zamenjava */}
      {findOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
          <input
            autoFocus
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), findNext())}
            placeholder="Poišči"
            className="w-36 rounded-lg border border-neutral-300 bg-transparent px-2 py-1 outline-none focus:border-orange-400 dark:border-neutral-700"
          />
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="Zamenjaj z"
            className="w-36 rounded-lg border border-neutral-300 bg-transparent px-2 py-1 outline-none focus:border-orange-400 dark:border-neutral-700"
          />
          <ToolButton onClick={findNext} title="Naslednji zadetek (Enter)">Naslednji</ToolButton>
          <ToolButton onClick={replaceOne} title="Zamenjaj izbrani zadetek">Zamenjaj</ToolButton>
          <ToolButton onClick={replaceAll} title="Zamenjaj vse zadetke">Vse</ToolButton>
          <span className="text-neutral-500">{find ? `${matchCount} zadetkov` : ""}</span>
        </div>
      )}

      {error && <p className="px-3 pt-2 text-xs font-medium text-red-500">{error}</p>}

      {/* Urejevalnik: številke vrstic + obarvan odtis pod prozornim textarea */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative w-11 shrink-0 overflow-hidden border-r border-neutral-200 bg-neutral-50 text-right text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50">
          <div ref={gutterRef} className="pr-2 pt-3" style={metrics}>
            {lines.map((_, i) => (
              <div
                key={i}
                style={{ height: lineH }}
                className={i + 1 === caret.line ? "font-semibold text-orange-500" : ""}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div ref={hlRef} className="p-3" style={{ ...metrics, whiteSpace: "pre" }}>
              {lines.map((l, i) => (
                <div
                  key={i}
                  style={{ height: lineH }}
                  className={`${KIND_CLASS[lineKind(l)]} ${i + 1 === caret.line ? "bg-orange-400/10" : ""}`}
                >
                  {l || " "}
                </div>
              ))}
            </div>
          </div>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => commit(e.target.value, e.target.selectionStart, e.target.selectionEnd, true, false)}
            onKeyDown={onKeyDown}
            onSelect={updateCaret}
            onClick={updateCaret}
            onKeyUp={updateCaret}
            onScroll={syncScroll}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-label="Besedilo in akordi"
            style={{ ...metrics, caretColor: "#fb923c", color: "transparent", whiteSpace: "pre" }}
            className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-3 outline-none selection:bg-orange-400/30"
          />
        </div>
      </div>

      {/* Stanje */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span>
          Vrstica {caret.line}, stolpec {caret.col}
        </span>
        <span className={KIND_CLASS[currentKind]}>{KIND_LABEL[currentKind]}</span>
        <span>{overwrite ? "PREPISOVANJE" : "VSTAVLJANJE"}</span>
        <span className="hidden sm:inline">Ctrl+S shrani · Alt+←/→ premakne akord · Insert prepisovanje</span>
        {dirty && <span className="ml-auto font-medium text-orange-600 dark:text-orange-400">Neshranjene spremembe</span>}
      </div>
    </div>,
    document.body,
  );
}
