import { webFrame } from "electron";

/**
 * Chave de acesso (passkey/WebAuthn) só com um clique do usuário. Sem isso, um site do canvas que
 * carrega sozinho ao abrir o Zênite (ex.: o login da Meta) abria a janela "Segurança do Windows ·
 * Escolher uma chave de acesso" toda vez. Sem clique recente, o pedido é recusado como se o usuário
 * tivesse cancelado (NotAllowedError), e o site cai no login por senha.
 *
 * Roda no mundo da página (não no isolado do preload), antes dos scripts dela, e o CSP do site não
 * bloqueia porque não é um <script> inserido.
 */
const GUARD = `(() => {
  const proto = window.CredentialsContainer && CredentialsContainer.prototype;
  if (!proto || proto.__zenitePasskeyGuard) return;
  Object.defineProperty(proto, "__zenitePasskeyGuard", { value: true });
  const clicked = () => !!(navigator.userActivation && navigator.userActivation.isActive);
  for (const name of ["get", "create"]) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = function (options) {
      if (options && options.publicKey && !clicked()) {
        return Promise.reject(new DOMException("Chave de acesso bloqueada pelo Zênite: só com um clique.", "NotAllowedError"));
      }
      return original.call(this, options);
    };
  }
})();`;

export function installPasskeyGuard(): void {
  void webFrame.executeJavaScript(GUARD).catch(() => {});
}
