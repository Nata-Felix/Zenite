import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eclipse, Search, TerminalSquare, X } from "lucide-react";
import { ELEMENT_STYLE } from "../nodes";

export function BlackHoleDialog({ title, members, choices, onSave, onClose }: {
  title: string; members: string[]; choices: { id: string; title: string; kind?: string; group?: string }[];
  onSave(ids: string[]): void; onClose(): void;
}) {
  const [chosen, setChosen] = useState(new Set(members));
  const [filter, setFilter] = useState("");
  const root = useRef<HTMLFormElement>(null);
  const visible = choices.filter(c => c.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="dialog-backdrop" onMouseDown={onClose}>
    <form ref={root} className="dialog black-hole-dialog" role="dialog" aria-modal="true" aria-labelledby="black-hole-dialog-title"
      onMouseDown={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); onSave([...chosen]); }} onKeyDown={e => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        if (e.key === "Tab") {
          const focusable = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])];
          const first = focusable[0], last = focusable.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="black-hole-dialog-header"><div className="black-hole-dialog-emblem"><Eclipse size={26} /></div><div><span className="black-hole-eyebrow">ORGANIZAR PASTA</span><h2 id="black-hole-dialog-title">{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
      <p className="dialog-text">Guarde elementos sem interromper o trabalho. As conexões passam pelo Buraco negro e os aplicativos continuam ativos.</p>
      <label className="black-hole-search"><Search size={17} /><input aria-label="Buscar elemento" type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar terminal, site ou elemento…" /></label>
      <div className="black-hole-list-heading"><span>ELEMENTOS DO CANVAS</span><span>{visible.length} disponíveis</span></div>
      <div className="black-hole-choices">
        {visible.map(c => { const Icon = ELEMENT_STYLE[c.kind as keyof typeof ELEMENT_STYLE]?.icon ?? TerminalSquare; return <label key={c.id} className={chosen.has(c.id) ? "chosen" : ""}>
          <span className="black-hole-choice-icon"><Icon size={19} /></span>
          <span className="black-hole-choice-text">{c.title}<small>{c.group ? `Mover de ${c.group}` : chosen.has(c.id) ? "Dentro desta pasta" : "No canvas"}</small></span>
          <input type="checkbox" checked={chosen.has(c.id)} onChange={e => setChosen(old => { const next = new Set(old); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })} />
        </label>; })}
        {!choices.length && <p className="dialog-hint">Adicione elementos ao canvas para agrupá-los.</p>}
        {!!choices.length && !visible.length && <p className="dialog-hint" role="status">Nenhum elemento encontrado para esta busca.</p>}
      </div>
      <p className="dialog-hint">Você também pode arrastar elementos ou uma seleção até o ícone. Desmarcar apenas retira da pasta.</p>
      <footer className="black-hole-dialog-footer"><span role="status"><strong>{chosen.size}</strong> selecionados</span><div className="dialog-actions"><button className="ghost" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Guardar elementos</button></div></footer>
    </form>
  </div>, document.body);
}
