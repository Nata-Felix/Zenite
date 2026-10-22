import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Edge } from "@xyflow/react";
import type { CanvasFlowNode } from "./nodes";

export function useZeniteOrbit(nodes: CanvasFlowNode[], edges: Edge[], dark: boolean) {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState(false);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) cancelHold();
    };
    window.addEventListener("pointermove", move, true);
    for (const name of ["pointerup", "pointercancel", "blur", "wheel", "keydown"]) window.addEventListener(name, cancelHold, true);
    return () => {
      cancelHold();
      window.removeEventListener("pointermove", move, true);
      for (const name of ["pointerup", "pointercancel", "blur", "wheel", "keydown"]) window.removeEventListener(name, cancelHold, true);
    };
  }, []);
  const onPointerDown = (e: ReactPointerEvent) => {
    cancelHold();
    const target = e.target as Element;
    if (unlocked || !dark || e.button !== 0 || !target.matches(".react-flow__pane")) return;
    hold.current = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      hold.current = null;
      setUnlocked(true);
    }, 10_000) };
  };
  const plan = useMemo(() => {
    if (!active) return null;
    const visible = nodes.filter(n => !n.className?.includes("black-hole-contained") && n.type !== "draw");
    const sun = visible.find(n => n.data.terminal?.sun) ?? visible.find(n => n.data.terminal) ?? visible[0];
    if (!sun) return null;
    const cx = sun.position.x + (sun.width ?? 168) / 2;
    const cy = sun.position.y + (sun.data.terminal?.sun ? 59 : 44);
    const distance = new Map([[sun.id, 0]]);
    const adjacent = new Map(visible.map(n => [n.id, new Set<string>()]));
    for (const edge of edges) {
      adjacent.get(edge.source)?.add(edge.target);
      adjacent.get(edge.target)?.add(edge.source);
    }
    const queue = [sun.id];
    for (let i = 0; i < queue.length; i++) for (const id of adjacent.get(queue[i]) ?? []) {
      if (!adjacent.has(id) || distance.has(id)) continue;
      distance.set(id, distance.get(queue[i])! + 1);
      queue.push(id);
    }
    const planets = visible.filter(n => n.id !== sun.id).sort((a, b) => (distance.get(a.id) ?? 999) - (distance.get(b.id) ?? 999) || a.id.localeCompare(b.id));
    const rings: { radius: number; ids: string[] }[] = [];
    const spacing = 170;
    let lastDistance = 0;
    for (const planet of planets) {
      const depth = distance.get(planet.id) ?? 999;
      let ring = rings.at(-1);
      // Mesmo vizinhos diretos ocupam vários anéis; os mais distantes ficam fora.
      if (!ring || ring.ids.length >= Math.min(8, Math.max(1, Math.ceil(planets.length / 3)), 4 + rings.length) || depth !== lastDistance) {
        ring = { radius: 260 + spacing * rings.length, ids: [] };
        rings.push(ring);
      }
      ring.ids.push(planet.id);
      lastDistance = depth;
    }
    const slots = new Map(rings.flatMap((ring, index) => ring.ids.map((id, i) => [id, {
      radius: ring.radius, angle: i * Math.PI * 2 / ring.ids.length + index * 0.73,
      speed: 0.13 / Math.pow(index + 1, 0.65),
    }] as const)));
    const bodies = new Map(planets.map((n, i) => [n.id, { diameter: [54, 74, 80, 64, 112, 98, 86, 78][i % 8], index: i, sun: false }]));
    bodies.set(sun.id, { diameter: 230, index: 0, sun: true });
    return { cx, cy, rings, slots, bodies, sunId: sun.id };
  }, [active, nodes, edges]);
  return { unlocked, active, setActive, onPointerDown, plan };
}

export type OrbitPlan = NonNullable<ReturnType<typeof useZeniteOrbit>["plan"]>;
