// Skupen sklad zgodovinskih vnosov, ki ga uporablja useBackableOpen: vsak
// odprt "pod-pogled" (filter, PDF pregled, obrazec, panel filtrov, meni ...)
// potisne en vnos in se ob sistemskem gumbu "Nazaj" (popstate) zapre v
// vrstnem redu LIFO (nazadnje odprt, prvi zaprt).
type CloseFn = () => void;

const stack: { id: number; onClose: CloseFn }[] = [];
let nextId = 1;
// Ko sami pokličemo history.back() (zapiranje prek obstoječega gumba, ne
// prek sistemskega Nazaj), se sproži svoj popstate, ki ga moramo prezreti —
// sicer bi po nepotrebnem zaprli še kaj drugega ali podvojili zaporno akcijo.
let suppressNext = 0;
let listening = false;
// history.back() je asinhron: če v istem izrisu en pogled zapremo in drugega
// odpremo (npr. klik v meniju ⋮ zapre meni in odpre "Popravi skladbe"), bi
// pushState novega pogleda tekmoval s še nedokončanim back() prejšnjega in
// zgodovina bi se zamaknila — sistemski Nazaj bi nato zaprl aplikacijo namesto
// pogleda. Zato pushState počaka, da se vsi naši back() klici zaključijo.
let pendingPushes: number[] = [];

function flushPendingPushes() {
  for (const id of pendingPushes) window.history.pushState({ komadiBackId: id }, "");
  pendingPushes = [];
}

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", () => {
    if (suppressNext > 0) {
      suppressNext--;
      if (suppressNext === 0) flushPendingPushes();
      return;
    }
    const top = stack.pop();
    top?.onClose();
  });
}

export function pushBackable(onClose: CloseFn): number {
  ensureListener();
  const id = nextId++;
  stack.push({ id, onClose });
  if (suppressNext > 0) pendingPushes.push(id);
  else window.history.pushState({ komadiBackId: id }, "");
  return id;
}

export function popBackable(id: number) {
  const idx = stack.findIndex((e) => e.id === id);
  if (idx === -1) return; // že odstranjeno prek popstate (uporabnik je pritisnil Nazaj)
  stack.splice(idx, 1);
  if (pendingPushes.includes(id)) {
    // Vnos še ni bil potisnjen v zgodovino — samo ga ne potisnemo.
    pendingPushes = pendingPushes.filter((p) => p !== id);
    return;
  }
  suppressNext++;
  window.history.back();
}
