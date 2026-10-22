/** Abrir o app por um lançador que termina não pode derrubá-lo quando o canal de logs fecha. */
export function protectOutputStreams(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") throw error;
    });
  }
}
