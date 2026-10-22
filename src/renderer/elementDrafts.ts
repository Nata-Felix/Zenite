import { useCallback, useEffect, useRef } from "react";

const FLUSH = "zenite:flush-elements";

/** Antes de copiar/recortar, manda ao processo principal até a última tecla digitada. */
export function flushElementDrafts(): void {
  window.dispatchEvent(new Event(FLUSH));
}

export function useBufferedElementWrite<T>(id: string, write: (value: T) => void): (value: T) => void {
  const writer = useRef(write);
  writer.current = write;
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    const { value } = pending.current;
    pending.current = null;
    writer.current(value);
  }, []);
  useEffect(() => {
    window.addEventListener(FLUSH, flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener(FLUSH, flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [id, flush]);
  return (value) => {
    pending.current = { value };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  };
}
