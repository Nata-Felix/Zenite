import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from "lucide-react";
import type { DrawShape, DrawSpec } from "../../shared/types";
import { AREA_SHAPES, BUCKET_COLORS, bucketColor, FILL_COLORS, FONT_SIZES, FONTS, STROKE_COLORS, STROKE_WIDTHS, cssColor, type DrawStyle } from "./style";

interface Props {
  /** Formas envolvidas (selecionadas, ou a da ferramenta ativa). */
  shapes: DrawShape[];
  style: DrawStyle;
  onChange(patch: Partial<DrawSpec>): void;
  /** Só com seleção: ações sobre os desenhos selecionados. */
  selection?: { onFront(): void; onBack(): void; onDuplicate(): void; onDelete(): void };
  /** Balde ativo: só a cor da tinta. */
  bucket?: boolean;
}

function Swatches({ colors, value, onPick, allowCustom }: { colors: string[]; value: string; onPick(c: string): void; allowCustom?: boolean }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch${value === c ? " on" : ""}${c === "transparent" ? " none" : ""}`}
          style={{ background: c === "transparent" ? undefined : cssColor(c) }}
          title={c === "auto" ? "Automática (acompanha o tema)" : c === "transparent" ? "Sem fundo" : c}
          onClick={() => onPick(c)}
        />
      ))}
      {allowCustom && (
        <label className="swatch custom" title="Outra cor">
          <input type="color" value={value.startsWith("#") ? value : "#1971c2"} onChange={(e) => onPick(e.target.value)} />
        </label>
      )}
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onPick, className }: { options: { value: T; label: React.ReactNode; title?: string }[]; value: T; onPick(v: T): void; className?: string }) {
  return (
    <div className={`segmented${className ? ` ${className}` : ""}`}>
      {options.map((o) => (
        <button key={String(o.value)} className={value === o.value ? "on" : ""} title={o.title} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Estilo do desenho: cor, fundo, espessura, traço, fonte, tamanho, camadas. */
export function DrawPanel({ shapes, style, onChange, selection, bucket }: Props) {
  if (bucket) {
    return (
      <div className="draw-panel nowheel" onPointerDown={(e) => e.stopPropagation()}>
        <section>
          <h4>Cor da tinta</h4>
          <Swatches colors={BUCKET_COLORS} value={bucketColor(style)} onPick={(fill) => onChange({ fill })} allowCustom />
        </section>
        <p className="draw-panel-hint">Clique numa forma para pintar o fundo; numa linha, para trocar a cor.</p>
      </div>
    );
  }
  const hasArea = shapes.some((s) => AREA_SHAPES.includes(s));
  const hasText = shapes.includes("text");
  const hasStroke = shapes.some((s) => s !== "text");
  const sketchy = shapes.some((s) => s !== "text" && s !== "pen");

  return (
    <div className="draw-panel nowheel" onPointerDown={(e) => e.stopPropagation()}>
      <section>
        <h4>{hasText && !hasStroke ? "Cor do texto" : "Traço"}</h4>
        <Swatches colors={STROKE_COLORS} value={style.stroke} onPick={(stroke) => onChange({ stroke })} allowCustom />
      </section>

      {hasArea && (
        <section>
          <h4>Fundo</h4>
          <Swatches colors={FILL_COLORS} value={style.fill} onPick={(fill) => onChange({ fill })} allowCustom />
          {style.fill !== "transparent" && (
            <Segmented
              value={style.fillStyle}
              onPick={(fillStyle) => onChange({ fillStyle })}
              options={[
                { value: "hachure", label: "Hachura" },
                { value: "cross-hatch", label: "Cruzado" },
                { value: "solid", label: "Sólido" },
              ]}
            />
          )}
        </section>
      )}

      {hasStroke && (
        <section>
          <h4>Espessura</h4>
          <Segmented
            value={style.strokeWidth}
            onPick={(strokeWidth) => onChange({ strokeWidth })}
            options={STROKE_WIDTHS.map((w) => ({ value: w.value, title: w.label, label: <span className="stroke-sample" style={{ height: w.value + 1 }} /> }))}
          />
        </section>
      )}

      {sketchy && (
        <>
          <section>
            <h4>Estilo do traço</h4>
            <Segmented
              value={style.strokeStyle}
              onPick={(strokeStyle) => onChange({ strokeStyle })}
              options={[
                { value: "solid", label: "Contínuo" },
                { value: "dashed", label: "Tracejado" },
                { value: "dotted", label: "Pontilhado" },
              ]}
            />
          </section>
          <section>
            <h4>Aparência</h4>
            <Segmented
              value={style.roughness}
              onPick={(roughness) => onChange({ roughness })}
              options={[
                { value: 0, label: "Limpo" },
                { value: 1, label: "Rabiscado" },
                { value: 2, label: "Rascunho" },
              ]}
            />
          </section>
        </>
      )}

      {hasText && (
        <>
          <section>
            <h4>Fonte</h4>
            <Segmented
              className="font-grid"
              value={style.font ?? "hand"}
              onPick={(font) => onChange({ font })}
              options={FONTS.map((f) => ({ value: f.value, title: f.label, label: <span style={{ fontFamily: f.family, fontSize: f.value === "hand" ? 13.5 : undefined }}>{f.label}</span> }))}
            />
          </section>
          <section>
            <h4>Tamanho</h4>
            <div className="row">
              <Segmented value={style.fontSize ?? 24} onPick={(fontSize) => onChange({ fontSize })} options={FONT_SIZES.map((s) => ({ value: s.value, label: s.label, title: `${s.value}px` }))} />
              <input
                className="num"
                type="number"
                min={8}
                max={200}
                value={style.fontSize ?? 24}
                title="Tamanho em pixels"
                onChange={(e) => {
                  const fontSize = Math.max(8, Math.min(200, Number(e.target.value) || 24));
                  onChange({ fontSize });
                }}
              />
            </div>
          </section>
          <section>
            <h4>Alinhamento</h4>
            <Segmented
              value={style.textAlign ?? "left"}
              onPick={(textAlign) => onChange({ textAlign })}
              options={[
                { value: "left", label: <AlignLeft size={14} />, title: "Esquerda" },
                { value: "center", label: <AlignCenter size={14} />, title: "Centro" },
                { value: "right", label: <AlignRight size={14} />, title: "Direita" },
              ]}
            />
          </section>
        </>
      )}

      <section>
        <h4>Opacidade</h4>
        <input className="range" type="range" min={10} max={100} step={5} value={style.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} />
      </section>

      {selection && (
        <section>
          <h4>Ações</h4>
          <div className="draw-actions">
            <button title="Trazer para frente" onClick={selection.onFront}>
              <ArrowUpToLine size={14} />
            </button>
            <button title="Mandar para trás" onClick={selection.onBack}>
              <ArrowDownToLine size={14} />
            </button>
            <button title="Duplicar (Ctrl+D)" onClick={selection.onDuplicate}>
              <Copy size={14} />
            </button>
            <button className="danger" title="Excluir (Delete)" onClick={selection.onDelete}>
              <Trash2 size={14} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
