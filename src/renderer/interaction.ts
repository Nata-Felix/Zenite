// Arrastos em andamento no canvas (mover a tela, mover ou redimensionar um elemento).
// Enquanto houver algum, <body> ganha a classe "canvas-busy": os sites (<webview>) deixam de
// capturar o mouse. Um webview roda em outro processo; se o cursor passa por cima dele no meio
// do arraste, o app para de receber o movimento e o arraste "trava" no lugar.
const active = new Set<string>();

export function setInteracting(kind: string, on: boolean): void {
  if (on) active.add(kind);
  else active.delete(kind);
  document.body.classList.toggle("canvas-busy", active.size > 0);
}

/** Para o <NodeResizer>: marca o redimensionamento e repassa os avisos opcionais. */
export function resizeGuard(onStart?: () => void, onEnd?: () => void) {
  return {
    onResizeStart: () => {
      setInteracting("resize", true);
      onStart?.();
    },
    onResizeEnd: () => {
      setInteracting("resize", false);
      onEnd?.();
    },
  };
}
