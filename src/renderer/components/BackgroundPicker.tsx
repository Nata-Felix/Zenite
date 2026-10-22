import { BG_GAP, BG_PATTERNS, BG_SPACINGS, setCanvasBg, useCanvasBg, type CanvasBg } from "../canvasBackground";
import { SpaceBackgroundSvg } from "./CanvasBackground";

/** Amostra do padrão, com as cores do tema (as mesmas do canvas). */
function Preview({ bg }: { bg: CanvasBg }) {
  const { pattern, spacing } = bg;
  // A amostra é menor que o canvas: o espaçamento é reduzido na mesma proporção.
  const gap = BG_GAP[spacing] * 0.6;
  const id = `bgp-${pattern}-${spacing}`;
  const mark =
    pattern === "dots" ? (
      <circle cx={gap / 2} cy={gap / 2} r={0.6 * bg.size} style={{ fill: "var(--dots)" }} />
    ) : pattern === "grid" ? (
      <path d={`M ${gap} 0 L 0 0 0 ${gap}`} style={{ stroke: "var(--grid-line)", strokeWidth: bg.size, fill: "none" }} />
    ) : pattern === "cross" ? (
      <path d={`M ${gap / 2 - 3 * bg.size} ${gap / 2} h ${6 * bg.size} M ${gap / 2} ${gap / 2 - 3 * bg.size} v ${6 * bg.size}`} style={{ stroke: "var(--grid-cross)", strokeWidth: bg.size, fill: "none" }} />
    ) : null;
  if (!["dots", "grid", "cross", "none"].includes(pattern)) return <SpaceBackgroundSvg bg={bg} preview />;
  return (
    <svg className="bg-preview" aria-hidden="true">
      {mark && (
        <defs>
          <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
            {mark}
          </pattern>
        </defs>
      )}
      <rect width="100%" height="100%" style={{ fill: "var(--bg)" }} />
      {mark && <rect width="100%" height="100%" fill={`url(#${id})`} opacity={bg.intensity} />}
    </svg>
  );
}

/** Escolha do fundo do canvas: padrão e espaçamento. Vale na hora para todas as galáxias. */
export function BackgroundPicker() {
  const bg = useCanvasBg();
  return (
    <div className="bg-picker">
      <div className="bg-options" role="group" aria-label="Padrão do fundo">
        {BG_PATTERNS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={bg.pattern === p.value}
            className={`bg-option${bg.pattern === p.value ? " on" : ""}`}
            onClick={() => setCanvasBg({ ...bg, pattern: p.value })}
          >
            <Preview bg={{ ...bg, pattern: p.value }} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      {bg.pattern !== "none" && (
        <div className="bg-spacing" role="group" aria-label="Espaçamento do fundo">
          <span>Espaçamento</span>
          <div className="segmented">
            {BG_SPACINGS.map((s) => (
              <button key={s.value} type="button" aria-pressed={bg.spacing === s.value} className={bg.spacing === s.value ? "on" : ""} onClick={() => setCanvasBg({ ...bg, spacing: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {bg.pattern !== "none" && <div className="bg-adjustments">
        <label>Tamanho <input type="range" min="0.5" max="2" step="0.1" value={bg.size} onChange={e => setCanvasBg({ ...bg, size: Number(e.target.value) })} /><output>{Math.round(bg.size * 100)}%</output></label>
        <label>Intensidade <input type="range" min="0.2" max="1" step="0.05" value={bg.intensity} onChange={e => setCanvasBg({ ...bg, intensity: Number(e.target.value) })} /><output>{Math.round(bg.intensity * 100)}%</output></label>
        {["stars", "navigation", "starfield"].includes(bg.pattern) && <label>
          {bg.pattern === "stars" ? "Proporção de estrelas" : bg.pattern === "navigation" ? "Divisões principais" : "Densidade"}
          <input type="range" min="0" max="1" step="0.05" value={bg.detail} onChange={e => setCanvasBg({ ...bg, detail: Number(e.target.value) })} /><output>{Math.round(bg.detail * 100)}%</output>
        </label>}
      </div>}
    </div>
  );
}
