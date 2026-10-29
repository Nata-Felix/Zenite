// Arquivos importados pelo Vite viram a URL do arquivo no build.
declare module "*.svg" {
  const url: string;
  export default url;
}

// CSS de biblioteca carregado sob demanda (import("katex/dist/katex.min.css")): só o efeito.
declare module "*.css";
