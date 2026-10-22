/**
 * Um único ouvinte de IPC distribui a saída de cada PTY para o terminal visível.
 * Terminais fora da tela (outro workspace) não têm ouvinte: o processo principal
 * guarda o histórico e o devolve quando o terminal volta a ser exibido.
 */
type DataHandler = (data: string) => void;
type ExitHandler = (code: number) => void;

const dataHandlers = new Map<string, DataHandler>();
const exitHandlers = new Map<string, ExitHandler>();

window.o.pty.onData((id, data) => dataHandlers.get(id)?.(data));
window.o.pty.onExit((id, code) => exitHandlers.get(id)?.(code));

export function attach(id: string, onData: DataHandler, onExit: ExitHandler): () => void {
  dataHandlers.set(id, onData);
  exitHandlers.set(id, onExit);
  return () => {
    if (dataHandlers.get(id) === onData) dataHandlers.delete(id);
    if (exitHandlers.get(id) === onExit) exitHandlers.delete(id);
  };
}
