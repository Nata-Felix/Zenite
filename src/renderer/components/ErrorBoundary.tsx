import { Component, type ReactNode } from "react";

interface Props {
  /** O que mostrar no lugar do conteúdo quando ele falha. */
  fallback(error: Error, retry: () => void): ReactNode;
  children: ReactNode;
}

/** Isola falhas: um componente com erro não derruba o resto da interface. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[Zênite] falha na interface:", error);
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children;
  }
}
