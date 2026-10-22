/**
 * Identificação (User-Agent) dos sites abertos no Zênite: a do Chrome, sem o nome do app nem
 * "Electron". O Electron põe o nome do app nela, e "Zênite" tem acento: o Instagram (e outros
 * servidores estritos) recusa o cabeçalho com "4xx Client Error". O Google recusa login de
 * navegadores que dizem "Electron".
 */
const CHROME_PRODUCTS = new Set(["mozilla", "applewebkit", "chrome", "safari", "mobile", "version"]);

export function cleanUserAgent(ua: string): string {
  return ua
    .split(/\s+/)
    .filter((token) => {
      // Nada fora do ASCII num cabeçalho HTTP.
      if (!/^[\x21-\x7e]+$/.test(token)) return false;
      // "(Windows NT 10.0; Win64; x64)" e "(KHTML, like Gecko)" não têm "/": ficam.
      const slash = token.indexOf("/");
      if (slash < 0 || token.startsWith("(")) return true;
      return CHROME_PRODUCTS.has(token.slice(0, slash).toLowerCase());
    })
    .join(" ");
}
