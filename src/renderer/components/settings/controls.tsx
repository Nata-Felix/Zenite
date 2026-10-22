import type { ReactNode } from "react";

/** Linha de configuração: nome, explicação e o controle à direita. */
export function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? " on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <select className="setting-select" aria-label={label} value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}>
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
