import { useEffect, useRef, useState, type ReactNode } from "react";
import { SCREEN_WIDTH, useItemPrefs } from "../itemPrefs";

/**
 * Tela emulada dos cartões (site, terminal, nota...): com 720p ou 1080p nas Configurações, o
 * conteúdo é desenhado como num monitor dessa largura (1280 ou 1920 px, altura na proporção do
 * cartão) e reduzido para caber, em vez de espremido no tamanho do cartão. Cartão mais largo que
 * a tela escolhida fica como está. O mouse continua certo: o navegador e o terminal (TerminalView)
 * descontam a escala.
 */
export function ScreenFrame({ children }: { children: ReactNode }) {
  const { screen } = useItemPrefs();
  const width = SCREEN_WIDTH[screen];
  const outer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = outer.current;
    if (!el || !width) return;
    const measure = () => setSize((s) => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  const scale = width && size && size.w > 0 && size.w < width ? size.w / width : 0;
  return (
    <div ref={outer} className="screen-frame">
      <div
        className={`screen-inner${scale ? " emulated" : ""}`}
        style={scale ? { width, height: size!.h / scale, transform: `scale(${scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
