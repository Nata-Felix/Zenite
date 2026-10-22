/**
 * Ilustração de como universos paralelos funcionam:
 * - "branch": a Origem se divide e um universo segue em paralelo, com a própria cópia;
 * - "merge": o universo volta e se funde na Origem;
 * - "update": a Origem avançou e seus commits sobem para dentro do universo.
 * Cores vêm dos tokens do tema, então funciona no claro e no escuro.
 */
interface Props {
  mode: "branch" | "merge" | "collapse" | "update";
  originLabel: string;
  universeLabel: string;
}

export function UniverseDiagram({ mode, originLabel, universeLabel }: Props) {
  const merging = mode === "merge";
  const collapsing = mode === "collapse";
  const updating = mode === "update";
  return (
    <figure className={`universe-diagram mode-${mode}`}>
      <svg viewBox="0 0 420 150" role="img" aria-label={`${originLabel} e ${universeLabel}`}>
        <defs>
          <radialGradient id="ud-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--sun-core)" />
            <stop offset="100%" stopColor="var(--sun-edge)" />
          </radialGradient>
          <radialGradient id="ud-planet" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="var(--planet-core)" />
            <stop offset="100%" stopColor="var(--planet-edge)" />
          </radialGradient>
        </defs>

        {/* Linha do tempo da Origem */}
        <line x1="20" y1="104" x2="400" y2="104" className="ud-track" />
        {[60, 130, 200, 270, 340].map((x) => (
          <circle key={x} cx={x} cy={104} r={4} className="ud-commit" />
        ))}

        {/* O universo sai da Origem, segue em paralelo e (no merge) volta */}
        <path d={`M 110 104 C 150 104 150 44 190 44 L ${updating ? 350 : 290} 44 ${merging ? "C 330 44 330 104 370 104" : ""}`} className={`ud-branch${collapsing ? " fading" : ""}`} />
        {[226, 256, 286].map((x) => (
          <circle key={x} cx={x} cy={44} r={4} className={`ud-commit universe${collapsing ? " fading" : ""}`} />
        ))}
        {merging && <circle cx={370} cy={104} r={6} className="ud-merge" />}
        {updating && (
          <>
            <path d="M 270 104 C 300 104 300 44 330 44" className="ud-sync" />
            <circle cx={330} cy={44} r={6} className="ud-merge" />
          </>
        )}
        {collapsing && (
          <g className="ud-x">
            <line x1="302" y1="34" x2="322" y2="54" />
            <line x1="322" y1="34" x2="302" y2="54" />
          </g>
        )}

        {/* Corpos celestes */}
        <circle cx="34" cy="104" r="15" fill="url(#ud-sun)" className="ud-glow" />
        <g className={collapsing ? "fading" : ""}>
          <ellipse cx="190" cy="44" rx="22" ry="7" className="ud-ring" />
          <circle cx="190" cy="44" r="11" fill="url(#ud-planet)" />
        </g>

        <text x="34" y="136" className="ud-label" textAnchor="middle">
          {originLabel}
        </text>
        <text x="240" y="20" className="ud-label" textAnchor="middle">
          {universeLabel}
        </text>
      </svg>
      <figcaption>
        {mode === "branch" && "A Origem continua intacta. O universo ganha uma cópia própria do projeto, numa branch separada."}
        {mode === "merge" && "Os commits do universo voltam para a Origem num merge. Se houver conflito, nada muda na Origem."}
        {mode === "collapse" && "O universo e tudo o que só existe nele desaparecem. A Origem fica como está."}
        {mode === "update" && "Os commits novos da Origem sobem para o universo. Se houver conflito, ele é resolvido aqui dentro; a Origem fica como está."}
      </figcaption>
    </figure>
  );
}
