"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useBackableOpen } from "@/lib/useBackableOpen";

// Okno za deljenje povezave (Skupni Jam → Deli): omrežja in aplikacije prek
// njihovih povezav za deljenje, kopiranje in — kjer ga brskalnik ima — sistemski
// meni za deljenje ("Več …", navigator.share ob kliku, da je uporabnikova poteza sveža).
export default function ShareSheet({ url, text, title, onClose }: { url: string; text: string; title: string; onClose: () => void }) {
  useBackableOpen(true, onClose);
  const [copied, setCopied] = useState(false);
  const msg = `${text} ${url}`;
  const enc = encodeURIComponent;
  const targets: { label: string; href: string; color: string; icon: React.ReactNode }[] = [
    { label: "WhatsApp", href: `https://wa.me/?text=${enc(msg)}`, color: "#25D366", icon: <Bubble /> },
    { label: "Viber", href: `viber://forward?text=${enc(msg)}`, color: "#7360F2", icon: <Phone /> },
    { label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, color: "#229ED9", icon: <Plane /> },
    { label: "Messenger", href: `fb-messenger://share/?link=${enc(url)}`, color: "#0084FF", icon: <Bubble /> },
    { label: "SMS", href: `sms:?&body=${enc(msg)}`, color: "#34C759", icon: <Chat /> },
    { label: "E-pošta", href: `mailto:?subject=${enc(title)}&body=${enc(msg)}`, color: "#EA4335", icon: <Mail /> },
  ];
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-view-portal className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-2xl dark:border-white/10 dark:bg-[#16161b] dark:text-neutral-100"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Zapri" className="rounded-full p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Gost odpre povezavo v brskalniku, brez računa. Velja 24 ur.</p>

        <div className="mt-4 grid grid-cols-4 gap-3">
          {targets.map((t) => (
            <a key={t.label} href={t.href} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 text-[11px] font-medium">
              <span className="flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ backgroundColor: t.color }}>
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
          {canShare && (
            <button
              type="button"
              onClick={() => navigator.share({ title, text, url }).catch(() => {})}
              className="flex flex-col items-center gap-1.5 text-[11px] font-medium"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-700 text-white">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </span>
              Več …
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-neutral-200 p-1.5 pl-3 dark:border-white/10">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-500">{url}</span>
          <button type="button" onClick={copy} className="shrink-0 rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95">
            {copied ? "Kopirano ✓" : "Kopiraj"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const ico = "h-5 w-5";
function Bubble() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ico}>
      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}
function Phone() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ico}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}
function Plane() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ico}>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
function Chat() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ico}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function Mail() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ico}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}
