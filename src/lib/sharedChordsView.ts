// Skupni pogled akordov v Skupnem Jamu: kdor prvi odpre akorde (vodja), ostali
// v Skupnem Jamu vidijo isto skladbo na isti višini, isti Smart play in
// celozaslonski način. Supabase Realtime Broadcast (kanal "shared-jam-view"),
// nič v bazi. Pošiljanje/prejem v Dashboard.tsx, izris v ChordsViewer.tsx.

// Položaj strani neodvisno od velikosti pisave in zaslona: prva vidna vrstica
// pesmi (data-line) in koliko je je že odpomaknjene (0 … 1). line -1 = nad
// prvo vrstico (naslov, opis) — frac je delež poti do nje.
export type ViewAnchor = { line: number; frac: number };

// Kar vidi vodja (brez osebnih nastavitev: transpozicija, pisava, barve).
export type LocalView = {
  anchor: ViewAnchor;
  smart: { line: number; chord: { line: number; chord: number } | null } | null;
  fullscreen: boolean;
  // "Sam Špili": samo ko ima vodja odprt Sam Špili in že igra.
  ss?: SamSpiliView;
};

// "Sam Špili": vrstica (indeks v ssLines, -1 = pred prvo), napredek v njej ob
// pošiljanju (p, 0–1) in koliko napredka na sekundo (rate = 1/trajanje vrstice,
// 0 med pavzo) — napredek v vrstici je linearen s časom, zato sledilec med
// sporočili izračuna natanko isti položaj kot vodja. hl = poudarjena vrstica telesa.
export type SamSpiliView = { row: number; p: number; rate: number; hl: number; playing: boolean };

// Zadnji pogled vodje — mimo React stanja: sporočila (~10/s) bi sicer vsakič
// na novo izrisala Dashboard in pregledovalnik, kar na telefonu zatika drsenje.
// Dashboard objavi, ChordsViewer (sledilec) posluša. at = performance.now() ob prejemu.
export type RemoteViewEntry = { songId: string; view: LocalView; at: number };
let remoteEntry: RemoteViewEntry | null = null;
const remoteListeners = new Set<(entry: RemoteViewEntry | null) => void>();
export function publishRemoteView(songId: string | null, view?: LocalView) {
  remoteEntry = songId && view ? { songId, view, at: performance.now() } : null;
  remoteListeners.forEach((cb) => cb(remoteEntry));
}
export function getRemoteView() {
  return remoteEntry;
}
export function subscribeRemoteView(cb: (entry: RemoteViewEntry | null) => void) {
  remoteListeners.add(cb);
  return () => {
    remoteListeners.delete(cb);
  };
}

export type SharedViewMessage =
  // since = kdaj je vodja začel voditi — ob sočasnem odprtju vodi tisti, ki je začel prej.
  // mode = način pregledovalnika pri vodji ("samspili" ali null) — sledilci ga odprejo enako.
  | ({ type: "view"; leaderId: string; leaderName: string; songId: string; since: number; mode?: "samspili" | null } & LocalView)
  | { type: "close"; leaderId: string };

export const SHARED_VIEW_HEARTBEAT_MS = 2000;
// Brez srčnega utripa toliko časa: vodja je odšel, vodi lahko drug.
export const SHARED_VIEW_STALE_MS = 8000;

function lines(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-line]")];
}

export function computeAnchor(container: HTMLElement): ViewAnchor {
  const top = container.getBoundingClientRect().top;
  const all = lines(container);
  if (!all.length) return { line: -1, frac: 0 };
  const first = all[0].getBoundingClientRect();
  if (first.top > top) {
    // Nad prvo vrstico: delež poti od vrha vsebine do nje.
    const toFirst = container.scrollTop + first.top - top;
    return { line: -1, frac: toFirst > 0 ? Math.min(1, container.scrollTop / toFirst) : 0 };
  }
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top) {
      const frac = r.height > 0 ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0;
      return { line: Number(el.dataset.line), frac: Math.round(frac * 1000) / 1000 };
    }
  }
  return { line: Number(all[all.length - 1].dataset.line), frac: 1 };
}

// Scroll pozicija (px), pri kateri je sidro na vrhu tega vsebnika.
export function anchorScrollTop(container: HTMLElement, anchor: ViewAnchor): number | null {
  const top = container.getBoundingClientRect().top;
  if (anchor.line < 0) {
    const first = container.querySelector<HTMLElement>("[data-line]");
    if (!first) return 0;
    const toFirst = container.scrollTop + first.getBoundingClientRect().top - top;
    return Math.max(0, anchor.frac * toFirst);
  }
  const el = container.querySelector<HTMLElement>(`[data-line="${anchor.line}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return Math.max(0, container.scrollTop + r.top - top + anchor.frac * r.height);
}
