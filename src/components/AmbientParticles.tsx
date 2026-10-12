"use client";

import { useEffect, useRef } from "react";

// Živi delci v ozadju aplikacije (BACKGROUNDS[i].particles). En <canvas> čez cel
// zaslon, animacija stoji v skritem zavihku; ob prefers-reduced-motion se izriše
// le mirujoča slika.
// - dust / bokeh / stars: Morska megla, Jutranji grafit, Polnočno modra (čez cel zaslon)
// - glasbeni delci temne serije, malo jih je in so ob levem in desnem robu (proti
//   sredini z vsebino zbledijo): notes (Globina), ripples (Gozdni potok),
//   strings (Jeklo), waves (Severni sij), chords (Dim)
export type ParticleKind = "dust" | "bokeh" | "stars" | "notes" | "ripples" | "strings" | "waves" | "chords";

type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; ph: number; sp: number; life: number; span: number; text: string };

// Število delcev pri ~1600×900 (manjši zaslon sorazmerno manj, a ne pod polovico).
const DENSITY: Record<ParticleKind, number> = { dust: 90, bokeh: 16, stars: 110, notes: 10, ripples: 4, strings: 6, waves: 4, chords: 8 };
const NOTE_GLYPHS = ["♪", "♫", "♩", "♬"];
const CHORD_NAMES = ["Am", "G", "C", "D", "Em", "F", "E7", "Dm", "A", "G7", "Bm", "Cadd9"];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
// x blizu levega ali desnega roba (zunanjih ~25 %).
const sideX = (w: number) => {
  const d = Math.pow(Math.random(), 1.6) * w * 0.26;
  return Math.random() < 0.5 ? d : w - d;
};
// Prosojnost glede na oddaljenost od roba (sredina z vsebino mirna).
const edgeFade = (x: number, w: number) => Math.max(0, 1 - (Math.min(x, w - x) / (w * 0.5)) * 1.6);

function make(kind: ParticleKind, w: number, h: number, dpr: number, i: number, n: number, initial: boolean): P {
  const p: P = { x: rand(0, w), y: rand(0, h), r: 1, vx: 0, vy: 0, a: 1, ph: rand(0, 6.28), sp: 1, life: 0, span: 1, text: "" };
  switch (kind) {
    case "dust":
      return { ...p, r: rand(0.5, 1.6) * dpr, vx: rand(-6, 6) * dpr, vy: rand(-4, 2) * dpr, a: rand(0.15, 0.5), sp: 0.6 };
    case "bokeh":
      return { ...p, r: rand(26, 90) * dpr, vx: rand(-5, 5) * dpr, vy: rand(-4, 4) * dpr, a: rand(0.03, 0.07), sp: 0.35 };
    case "stars":
      return { ...p, r: rand(0.4, 1.4) * dpr, vx: rand(-2, 2) * dpr, vy: rand(-1.5, 1.5) * dpr, a: rand(0.25, 0.85), sp: rand(0.6, 2.2) };
    case "notes":
      return { ...p, x: sideX(w), y: initial ? rand(0, h) : h + 30 * dpr, r: rand(14, 26) * dpr, vy: -rand(10, 22) * dpr, sp: rand(0.4, 0.9), a: rand(0.18, 0.32), text: pick(NOTE_GLYPHS) };
    case "chords":
      return { ...p, x: sideX(w), y: initial ? rand(0, h) : h + 30 * dpr, r: rand(13, 20) * dpr, vy: -rand(7, 14) * dpr, sp: rand(0.3, 0.7), a: rand(0.14, 0.26), text: pick(CHORD_NAMES) };
    case "ripples":
      // Krog se razširi z mesta ob robu; zamik ob začetku, da ne začnejo hkrati.
      return { ...p, x: sideX(w), y: rand(h * 0.1, h * 0.9), r: rand(70, 140) * dpr, life: initial ? -rand(0, 1) : -rand(0.2, 1.4), span: rand(4, 7) };
    case "strings": {
      // Polovica strun levo, polovica desno; navpične, rahlo nagnjene.
      const left = i < n / 2;
      const k = left ? i : i - Math.ceil(n / 2);
      return { ...p, x: left ? w * (0.04 + k * 0.035) : w * (0.96 - k * 0.035), a: 0, life: initial ? rand(0, 1) : 0, span: rand(5, 11), r: rand(5, 10) * dpr };
    }
    case "waves": {
      const left = i < n / 2;
      const k = left ? i : i - Math.ceil(n / 2);
      return { ...p, x: left ? w * (0.06 + k * 0.05) : w * (0.94 - k * 0.05), r: rand(10, 18) * dpr, sp: rand(0.5, 0.9), span: rand(90, 150) * dpr };
    }
  }
}

function wrap(p: P, w: number, h: number, m: number) {
  if (p.x < -m) p.x = w + m;
  if (p.x > w + m) p.x = -m;
  if (p.y < -m) p.y = h + m;
  if (p.y > h + m) p.y = -m;
}

