import type { ReactNode } from "react";

interface Props {
  hue: number;
  /** Semente do giro dos braços; o id da galáxia deixa cada uma com um ângulo próprio. */
  seed: string;
  children?: ReactNode;
}

/** Mini galáxia espiral usada como avatar da galáxia na barra lateral. */
export function GalaxyIcon({ hue, seed, children }: Props) {
  return (
    <span className="workspace-avatar galaxy" style={{ "--hue": hue, "--spin": `${spinFor(seed)}deg` } as React.CSSProperties}>
      <svg className="galaxy-arms" viewBox="-13 -13 26 26" aria-hidden="true">
        {[0, 180].map((r) => (
          <g key={r} transform={`rotate(${r})`}>
            <path className="arm-glow" d={ARM} />
            <path className="arm" d={ARM} />
          </g>
        ))}
        <circle className="core" r="2.6" />
        {STARS.map(([x, y], k) => <circle key={k} className="star" cx={x} cy={y} r="0.45" />)}
      </svg>
      {children}
    </span>
  );
}

/** Cor da galáxia: a escolhida pelo usuário ou, sem escolha, uma pela posição na lista. */
export function galaxyHue(hue: number | undefined, position: number): number {
  return hue ?? autoHue(position);
}

/** O ângulo áureo espalha os tons, então vizinhas nunca ficam parecidas. */
export function autoHue(position: number): number {
  return Math.round((position * 137.508 + 210) % 360);
}

/** Giro estável derivado do id, para os braços não ficarem todos iguais. */
function spinFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Braço espiral (logarítmica aproximada) do centro até a borda. */
const ARM = Array.from({ length: 25 }, (_, i) => {
  const t = (i / 24) * 1.7 * Math.PI;
  const r = 1.4 + 10 * (i / 24) ** 1.2;
  return `${i ? "L" : "M"}${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`;
}).join("");

const STARS: [number, number][] = [[-8, -6], [7, -8], [9, 5], [-6, 9], [-10, 2], [3, 10]];
