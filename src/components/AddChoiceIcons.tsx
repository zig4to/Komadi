"use client";

// Izbira načina dodajanja po kliku na "+" (Dashboard.tsx): trije gumbi, kjer
// je obroba sama oblika ikone (mikrofon, strela, telefon), ime pa je napisano
// znotraj nje. Oblike so nekoliko razširjene, da besedilo sede notri.

const SHAPE = {
  fill: "currentColor",
  fillOpacity: 0.07,
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

const LABEL = {
  fill: "currentColor",
  textAnchor: "middle" as const,
  fontWeight: 600,
  fontFamily: "inherit",
};

function ChoiceButton({
  label,
  colorClass,
  onClick,
  children,
}: {
  label: string;
  colorClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`group shrink-0 rounded-2xl p-1 transition duration-200 hover:scale-105 focus-visible:outline-2 ${colorClass}`}
    >
      <svg viewBox="0 0 120 136" className="h-32 w-28 lg:h-36 lg:w-32" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

export default function AddChoiceIcons({
  onVoice,
  onQuick,
  onPhone,
}: {
  onVoice: () => void;
  onQuick: () => void;
  onPhone: () => void;
}) {
  return (
    // Piramida: "Glasovno" zgoraj na sredini, spodaj "Prek telefona" in "Hitro".
    <div className="flex flex-col items-center gap-2">
      {/* Mikrofon: širša glava (kapsula), da gre "Glasovno" noter. */}
      <ChoiceButton label="Glasovno" colorClass="text-sky-600 dark:text-sky-400" onClick={onVoice}>
        <rect x="14" y="4" width="92" height="84" rx="42" {...SHAPE} />
        <path d="M6 70a54 54 0 0 0 108 0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M60 124v-12M42 130h36" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        <text x="60" y="51" fontSize="15" {...LABEL}>
          Glasovno
        </text>
      </ChoiceButton>

      <div className="flex items-end justify-center gap-6 sm:gap-12">
        {/* Telefon: "Prek telefona" v dveh vrsticah na zaslonu. */}
        <ChoiceButton label="Prek telefona" colorClass="text-emerald-600 dark:text-emerald-400" onClick={onPhone}>
          <rect x="24" y="4" width="72" height="128" rx="12" {...SHAPE} />
          <path d="M52 120h16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
          <text x="60" y="62" fontSize="15" {...LABEL}>
            Prek
          </text>
          <text x="60" y="80" fontSize="15" {...LABEL}>
            telefona
          </text>
        </ChoiceButton>
        {/* Strela: razširjena na sredini, kjer je "Hitro". */}
        <ChoiceButton label="Hitro" colorClass="text-fuchsia-600 dark:text-fuchsia-400" onClick={onQuick}>
          <path d="M80 4 12 80h46l-12 52 64-80H64z" {...SHAPE} />
          <text x="58" y="72" fontSize="17" {...LABEL}>
            Hitro
          </text>
        </ChoiceButton>
      </div>
    </div>
  );
}
