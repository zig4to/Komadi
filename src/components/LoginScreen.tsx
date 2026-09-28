"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Prijava / registracija / pozabljeno geslo — enako kot v hubu TomStudios
// (TomsStudios/auth.js): e-pošta + geslo, registracija samo za povabljene
// (tabela allowed_emails, sprožilec na auth.users zavrne ostale), ime in
// priimek v user_metadata (first_name/last_name).
type Tab = "login" | "register";
type Message = { text: string; error: boolean } | null;

function friendlyLoginError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Napačna e-pošta ali geslo.";
  if (/email not confirmed/i.test(msg)) return "Najprej potrdi e-pošto (povezava v e-poštnem sporočilu).";
  return "Prijava ni uspela. Poskusi znova.";
}

function friendlySignupError(msg: string): string {
  if (/signup_not_allowed/i.test(msg) || /database error saving new user/i.test(msg))
    return "Ta e-poštni naslov ni na seznamu povabljenih.";
  if (/already registered/i.test(msg) || /user already exists/i.test(msg))
    return "Ta e-poštni naslov je že registriran. Poskusi se prijaviti.";
  if (/password/i.test(msg)) return "Geslo mora imeti vsaj 6 znakov.";
  return "Registracija ni uspela. Preveri podatke in poskusi znova.";
}

// Povezave v e-pošti (potrditev, ponastavitev gesla) vodijo nazaj na isto
// stran — lokalno ali na GitHub Pages (/Komadi/). Naslov mora biti dodan v
// Supabase: Authentication → URL Configuration → Redirect URLs.
function redirectUrl() {
  return window.location.origin + window.location.pathname;
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const submitClass =
  "w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50";

function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder = "Geslo",
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        required
        minLength={6}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "Skrij geslo" : "Pokaži geslo"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          {shown ? (
            <>
              <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="m2 2 20 20" />
            </>
          ) : (
            <>
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

export default function LoginScreen({
  recovery,
  notice,
  onRecoveryDone,
}: {
  recovery: boolean;
  notice: string | null;
  onRecoveryDone: () => void;
}) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(notice ? { text: notice, error: false } : null);

  function switchTab(next: Tab) {
    setTab(next);
    setMessage(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage({ text: friendlyLoginError(error.message), error: true });
    } catch {
      setMessage({ text: "Prijava ni uspela. Poskusi znova.", error: true });
    }
    setBusy(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl(),
          data: { first_name: firstName.trim(), last_name: lastName.trim() },
        },
      });
      if (error) setMessage({ text: friendlySignupError(error.message), error: true });
      else if (data.user && !data.session)
        setMessage({
          text: "Račun je ustvarjen. Preveri e-pošto in potrdi račun, nato se prijavi.",
          error: false,
        });
    } catch {
      setMessage({ text: "Registracija ni uspela. Poskusi znova.", error: true });
    }
    setBusy(false);
  }

  async function handleForgot() {
    if (!email.trim()) {
      setMessage({ text: "Vpiši e-pošto, na katero naj pošljem povezavo za novo geslo.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
    setBusy(false);
    setMessage(
      error
        ? { text: "Pošiljanje ni uspelo. Poskusi znova.", error: true }
        : { text: "Če račun obstaja, smo ti poslali povezavo za novo geslo.", error: false },
    );
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setMessage({ text: "Gesli se ne ujemata.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage({ text: "Shranjevanje gesla ni uspelo. Poskusi znova.", error: true });
    else onRecoveryDone();
  }

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bitne Tabs</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Prijava z računom TomStudios
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          {recovery ? (
            <form onSubmit={handleNewPassword} className="space-y-3">
              <p className="text-sm font-medium">Nastavi novo geslo</p>
              <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="Novo geslo" />
              <PasswordInput
                value={password2}
                onChange={setPassword2}
                autoComplete="new-password"
                placeholder="Ponovi novo geslo"
              />
              <button type="submit" disabled={busy} className={submitClass}>
                Shrani geslo
              </button>
            </form>
          ) : (
            <>
              <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-900">
                {(["login", "register"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => switchTab(t)}
                    className={`rounded-md py-1.5 text-sm font-medium transition ${
                      tab === t
                        ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                        : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    }`}
                  >
                    {t === "login" ? "Prijava" : "Registracija"}
                  </button>
                ))}
              </div>

              <form onSubmit={tab === "login" ? handleLogin : handleRegister} className="space-y-3">
                {tab === "register" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      autoComplete="given-name"
                      placeholder="Ime"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      required
                      autoComplete="family-name"
                      placeholder="Priimek"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="E-pošta"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                />
                <button type="submit" disabled={busy} className={submitClass}>
                  {tab === "login" ? "Prijava" : "Ustvari račun"}
                </button>
                {tab === "login" && (
                  <button
                    type="button"
                    onClick={handleForgot}
                    disabled={busy}
                    className="block w-full text-center text-sm text-neutral-500 hover:text-emerald-600 hover:underline dark:text-neutral-400 dark:hover:text-emerald-400"
                  >
                    Pozabljeno geslo?
                  </button>
                )}
              </form>
            </>
          )}

          {message && (
            <p
              role={message.error ? "alert" : "status"}
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                message.error
                  ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
