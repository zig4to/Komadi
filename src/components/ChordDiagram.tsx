import type { ChordPosition } from "@/lib/chordShapes";

// Shema prijema (kot na Ultimate Guitar): 6 strun (levo E, desno e), pragovi,
// pike s številkami prstov, barre, x/o nad vratom. Barve iz --cv-* (tema
// pregledovalnika akordov).
const STRING_GAP = 13;
const FRET_GAP = 16;
const LEFT = 20;
const TOP = 22;

export default function ChordDiagram({ name, position }: { name: string; position: ChordPosition }) {
  const { frets, fingers, barres, baseFret } = position;
  const rows = Math.max(4, ...frets);
  const width = LEFT + STRING_GAP * 5 + 12;
  const height = TOP + FRET_GAP * rows + 6;
  const x = (string: number) => LEFT + string * STRING_GAP;
  const y = (fret: number) => TOP + (fret - 0.5) * FRET_GAP;

  return (
    <div className="flex flex-col items-center">
      <span className="font-sans text-sm font-bold text-(--cv-chord)">{name}</span>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-label={`Prijem ${name}`} role="img">
        {/* Vrat: prečke (pragovi) in strune. */}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line
            key={`f${i}`}
            x1={x(0)}
            x2={x(5)}
            y1={TOP + i * FRET_GAP}
            y2={TOP + i * FRET_GAP}
            stroke="var(--cv-muted)"
            strokeWidth={i === 0 && baseFret === 1 ? 3 : 1}
          />
        ))}
        {Array.from({ length: 6 }, (_, s) => (
          <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={TOP} y2={TOP + rows * FRET_GAP} stroke="var(--cv-muted)" strokeWidth={1} />
        ))}
        {baseFret > 1 && (
          <text x={LEFT - 10} y={y(1) + 3} textAnchor="end" fontSize={9} fill="var(--cv-text)">
            {baseFret}
          </text>
        )}

        {/* x = struna se ne igra, o = prazna struna. */}
        {frets.map((f, s) =>
          f <= 0 ? (
            <text key={`m${s}`} x={x(s)} y={TOP - 6} textAnchor="middle" fontSize={9} fill="var(--cv-text)">
              {f < 0 ? "×" : "○"}
            </text>
          ) : null,
        )}

        {/* Barre: od prve do zadnje strune, ki jo prst na tem pragu drži. */}
        {barres.map((b) => {
          const strings = frets.map((f, s) => (f === b ? s : -1)).filter((s) => s >= 0);
          if (strings.length < 2) return null;
          const from = strings[0];
          const to = strings[strings.length - 1];
          return (
            <rect
              key={`b${b}`}
              x={x(from) - 5.5}
              y={y(b) - 5.5}
              width={x(to) - x(from) + 11}
              height={11}
              rx={5.5}
              fill="var(--cv-chord)"
            />
          );
        })}

        {frets.map((f, s) =>
          f > 0 ? (
            <g key={`d${s}`}>
              <circle cx={x(s)} cy={y(f)} r={5.5} fill="var(--cv-chord)" />
              {fingers[s] > 0 && (
                <text x={x(s)} y={y(f) + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--cv-bg)">
                  {fingers[s]}
                </text>
              )}
            </g>
          ) : null,
        )}
      </svg>
    </div>
  );
}
