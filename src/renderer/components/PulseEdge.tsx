import { useSyncExternalStore } from "react";
import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { useCanvasPrefs } from "../canvasPrefs";
import { flowState, subscribeFlow } from "../flowBus";
import { ConnectionAnimation, useReducedMotion } from "./ConnectionAnimation";
import { circleEndpoint, summaryCircle } from "../roundConnections";
import { CONNECTION_TIMING } from "../connectionEffects";

/** Atraso de cada pontinho do beat (s), espalhados ao longo da linha. */
const BEAT_DOTS = [0, 0.22, 0.44, 0.66, 0.88];

// Enquanto o canvas se move (arrastar, zoom), as bolinhas somem: cada quadro já é caro o bastante.
let moving = false;
const listeners = new Set<() => void>();
export function setCanvasMoving(value: boolean): void {
  if (moving === value) return;
  moving = value;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const isMoving = () => moving;

// Elemento com a Constelação aberta: as linhas dele piscam e o pulso corre mais rápido.
let highlighted: string | null = null;
export function setConstellationNode(id: string | null): void {
  if (highlighted === id) return;
  highlighted = id;
  listeners.forEach((l) => l());
}
const getHighlighted = () => highlighted;

/**
 * Ligação entre elementos. Com o pulso ligado, uma bolinha viaja no sentido do último envio entre
 * os dois (de início, da origem ao destino). Logo depois de um envio, um beat de pontinhos.
 */
export function PulseEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps) {
  const { edge, pulse, connectionAnimation, connectionEffect, hideConnectionLine } = useCanvasPrefs();
  const paused = useSyncExternalStore(subscribe, isMoving);
  const reduce = useReducedMotion();
  const focus = useSyncExternalStore(subscribe, getHighlighted);
  const lit = focus !== null && (source === focus || target === focus);
  const sourceCircle = summaryCircle(useInternalNode(source));
  const targetCircle = summaryCircle(useInternalNode(target));
  const from = sourceCircle ? circleEndpoint(sourceCircle, targetCircle ?? { x: targetX, y: targetY }) : { x: sourceX, y: sourceY, position: sourcePosition };
  const to = targetCircle ? circleEndpoint(targetCircle, sourceCircle ?? { x: sourceX, y: sourceY }, -1) : { x: targetX, y: targetY, position: targetPosition };
  const args = { sourceX: from.x, sourceY: from.y, targetX: to.x, targetY: to.y, sourcePosition: from.position, targetPosition: to.position };
  const [path] =
    edge === "straight"
      ? getStraightPath(args)
      : edge === "step"
        ? getSmoothStepPath({ ...args, borderRadius: 0 })
        : edge === "smooth"
          ? getSmoothStepPath({ ...args, borderRadius: 14 })
          : getBezierPath(args);
  const realSource = typeof data?.originalSource === "string" ? data.originalSource : source;
  const realTarget = typeof data?.originalTarget === "string" ? data.originalTarget : target;
  const flow = useSyncExternalStore(subscribeFlow, () => flowState(realSource, realTarget));
  const reverse = flow.startsWith("reverse");
  const beat = flow.endsWith("beat");
  // Sentido do último envio: de trás para frente, o ponto percorre o caminho do fim ao começo.
  // `rotate` gira a forma junto com a curva (só importa para as setas do beat); ao contrário, ela vira 180°.
  const motion = (dur: string, begin = "0s", rotate?: "auto") => (
    <animateMotion
      key={reverse ? "r" : "f"}
      dur={dur}
      begin={begin}
      repeatCount="indefinite"
      path={path}
      {...(rotate ? { rotate: reverse ? "auto-reverse" : "auto" } : {})}
      {...(reverse ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})}
    />
  );
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={24} style={{ opacity: connectionAnimation !== "classic" && hideConnectionLine && !selected ? 0 : 1 }} className={`pulse-edge${selected ? " selected" : ""}${lit ? " constellation" : ""}${beat ? " beat" : ""}`} />
      {connectionAnimation !== "classic" ? (pulse || lit || beat) && (
        <ConnectionAnimation path={path} effect={connectionAnimation} options={connectionEffect} active={beat || lit} reverse={reverse} emphasized={!!selected || lit} paused={paused || reduce} />
      ) : beat && !paused && !reduce ? (
        // Beat: uma fila de setas ► correndo no sentido do que acabou de ser enviado.
        BEAT_DOTS.map((delay) => (
          <g key={`${reverse ? "r" : "f"}${delay}`} className="pulse-dot beat">
            <polygon points="-6,-6 7,0 -6,6" className="pulse-halo" />
            <polygon points="-3.5,-3.5 4.5,0 -3.5,3.5" />
            {motion(`${CONNECTION_TIMING.active}s`, `-${delay}s`, "auto")}
          </g>
        ))
      ) : connectionAnimation === "classic" && (pulse || lit) && !paused && !reduce && (
        // Halo em vez de filter: drop-shadow, que era recalculado a cada quadro em cada bolinha.
        <g className={`pulse-dot${lit ? " constellation" : ""}`}>
          <circle r={lit ? 7 : 6} className="pulse-halo" />
          <circle r={lit ? 4 : 3} />
          {motion(lit ? "0.9s" : `${CONNECTION_TIMING.idle}s`)}
        </g>
      )}
    </>
  );
}
