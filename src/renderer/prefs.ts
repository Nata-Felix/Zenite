/** Preferências de interface (barra recolhida, minimapa). Falhar ao ler/gravar não é grave. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`o.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`o.${key}`, JSON.stringify(value));
  } catch {
    // Sem armazenamento: a preferência vale só nesta sessão.
  }
}
