import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { CONNECTION_EFFECTS, connectionEffectFrame, sampleRoute, type ConnectionEffect, type EffectOptions, type EffectShape } from "../connectionEffects";

// Um único relógio para todas as ligações e prévias. Fora da tela, não desenha.
const frames = new Set<(dt: number) => void>();
let raf = 0, last = 0;
function tick(now: number) {
  if (!frames.size) { raf = 0; last = 0; return; }
  const dt = Math.min((now - (last || now - 16)) / 1000, 0.05); last = now;
  if (!document.hidden) frames.forEach((draw) => draw(dt));
  raf = requestAnimationFrame(tick);
}
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeReduced = (listener: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)"); query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
export const useReducedMotion = () => useSyncExternalStore(subscribeReduced, reduced, () => false);

const SVG = "http://www.w3.org/2000/svg";
function attribute(element: SVGElement, name: string, value: string | number) {
  const next = String(value);
  if (element.getAttribute(name) !== next) element.setAttribute(name, next);
}

// Reutiliza as formas entre quadros: sem imagens intermediárias e sem renderizar React a cada frame.
function paint(group: SVGGElement, shapes: EffectShape[]) {
  shapes.forEach((shape, index) => {
    let element = group.children[index] as SVGElement | undefined;
    if (!element || element.tagName !== shape.kind) {
      const next = document.createElementNS(SVG, shape.kind);
      if (element) group.replaceChild(next, element); else group.appendChild(next);
      element = next;
      attribute(element, "fill", shape.kind === "circle" ? "currentColor" : "none");
      attribute(element, "stroke", shape.kind === "circle" ? "none" : "currentColor");
      attribute(element, "stroke-linecap", "round");
      attribute(element, "stroke-linejoin", "round");
    }
    attribute(element, "opacity", shape.opacity);
    if (shape.kind === "path") { attribute(element, "d", shape.d); attribute(element, "stroke-width", shape.width); }
    else {
      attribute(element, "cx", shape.cx); attribute(element, "cy", shape.cy);
      if (shape.kind === "circle") attribute(element, "r", shape.r);
      else {
        attribute(element, "rx", shape.rx); attribute(element, "ry", shape.ry);
        attribute(element, "transform", `rotate(${shape.angle} ${shape.cx} ${shape.cy})`);
      }
    }
  });
  while (group.children.length > shapes.length) group.lastElementChild?.remove();
}

export function ConnectionAnimation({ path, effect, options, active, reverse, paused = false, emphasized = false }: { path: string; effect: ConnectionEffect; options: EffectOptions; active: boolean; reverse: boolean; paused?: boolean; emphasized?: boolean }) {
  const group = useRef<SVGGElement>(null);
  const state = useRef({ time: 0, energy: 0 });
  const current = useRef({ active, reverse, options }); current.current = { active, reverse, options };
  const reduce = useReducedMotion();
  const route = useMemo(() => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path"); element.setAttribute("d", path);
    return sampleRoute(element);
  }, [path]);
  useLayoutEffect(() => {
    const element = group.current;
    if (!element || paused || reduce) return;
    const color = CONNECTION_EFFECTS.find((item) => item.id === effect)!.color;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); observer.observe(element);
    const draw = (dt: number) => {
      if (!visible) return;
      attribute(element, "color", current.current.options.color || color);
      paint(element, connectionEffectFrame(route, effect, current.current.options, state.current, dt, current.current.active, current.current.reverse));
    };
    // Reposiciona e pinta no mesmo quadro do elemento, sem reiniciar a animação a cada arraste.
    draw(0);
    frames.add(draw); if (!raf) raf = requestAnimationFrame(tick);
    return () => { frames.delete(draw); observer.disconnect(); };
  }, [route, effect, paused, reduce]);
  if (paused || reduce) return null;
  return <g ref={group} className={`connection-animation${emphasized ? " emphasized" : ""}`} transform={`translate(${route.x} ${route.y})`} pointerEvents="none" aria-hidden="true" />;
}
