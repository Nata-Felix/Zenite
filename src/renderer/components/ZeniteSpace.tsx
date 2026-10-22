import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Edge } from "@xyflow/react";
import type { CanvasFlowNode } from "../nodes";
import type { OrbitPlan } from "../useZeniteOrbit";

const PALETTE = ["#aea18a", "#d88257", "#348eb6", "#c75d39", "#d5ac7e", "#dec78f", "#6dc8d2", "#5c85cc"];

function texture(index: number, sun: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = index + 31;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = sun ? "#ffc448" : PALETTE[index % 8];
  ctx.fillRect(0, 0, 512, 256);
  const gas = !sun && index % 8 >= 4;
  if (gas) {
    for (let y = 0; y < 256;) {
      const height = 3 + random() * 18;
      ctx.fillStyle = random() > .5 ? `rgba(255,235,195,${.15 + random() * .3})` : `rgba(75,50,35,${random() * .24})`;
      ctx.fillRect(0, y, 512, height); y += height;
    }
  }
  for (let i = 0; i < (sun ? 1800 : gas ? 70 : 180); i++) {
    const x = random() * 512, y = random() * 256;
    const r = sun ? 1 + random() * 5 : 2 + random() * 17;
    ctx.fillStyle = sun ? (i % 2 ? "#ff8d272c" : "#fff1a340") : index % 8 === 2 ? ["#70a948", "#a8be6a", "#d9eff066"][i % 3] : (i % 2 ? "#49362f30" : "#fff1cb25");
    ctx.beginPath(); ctx.ellipse(x, y, r * (gas ? 5 : 1.4), r, random(), 0, Math.PI * 2); ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function glowTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "#fff6c3"); gradient.addColorStop(.24, "#ffda6bd0");
  gradient.addColorStop(.5, "#ff9b3438"); gradient.addColorStop(1, "#ff7e0000");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export default function ZeniteSpace({ plan, nodes, edges, onClose }: { plan: OrbitPlan; nodes: CanvasFlowNode[]; edges: Edge[]; onClose(): void }) {
  const mount = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  const [error, setError] = useState(false);
  const reset = useRef<() => void>(() => {});
  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.className = "zenite-space-webgl";
    renderer.domElement.setAttribute("aria-label", "Sistema solar 3D. Arraste para girar a câmera e use a roda para aproximar.");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050914");
    const extent = Math.max(36, (plan.rings.at(-1)?.radius ?? 300) / 10);
    const camera = new THREE.PerspectiveCamera(42, 1, .5, extent * 35);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .065;
    controls.minDistance = 28; controls.maxDistance = extent * 8;
    controls.maxPolarAngle = Math.PI * .92;
    controls.autoRotate = true; controls.autoRotateSpeed = .18;
    let cameraAutoRotate = true;
    const stopAutoRotate = () => { cameraAutoRotate = false; };
    controls.addEventListener("start", stopAutoRotate);
    const home = () => {
      const angle = Math.min(THREE.MathUtils.degToRad(camera.fov), 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      const distance = (extent + 9) / Math.sin(angle / 2) * 1.08;
      camera.position.set(.18, .72, 1).normalize().multiplyScalar(distance);
      controls.target.set(0, 0, 0); controls.update();
    };
    reset.current = home;
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    };
    resize(); home();
    const observer = new ResizeObserver(resize); observer.observe(host);
    scene.add(new THREE.AmbientLight("#96b7e8", .55));
    scene.add(new THREE.PointLight("#ffdfaa", 3.5, 0, 0));
    const stars = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const a = i * 2.399963, y = 1 - 2 * (i + .5) / 1800;
      const radius = extent * (9 + (i % 7) * .15), r = Math.sqrt(1 - y * y);
      stars.set([Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius], i * 3);
    }
    const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: "#c2d4f5", size: 1.1, sizeAttenuation: false, transparent: true, opacity: .65 })));
    const orbitRotation = (i: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(i * .9) * .075, 0, Math.cos(i * .8) * .045));
    const rotationFor = new Map<string, THREE.Quaternion>();
    plan.rings.forEach((ring, index) => {
      const rotation = orbitRotation(index);
      const points = Array.from({ length: 256 }, (_, i) => new THREE.Vector3(Math.cos(i / 256 * Math.PI * 2) * ring.radius / 10, 0, Math.sin(i / 256 * Math.PI * 2) * ring.radius / 10).applyQuaternion(rotation));
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: index % 2 ? "#548bc1" : "#94cae6", transparent: true, opacity: .48 })));
      ring.ids.forEach(id => rotationFor.set(id, rotation));
    });
    const bodies = new Map<string, { mesh: THREE.Mesh; group: THREE.Group; label: HTMLSpanElement; radius: number }>();
    for (const [id, body] of plan.bodies) {
      const radius = body.diameter / 20;
      const map = texture(body.index, body.sun);
      const material = body.sun ? new THREE.MeshBasicMaterial({ map, color: "#fff2a5" }) : new THREE.MeshStandardMaterial({ map, roughness: .87, metalness: .02, bumpMap: map, bumpScale: .13 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material);
      mesh.rotation.z = body.sun ? .12 : .15 + body.index * .07;
      const group = new THREE.Group(); group.add(mesh); scene.add(group);
      const label = document.createElement("span");
      label.className = `zenite-space-label${body.sun ? " sun" : ""}`;
      label.dataset.body = id;
      const node = nodes.find(n => n.id === id);
      label.textContent = node?.data.terminal?.title ?? node?.data.element?.title ?? id;
      host.appendChild(label);
      bodies.set(id, { mesh, group, label, radius });
      if (body.sun) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .65 }));
        glow.scale.setScalar(radius * 5.5); group.add(glow);
      } else if (body.index % 8 === 5) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.05, 96), new THREE.MeshStandardMaterial({ color: "#cdbd8e", transparent: true, opacity: .72, side: THREE.DoubleSide, roughness: 1 }));
        ring.rotation.x = Math.PI / 2 - .24; ring.rotation.y = .3; group.add(ring);
      }
    }
    const links = edges.filter(e => !e.hidden && bodies.has(e.source) && bodies.has(e.target));
    const linkPositions = new Float32Array(links.length * 6);
    const linkGeometry = new THREE.BufferGeometry(); linkGeometry.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3));
    const connections = new THREE.LineSegments(linkGeometry, new THREE.LineBasicMaterial({ color: "#9c9bda", transparent: true, opacity: .25, depthWrite: false }));
    connections.frustumCulled = false; scene.add(connections);
    const pulsePositions = new Float32Array(links.length * 3);
    const pulseGeometry = new THREE.BufferGeometry(); pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
    const pulses = new THREE.Points(pulseGeometry, new THREE.PointsMaterial({ color: "#b7b9ff", size: 2.5, sizeAttenuation: false, transparent: true, opacity: .8 }));
    pulses.frustumCulled = false; scene.add(pulses);
    const projected = new THREE.Vector3(), offset = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
    const direction = new THREE.Vector3(), closest = new THREE.Vector3();
    const sunRadius = bodies.get(plan.sunId)?.radius ?? 11.5;
    let elapsed = 0, previous = 0, frame = 0, wasPaused = paused.current;
    const animate = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      if (!document.hidden) {
        if (!paused.current) elapsed += delta;
        controls.autoRotate = cameraAutoRotate && !paused.current;
        if (paused.current !== wasPaused) {
          // Descarta a inércia da rotação automática ao pausar.
          controls.enableDamping = false; controls.update(0); controls.enableDamping = true;
          wasPaused = paused.current;
        }
        controls.update(delta);
        for (const [id, body] of bodies) {
          const slot = plan.slots.get(id);
          if (slot) {
            const angle = slot.angle + elapsed * slot.speed;
            body.group.position.set(Math.cos(angle) * slot.radius / 10, 0, Math.sin(angle) * slot.radius / 10).applyQuaternion(rotationFor.get(id)!);
          }
          if (!paused.current) body.mesh.rotation.y += delta * .12;
        }
        links.forEach((edge, i) => {
          const a = bodies.get(edge.source)!, b = bodies.get(edge.target)!;
          direction.subVectors(b.group.position, a.group.position).normalize();
          from.copy(a.group.position).addScaledVector(direction, a.radius);
          to.copy(b.group.position).addScaledVector(direction, -b.radius);
          from.toArray(linkPositions, i * 6); to.toArray(linkPositions, i * 6 + 3);
          projected.lerpVectors(from, to, (elapsed * .16 + i * .27) % 1).toArray(pulsePositions, i * 3);
        });
        linkGeometry.attributes.position.needsUpdate = true; pulseGeometry.attributes.position.needsUpdate = true;
        const width = host.clientWidth, height = host.clientHeight;
        for (const [id, body] of bodies) {
          projected.copy(body.group.position).project(camera);
          // Esconde rótulos que estejam atrás do Sol, junto com seus planetas.
          direction.subVectors(body.group.position, camera.position);
          const along = -camera.position.dot(direction) / direction.lengthSq();
          closest.copy(camera.position).addScaledVector(direction, along);
          const occluded = id !== plan.sunId && along > 0 && along < 1 && closest.length() < sunRadius;
          body.label.hidden = projected.z > 1 || projected.z < -1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1 || occluded;
          offset.copy(body.group.position).addScaledVector(camera.up, -body.radius * 1.5 - 1).project(camera);
          body.label.style.transform = `translate(-50%, 0) translate3d(${(projected.x * .5 + .5) * width}px,${(-offset.y * .5 + .5) * height}px,0)`;
        }
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const lost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(frame); setError(true); };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        const renderable = object as THREE.Mesh;
        if (renderable.geometry) geometries.add(renderable.geometry);
        if (renderable.material) for (const mat of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
          materials.add(mat);
          for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      renderer.dispose(); renderer.forceContextLoss();
      host.replaceChildren();
      reset.current = () => {};
    };
  }, [plan, nodes, edges]);

  return <section className="zenite-space" aria-label="Zênite 3D" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <div className="zenite-space-stage" ref={mount} />
    {error && <div className="zenite-space-error" role="alert">Não foi possível abrir a cena 3D nesta janela.<button onClick={onClose}>Voltar ao canvas</button></div>}
    <div className="zenite-space-controls">
      <span>Arraste para girar · Roda para aproximar</span>
      <button aria-label={isPaused ? "Continuar órbitas" : "Pausar órbitas"} title={isPaused ? "Continuar órbitas" : "Pausar órbitas"} onClick={() => { paused.current = !paused.current; setPaused(paused.current); }}>{isPaused ? <Play size={16} /> : <Pause size={16} />}</button>
      <button aria-label="Restaurar câmera" title="Restaurar câmera" onClick={() => reset.current()}><RotateCcw size={16} /></button>
      <button aria-label="Sair do Zênite" title="Voltar ao canvas (Esc)" onClick={onClose}><X size={16} /></button>
    </div>
  </section>;
}
