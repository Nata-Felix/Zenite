import { memo, useEffect, useRef, useState } from "react";
import { Columns3, Rows3, X } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CanvasFlowNode } from "../nodes";
import { ElementShell } from "./ElementShell";
import { useBufferedElementWrite } from "../elementDrafts";

/** Enquanto o usuário digita, mudanças vindas de agentes esperam esse tempo. */
const TYPING_GRACE_MS = 1000;

/** Tabela editável. A linha 1 é o cabeçalho. Agentes ligados leem e editam com `zn table`. */
function TableNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element!;
  const [rows, setRows] = useState<string[][] | null>(null);
  const [flash, setFlash] = useState(false);
  const lastTyped = useRef(0);
  const save = useBufferedElementWrite<string[][]>(element.id, (value) => window.o.elements.writeTable(element.id, value));
  const grid = useRef<HTMLTableElement>(null);

  useEffect(() => {
    let alive = true;
    window.o.elements.readTable(element.id).then((r) => alive && setRows(r));
    const off = window.o.elements.onTableChanged((id, next) => {
      if (id !== element.id) return;
      const apply = () => {
        setRows(next);
        setFlash(true);
        setTimeout(() => setFlash(false), 900);
      };
      const wait = TYPING_GRACE_MS - (Date.now() - lastTyped.current);
      if (wait > 0) setTimeout(apply, wait);
      else apply();
    });
    return () => {
      alive = false;
      off();
    };
  }, [element.id]);

  const commit = (next: string[][], typing = false) => {
    if (typing) lastTyped.current = Date.now();
    setRows(next);
    save(next);
  };

  const cols = rows?.[0]?.length ?? 0;
  const setCell = (r: number, c: number, value: string) => commit(rows!.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)), true);
  const addRow = () => commit([...rows!, Array(cols).fill("")]);
  const addCol = () => commit(rows!.map((row, i) => [...row, i === 0 ? `Coluna ${cols + 1}` : ""]));
  const removeRow = (r: number) => rows!.length > 1 && commit(rows!.filter((_, i) => i !== r));
  const removeCol = (c: number) => cols > 1 && commit(rows!.map((row) => row.filter((_, j) => j !== c)));

  /** Enter desce uma linha (cria uma nova no fim), como numa planilha. */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    e.preventDefault();
    const focus = () => grid.current?.querySelector<HTMLInputElement>(`input[data-cell="${r + 1}:${c}"]`)?.focus();
    if (r + 1 >= rows!.length) {
      addRow();
      setTimeout(focus, 0);
    } else focus();
  };

  const header = rows && (
    <>
      <button className="icon-button nodrag" title="Adicionar linha" onClick={addRow}>
        <Rows3 size={13} />
      </button>
      <button className="icon-button nodrag" title="Adicionar coluna" onClick={addCol}>
        <Columns3 size={13} />
      </button>
    </>
  );

  return (
    <ElementShell element={element} actions={data.actions} selected={!!selected} header={header} minWidth={240} minHeight={120}>
      {!rows ? (
        <div className="file-empty">Carregando…</div>
      ) : (
        <div className={`table-wrap nodrag nowheel${flash ? " flash" : ""}`}>
          <table ref={grid} className="table-grid">
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className={r === 0 ? "table-head" : ""}>
                  {row.map((value, c) => (
                    <td key={c}>
                      <input data-cell={`${r}:${c}`} value={value} spellCheck={false} onChange={(e) => setCell(r, c, e.target.value)} onKeyDown={(e) => onKey(e, r, c)} />
                      {r === 0 && cols > 1 && (
                        <button className="table-remove col" title="Remover coluna" tabIndex={-1} onClick={() => removeCol(c)}>
                          <X size={10} />
                        </button>
                      )}
                    </td>
                  ))}
                  <td className="table-row-tools">
                    {r > 0 && (
                      <button className="table-remove" title="Remover linha" tabIndex={-1} onClick={() => removeRow(r)}>
                        <X size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ElementShell>
  );
}

export const TableNode = memo(TableNodeImpl);
