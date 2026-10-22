import { useState } from "react";
import { CONNECTION_EFFECTS, CONNECTION_TIMING, type EffectOptions } from "../../connectionEffects";
import { setCanvasPrefs, useCanvasPrefs } from "../../canvasPrefs";
import { ConnectionAnimation, useReducedMotion } from "../ConnectionAnimation";
import { Choice, SettingRow, Switch } from "./controls";

const PATH = "M 30 64 C 110 64 210 26 290 26";
export function ConnectionEffects() {
  const prefs = useCanvasPrefs(), reduce = useReducedMotion();
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [active, setActive] = useState(false);
  const definition = CONNECTION_EFFECTS.find((effect) => effect.id === prefs.connectionAnimation);
  const update = (patch: Partial<EffectOptions>) => setCanvasPrefs({ connectionEffect: { ...prefs.connectionEffect, ...patch } });
  return <>
    <SettingRow label="Animação da ligação" hint="Segue a direção das mensagens e desacelera após o envio.">
      <Choice label="Animação da ligação" value={prefs.connectionAnimation} onChange={(connectionAnimation) => setCanvasPrefs({ connectionAnimation })}
        options={[{ value: "classic", label: "Clássica (pulso e setas)" }, ...CONNECTION_EFFECTS.map(({ id, label }) => ({ value: id, label }))]} />
    </SettingRow>
    {definition && <SettingRow label="Ocultar linha de base" hint="Mostra apenas o efeito. Ao selecionar a ligação, o traço aparece para destacá-la.">
      <Switch label="Ocultar linha de base" checked={prefs.hideConnectionLine} onChange={(hideConnectionLine) => setCanvasPrefs({ hideConnectionLine })} />
    </SettingRow>}
    <div className="connection-preview">
      <div className="connection-preview-heading"><span>{definition?.label ?? "Pulso clássico"}</span><span className="connection-preview-state" aria-live="polite">{reduce ? "Movimento reduzido" : active ? "Transmitindo" : "Em repouso"} {direction === "forward" ? "→" : "←"}</span></div>
      <svg viewBox="0 0 320 96" role="img" aria-label={`Prévia: ${definition?.label ?? "pulso clássico"}`}>
        <path d={PATH} className="connection-preview-path" opacity={definition && prefs.hideConnectionLine ? 0 : 1} />
        {definition ? <ConnectionAnimation path={PATH} effect={definition.id} options={prefs.connectionEffect} active={active} reverse={direction === "reverse"} /> : !reduce && <circle r="3" className="connection-preview-classic"><animateMotion key={`${direction}-${active}`} path={PATH} dur={`${active ? CONNECTION_TIMING.active : CONNECTION_TIMING.idle}s`} repeatCount="indefinite" {...(direction === "reverse" ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" as const } : {})} /></circle>}
        <circle cx="30" cy="64" r="9" className="connection-preview-node" /><circle cx="290" cy="26" r="9" className="connection-preview-node" />
        <text x="30" y="86" textAnchor="middle">A</text><text x="290" y="52" textAnchor="middle">B</text>
      </svg>
      <p>{definition?.description ?? "Uma bolinha em repouso e setas no sentido do envio."}</p>
      <div className="connection-preview-actions" role="group" aria-label="Testar animação">
        <button type="button" className="ghost small" aria-pressed={active && direction === "forward"} onClick={() => { setDirection("forward"); setActive(true); }}>A → B</button>
        <button type="button" className="ghost small" aria-pressed={active && direction === "reverse"} onClick={() => { setDirection("reverse"); setActive(true); }}>B → A</button>
        <button type="button" className="ghost small" onClick={() => setActive(false)}>Parar</button>
      </div>
    </div>
    {definition && <>
      <SettingRow label="Cor da animação">
        <input type="color" aria-label="Cor da animação" value={prefs.connectionEffect.color || definition.color} onChange={(event) => update({ color: event.target.value })} />
        <button type="button" className="ghost small" disabled={!prefs.connectionEffect.color} onClick={() => update({ color: "" })}>Do efeito</button>
      </SettingRow>
      <SettingRow label="Velocidade de transmissão">
        <input aria-label="Velocidade de transmissão" type="range" min="0.2" max="4" step="0.1" value={prefs.connectionEffect.activeSpeed} onChange={(event) => update({ activeSpeed: Number(event.target.value) })} />
        <output className="connection-speed">{prefs.connectionEffect.activeSpeed.toFixed(1)}×</output>
      </SettingRow>
      <SettingRow label="Velocidade em repouso" hint="Zero mantém as partículas paradas entre os envios.">
        <input aria-label="Velocidade em repouso" type="range" min="0" max="3" step="0.1" value={prefs.connectionEffect.idleSpeed} onChange={(event) => update({ idleSpeed: Number(event.target.value) })} />
        <output className="connection-speed">{prefs.connectionEffect.idleSpeed.toFixed(1)}×</output>
      </SettingRow>
    </>}
  </>;
}