function draw(kind: ParticleKind, ctx: CanvasRenderingContext2D, parts: P[], w: number, h: number, dpr: number, dt: number, t: number) {
  ctx.clearRect(0, 0, w, h);
  const n = parts.length;

  if (kind === "stars") {
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      wrap(p, w, h, 10);
    }
    // Bližnje zvezde povezane s tankimi črtami.
    const max = 110 * dpr;
    ctx.lineWidth = 0.6 * dpr;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(parts[i].x - parts[j].x, parts[i].y - parts[j].y);
        if (d < max) {
          ctx.strokeStyle = `rgba(191, 219, 254, ${0.12 * (1 - d / max)})`;
          ctx.beginPath();
          ctx.moveTo(parts[i].x, parts[i].y);
          ctx.lineTo(parts[j].x, parts[j].y);
          ctx.stroke();
        }
      }
  }

  for (let i = 0; i < n; i++) {
    const p = parts[i];
    if (kind === "dust" || kind === "bokeh") {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      wrap(p, w, h, kind === "bokeh" ? p.r : 10);
    }
    if (kind === "bokeh") {
      const a = p.a * (0.7 + 0.3 * Math.sin(t * p.sp + p.ph));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
      g.addColorStop(0.7, `rgba(255, 255, 255, ${a * 0.55})`);
      g.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "dust" || kind === "stars") {
      const a = p.a * (0.55 + 0.45 * Math.sin(t * p.sp + p.ph));
      ctx.fillStyle = kind === "dust" ? `rgba(214, 240, 236, ${a})` : `rgba(226, 236, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "notes" || kind === "chords") {
      // Note / imena akordov počasi plavajo navzgor in se rahlo zibajo.
      p.y += p.vy * dt;
      if (p.y < -40 * dpr) {
        parts[i] = make(kind, w, h, dpr, i, n, false);
        continue;
      }
      const x = p.x + Math.sin(t * p.sp + p.ph) * 12 * dpr;
      const fadeY = Math.min(1, p.y / (h * 0.15), (h - p.y) / (h * 0.15) + 0.3);
      const a = p.a * edgeFade(x, w) * Math.max(0, fadeY);
      if (a <= 0.005) continue;
      ctx.save();
      ctx.translate(x, p.y);
      ctx.rotate(Math.sin(t * p.sp * 0.7 + p.ph) * 0.15);
      ctx.fillStyle = kind === "notes" ? `rgba(191, 219, 254, ${a})` : `rgba(226, 232, 222, ${a})`;
      ctx.font = kind === "notes" ? `${p.r}px serif` : `300 ${p.r}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    } else if (kind === "ripples") {
      // Zvočni krog: razširi se in zbledi, nato se pojavi drugje ob robu.
      p.life += dt / p.span;
      if (p.life >= 1) {
        parts[i] = make(kind, w, h, dpr, i, n, false);
        continue;
      }
      if (p.life < 0) continue;
      for (let ring = 0; ring < 3; ring++) {
        const l = p.life - ring * 0.12;
        if (l <= 0) continue;
        const r = p.r * l;
        const a = 0.22 * (1 - l) * edgeFade(p.x, w);
        ctx.strokeStyle = `rgba(167, 243, 208, ${a})`;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (kind === "strings") {
      // Struna: občasno "ubrana" — zatrese se z upadajočim nihanjem.
      p.life += dt / p.span;
      if (p.life >= 1) {
        p.life = 0;
        p.span = rand(5, 11);
        p.r = rand(5, 10) * dpr;
      }
      const shake = p.life < 0.35 ? Math.exp(-p.life * 12) : 0;
      ctx.strokeStyle = `rgba(203, 213, 225, ${0.07 + 0.18 * shake})`;
      ctx.lineWidth = (1 + 0.4 * (i % 3)) * dpr;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 6 * dpr) {
        const env = Math.sin((y / h) * Math.PI);
        const x = p.x + (y / h) * 18 * dpr * (p.x < w / 2 ? 1 : -1) + Math.sin(y / (18 * dpr) + t * 60) * p.r * shake * env;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (kind === "waves") {
      // Zvočni val: navpična sinusoida, ki teče navzdol.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      const col = i % 2 ? "125, 160, 220" : "94, 200, 180";
      grad.addColorStop(0, `rgba(${col}, 0)`);
      grad.addColorStop(0.4, `rgba(${col}, 0.16)`);
      grad.addColorStop(0.8, `rgba(${col}, 0.1)`);
      grad.addColorStop(1, `rgba(${col}, 0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 4 * dpr) {
        const amp = p.r * (0.6 + 0.4 * Math.sin(y / (h * 0.3) + t * 0.3 + p.ph));
        const x = p.x + Math.sin(y / p.span * Math.PI * 2 - t * p.sp * 3 + p.ph) * amp;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

export default function AmbientParticles({ kind, className }: { kind: ParticleKind; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let parts: P[] = [];
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      const k = (canvas.clientWidth * canvas.clientHeight) / (1600 * 900);
      const fixed = kind === "strings" || kind === "waves";
      const n = fixed ? DENSITY[kind] : Math.max(2, Math.round(DENSITY[kind] * Math.min(1.3, Math.max(0.5, k))));
      parts = Array.from({ length: n }, (_, i) => make(kind, canvas.width, canvas.height, dpr, i, n, true));
      draw(kind, ctx, parts, canvas.width, canvas.height, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => ro.disconnect();
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) draw(kind, ctx, parts, canvas.width, canvas.height, dpr, dt, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [kind]);
  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
