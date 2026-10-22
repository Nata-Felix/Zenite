import { ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  /** Porcentagem mostrada (100 = tamanho normal). */
  percent: number;
  onStep(direction: 1 | -1): void;
  onReset(): void;
  what: string;
}

/** − 100% + no cabeçalho de terminais e elementos. Clicar no número volta para 100%. */
export function ZoomControl({ percent, onStep, onReset, what }: Props) {
  return (
    <span className="web-zoom nodrag">
      <button type="button" className="icon-button" title={`Diminuir ${what}`} onClick={() => onStep(-1)}>
        <ZoomOut size={13} />
      </button>
      <button type="button" className="web-zoom-value" title="Voltar para 100%" onClick={onReset}>
        {Math.round(percent)}%
      </button>
      <button type="button" className="icon-button" title={`Aumentar ${what}`} onClick={() => onStep(1)}>
        <ZoomIn size={13} />
      </button>
    </span>
  );
}

/** Zoom do conteúdo de um elemento: de 50% a 300%, de 10 em 10. */
export function clampZoom(z: number): number {
  return Math.min(3, Math.max(0.5, Math.round(z * 10) / 10));
}
