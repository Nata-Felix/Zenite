/** Aceita #RGB, #RRGGBB e as mesmas formas sem o #. */
export function normalizeAccentHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  return `#${(hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex).toLowerCase()}`;
}

/** Escolhe texto claro ou escuro pelo maior contraste com a cor escolhida. */
export function accentTextColor(hex: string): string {
  const luminance = (color: string) => {
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const background = luminance(hex), dark = "#000000";
  return (background + 0.05) / (luminance(dark) + 0.05) >= 1.05 / (background + 0.05) ? dark : "#ffffff";
}
